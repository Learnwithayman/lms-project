const cron = require('node-cron');
const { getUpcomingClasses } = require('./calendarBot');
const { sendMessage } = require('./whatsappBot');
const { classIsStudents } = require('./classMatch'); // ⏸️ Step 3: match classes to paused students (👪 sibling-safe, 22 Nov)
const ClassSession = require('../models/ClassSession'); 
const User = require('../models/User');
const { joinLinkFor, zoomLines } = require('./zoomInfo'); // 🆔 Step 21: Meeting ID + passcode
 
console.log('✅ Dual-Group Cron jobs initialized. Listening for upcoming classes...');
 
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
 
// ✨ NEW: The "Special Character" Shield! 
// This stops parentheses, brackets, or dashes in your class titles from breaking the database search.
const escapeRegex = (text) => {
  if (!text) return "";
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
};

// ==========================================
// ⏰ STEP 27 (26 Nov): REMINDERS CATCH UP
// Before, each reminder was tried ONLY in the exact minute it was due (60 min before, 3 min after the start,
// 50 min after the end). If that one run failed (calendar / database not answering) or was skipped, the
// reminder was lost for good. Now each reminder has a window and is sent by the first run that works inside it.
// It is never sent twice: this server remembers what it sent, and the saved message queue (QueuedMessage) is
// checked too, so a restart (or the switch to this version) does not repeat a reminder that already went out.
// ==========================================
const WINDOWS = { hour: [30, 60], late: [-10, -3], forgot: [50, 90] };
const handled = new Map(); // key → time it was handled (memory of this server process)
const QueuedMessage = require('../models/QueuedMessage');

const reminderKey = (cls, kind, target) => `${cls.id || cls.title}|${new Date(cls.startTime).toISOString()}|${kind}|${target}`;
// true = this reminder should be sent now (and it is marked as handled before sending)
const firstTime = async (cls, kind, target, textPattern, sinceMs) => {
  const key = reminderKey(cls, kind, target);
  if (handled.has(key)) return false;
  handled.set(key, Date.now()); // marked first, so two overlapping runs never both send it
  let already;
  try {
    already = await QueuedMessage.findOne({
      recipient: target,
      createdAt: { $gte: new Date(sinceMs) },
      $and: [{ messageBody: { $regex: escapeRegex(`*${cls.title}*`) } }, { messageBody: { $regex: textPattern } }]
    }).select('_id').lean();
  } catch (error) {
    handled.delete(key); // database not answering: try again next minute
    throw error;
  }
  return !already;
};
const markHandled = (cls, kind, target) => handled.set(reminderKey(cls, kind, target), Date.now());
const forgetOld = () => { const cut = Date.now() - 12 * 60 * 60 * 1000; for (const [k, t] of handled) if (t < cut) handled.delete(k); };
 
