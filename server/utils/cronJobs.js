const cron = require('node-cron');
const { getUpcomingClasses } = require('./calendarBot');
const { sendMessage } = require('./whatsappBot'); 
const ClassSession = require('../models/ClassSession'); 
const User = require('../models/User'); 

console.log('✅ Dual-Group Cron jobs initialized. Listening for upcoming classes...');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ✨ NEW: The "Special Character" Shield! 
// This stops parentheses, brackets, or dashes in your class titles from breaking the database search.
const escapeRegex = (text) => {
  if (!text) return "";
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
};

cron.schedule('* * * * *', async () => {
  try {
    const classes = await getUpcomingClasses();
    const now = new Date();

    for (const cls of classes) {
      if (cls.description && cls.description.toLowerCase().includes('do not send')) {
        console.log(`🚫 Skipped reminders for "${cls.title}" because it is marked as "do not send".`);
        continue; 
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
      // 1-HOUR REMINDERS
      // ==========================================
      if (minutesUntilStart === 60) {
        if (teacherSearchTerm) {
          const teacherMessage = `🔔 *Teacher Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour class *${cls.title}* is starting in exactly *1 Hour*.\n\n🕒 *Time:* ${timeString}\n\n🔗 *Teacher Dashboard:*\nhttps://lms.learnwithayman.com\n\n*Learn With Ayman Admin Team*`;
          await sendMessage(teacherSearchTerm, teacherMessage); 
          console.log(`✅ Sent 1-hour Teacher reminder to group code: ${teacherSearchTerm}`);
          await delay(25000); 
        }

        if (studentSearchTerm) {
          const studentMessage = `🔔 *Class Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nGet ready! Your class *${cls.title}* is starting in exactly *1 Hour*.\n\n🔗 *Join Here:*\n${cls.zoomLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
          await sendMessage(studentSearchTerm, studentMessage); 
          console.log(`✅ Sent 1-hour Student reminder to group code: ${studentSearchTerm}`);
          await delay(25000); 
        }
      }

      // ==========================================
      // 3-MINUTE LATE ALERTS (TEACHER ONLY)
      // ==========================================
      if (minutesUntilStart === -3) {
        if (teacherSearchTerm) {
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
            console.log(`✅ Teacher already joined "${cls.title}". Skipping the 3-minute late alert!`);
          } else {
            const lateMessage = `🚨 *Action Required: You are 3 minutes late!*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour class *${cls.title}* was scheduled to begin at *${timeString}*.\n\nYou are currently 3 minutes late. Please jump into the room immediately so the student is not left waiting. If you have an emergency, please notify the admin team!\n\n🔗 *Join Class Here:*\n${cls.zoomLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
            await sendMessage(teacherSearchTerm, lateMessage); 
            console.log(`🚨 Sent 3-minute late alert to group code: ${teacherSearchTerm}`);
            await delay(25000); 
          }
        }
      }

      // ==========================================
      // ⏳ 50-MINUTE "FORGOT TO END CLASS" REMINDER
      // ==========================================
      // ✨ NEW: This now triggers 50 minutes AFTER the class was scheduled to end!
      if (minutesSinceEnd === 50) {
        if (teacherSearchTerm) {
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

          if (stillRunning) {
            const forgotMsg = `🔔 *Action Required: End Class Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour class *${cls.title}* ended over 50 minutes ago.\n\nIf the class is finished, please remember to click the *🛑 End Class* button on your dashboard so your teaching hours are logged and homework is submitted!\n\n🔗 *Teacher Dashboard:*\nhttps://lms.learnwithayman.com\n\n*Learn With Ayman Admin Team*`;
            await sendMessage(teacherSearchTerm, forgotMsg); 
            console.log(`🚨 Sent post-class "End Class" reminder to group code: ${teacherSearchTerm}`);
            await delay(25000); 
          } else {
             console.log(`✅ Teacher already ended "${cls.title}". Skipping reminder.`);
          }
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