cron.schedule('* * * * *', async () => {
  try {
    forgetOld(); // ⏰ Step 27
    const classes = await getUpcomingClasses();
    const now = new Date();

    // ⏸️ Step 3: students who are paused or away → no reminders at all for their classes
    const pausedStudents = await User.find({ 'pause.kind': { $in: ['full', 'away'] } }, 'name studentGroupId legacyGroupIds pause');
    // 👪 all students, so a paused sister does not mute her brother's classes when they share one group link
    const allStudents = pausedStudents.length ? await User.find({ role: 'student' }, 'name studentGroupId legacyGroupIds whatsappGroupId') : [];

    for (const cls of classes) {
      if (cls.description && cls.description.toLowerCase().includes('do not send')) {
        console.log(`🚫 Skipped reminders for "${cls.title}" because it is marked as "do not send".`);
        continue;
      }

      if (pausedStudents.length) {
        const pausedOwner = pausedStudents.find((u) => classIsStudents(cls, u, allStudents));
        if (pausedOwner) {
          continue; // ⏸️ Student paused / away: student AND teacher reminders are muted
        }
      }
 
      // ✨ TIME CALCULATORS
      const timeDifferenceMs = cls.startTime - now;
      const minutesUntilStart = Math.round(timeDifferenceMs / (1000 * 60));
      
      // ✨ NEW: Calculate exactly when the class ends
      const classEndTime = cls.endTime ? new Date(cls.endTime) : new Date(cls.startTime.getTime() + (60 * 60 * 1000));
      const minutesSinceEnd = Math.round((now - classEndTime) / (1000 * 60));
 
      const timeString = new Date(cls.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: "Africa/Cairo" });
 
      let teacherSearchTerm = null;
      let studentSearchTerm = null;
      let dbStudentName = null;
 
      if (cls.description) {
        const teacherMatch = cls.description.match(/TeacherGroupLink[\s\S]*?chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);
        if (teacherMatch && teacherMatch[1]) teacherSearchTerm = teacherMatch[1].trim(); 
 
        const studentMatch = cls.description.match(/StudentGroupLink[\s\S]*?chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);
        if (studentMatch && studentMatch[1]) studentSearchTerm = studentMatch[1].trim(); 
 
        const nameMatch = cls.description.match(/StudentGroupName[\s*:-]*([^\n<]+)/i);
        if (nameMatch) dbStudentName = nameMatch[1].trim();
      }
 
      const safeTitle = cls.title ? cls.title.trim() : "NO_TITLE";
 
      // ==========================================
      // 1-HOUR REMINDERS (⏰ Step 27: any run from 60 down to 30 minutes before the class; once per group)
      // ==========================================
      const startMs = new Date(cls.startTime).getTime();
      if (minutesUntilStart <= WINDOWS.hour[1] && minutesUntilStart >= WINDOWS.hour[0]) {
        const startsIn = minutesUntilStart >= 60 ? 'exactly *1 Hour*' : `*${minutesUntilStart} minutes*`;
        if (teacherSearchTerm && await firstTime(cls, 'hour', teacherSearchTerm, 'Teacher Reminder', startMs - 2 * 60 * 60 * 1000)) {
          const teacherMessage = `🔔 *Teacher Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour class *${cls.title}* is starting in ${startsIn}.\n\n🕒 *Time:* ${timeString}\n\n🔗 *Teacher Dashboard:*\nhttps://lms.learnwithayman.com\n\n*Learn With Ayman Admin Team*`;
          await sendMessage(teacherSearchTerm, teacherMessage);
          console.log(`✅ Sent 1-hour Teacher reminder to group code: ${teacherSearchTerm} (${minutesUntilStart} min before)`);
        }

        if (studentSearchTerm && await firstTime(cls, 'hour', studentSearchTerm, 'Class Reminder', startMs - 2 * 60 * 60 * 1000)) {
          const joinLink = await joinLinkFor(cls.zoomLink, teacherSearchTerm); // 🆔 Step 21: the teacher's saved room when the class has no link
          const zoomExtra = await zoomLines(joinLink);
          const studentMessage = `🔔 *Class Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nGet ready! Your class *${cls.title}* is starting in ${startsIn}.\n\n🔗 *Join Here:*\n${joinLink || 'No link provided'}${zoomExtra}\n\n*Learn With Ayman Admin Team*`;
          await sendMessage(studentSearchTerm, studentMessage);
          console.log(`✅ Sent 1-hour Student reminder to group code: ${studentSearchTerm} (${minutesUntilStart} min before)`);
        }
      }

      // ==========================================
      // LATE ALERTS (TEACHER ONLY) (⏰ Step 27: any run from 3 to 10 minutes after the start; once)
      // ==========================================
      if (minutesUntilStart <= WINDOWS.late[1] && minutesUntilStart >= WINDOWS.late[0] && teacherSearchTerm && !handled.has(reminderKey(cls, 'late', teacherSearchTerm))) {
        const threeHoursAgo = new Date(now.getTime() - (3 * 60 * 60 * 1000));

        // ✨ NEW: Using the Escape Shield on our search variables!
        const safeStudentRegex = dbStudentName ? new RegExp(escapeRegex(dbStudentName), 'i') : /NO_STUDENT_NAME/;
        const safeTitleRegex = new RegExp(escapeRegex(safeTitle), 'i');

        const alreadyJoined = await ClassSession.findOne({
          $or: [
            { subject: safeTitleRegex },
            { studentGroupName: safeStudentRegex }
          ],
          startTime: { $gte: threeHoursAgo },
          status: { $in: ['in-progress', 'started', 'completed'] }
        });

        if (alreadyJoined) {
          markHandled(cls, 'late', teacherSearchTerm);
          console.log(`✅ Teacher already joined "${cls.title}". Skipping the late alert!`);
        } else if (await firstTime(cls, 'late', teacherSearchTerm, 'minutes late', startMs - 10 * 60 * 1000)) {
          const lateBy = -minutesUntilStart;
          const lateMessage = `🚨 *Action Required: You are ${lateBy} minutes late!*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour class *${cls.title}* was scheduled to begin at *${timeString}*.\n\nYou are currently ${lateBy} minutes late. Please jump into the room immediately so the student is not left waiting. If you have an emergency, please notify the admin team!\n\n🔗 *Join Class Here:*\n${cls.zoomLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
          await sendMessage(teacherSearchTerm, lateMessage);
          console.log(`🚨 Sent ${lateBy}-minute late alert to group code: ${teacherSearchTerm}`);
        }
      }

      // ==========================================
      // ⏳ "FORGOT TO END CLASS" REMINDER (⏰ Step 27: any run from 50 to 90 minutes after the end; once)
      // ==========================================
      if (minutesSinceEnd >= WINDOWS.forgot[0] && minutesSinceEnd <= WINDOWS.forgot[1] && teacherSearchTerm && !handled.has(reminderKey(cls, 'forgot', teacherSearchTerm))) {
        const twelveHoursAgo = new Date(now.getTime() - (12 * 60 * 60 * 1000));

        // ✨ NEW: Using the Escape Shield here too!
        const safeStudentRegex = dbStudentName ? new RegExp(escapeRegex(dbStudentName), 'i') : /NO_STUDENT_NAME/;
        const safeTitleRegex = new RegExp(escapeRegex(safeTitle), 'i');

        // Check if the class is STILL marked as 'started' (meaning they didn't end it)
        const stillRunning = await ClassSession.findOne({
          $or: [
            { subject: safeTitleRegex },
            { studentGroupName: safeStudentRegex }
          ],
          startTime: { $gte: twelveHoursAgo },
          status: { $in: ['in-progress', 'started'] }
        });

        if (!stillRunning) {
          markHandled(cls, 'forgot', teacherSearchTerm);
          console.log(`✅ Teacher already ended "${cls.title}". Skipping reminder.`);
        } else if (await firstTime(cls, 'forgot', teacherSearchTerm, 'End Class Reminder', classEndTime.getTime())) {
          const forgotMsg = `🔔 *Action Required: End Class Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour class *${cls.title}* ended over 50 minutes ago.\n\nIf the class is finished, please remember to click the *🛑 End Class* button on your dashboard so your teaching hours are logged and homework is submitted!\n\n🔗 *Teacher Dashboard:*\nhttps://lms.learnwithayman.com\n\n*Learn With Ayman Admin Team*`;
          await sendMessage(teacherSearchTerm, forgotMsg);
          console.log(`🚨 Sent post-class "End Class" reminder to group code: ${teacherSearchTerm}`);
        }
      }
      
    }
  } catch (error) {
    console.error('❌ Error running minute-by-minute checks:', error);
  }
});
 
// ==========================================
// 🧹 MIDNIGHT SWEEPER: EXPIRED MAKEUP CREDITS
// ==========================================
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('🧹 Midnight Sweeper initialized: Checking for expired makeup credits...');
    const now = new Date();
    const usersWithMakeups = await User.find({ 'makeupBank.0': { $exists: true } });
    let expiredCount = 0;
 
    for (const student of usersWithMakeups) {
      const originalLength = student.makeupBank.length;
      student.makeupBank = student.makeupBank.filter(credit => credit.expirationDate > now);
      if (student.makeupBank.length < originalLength) {
        expiredCount += (originalLength - student.makeupBank.length);
        await student.save();
      }
    }
    console.log(`✅ Midnight Sweeper complete! Removed ${expiredCount} expired makeup credits.`);
  } catch (error) {
    console.error('❌ Error running Midnight Sweeper:', error);
  }
});
 
