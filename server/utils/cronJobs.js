const cron = require('node-cron');
const { getUpcomingClasses } = require('./calendarBot');
const { sendMessage } = require('./whatsappBot'); 
const ClassSession = require('../models/ClassSession'); 
const User = require('../models/User'); // Used for the Midnight Sweeper

console.log('✅ Dual-Group Cron jobs initialized. Listening for upcoming classes...');

// ⏱️ 25-Second Delay Helper Function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------
// EVERY MINUTE CHECKS (1-Hour Reminders & Late Alerts)
// ---------------------------------------------------------
cron.schedule('* * * * *', async () => {
  try {
    const classes = await getUpcomingClasses();
    const now = new Date();

    for (const cls of classes) {
      
      // 🚫 THE "DO NOT SEND" FILTER 
      if (cls.description && cls.description.toLowerCase().includes('do not send')) {
        console.log(`🚫 Skipped reminders for "${cls.title}" because it is marked as "do not send".`);
        continue; 
      }

      const timeDifferenceMs = cls.startTime - now;
      const minutesUntilStart = Math.round(timeDifferenceMs / (1000 * 60));
      const timeString = new Date(cls.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: "Africa/Cairo" });

      // ✨ 1. STRICT NAME ENGINE (Reads ONLY the exact name from the description)
      let teacherSearchTerm = (cls.teacherGroupName && cls.teacherGroupName.trim() !== '') ? cls.teacherGroupName.trim() : null;
      let studentSearchTerm = (cls.studentGroupName && cls.studentGroupName.trim() !== '') ? cls.studentGroupName.trim() : null;

      // Clean up old @g.us IDs if they are still hiding in the calendar
      if (teacherSearchTerm && teacherSearchTerm.includes('@g.us')) teacherSearchTerm = null;
      if (studentSearchTerm && studentSearchTerm.includes('@g.us')) studentSearchTerm = null;

      // ==========================================
      // 1-HOUR REMINDERS
      // ==========================================
      if (minutesUntilStart === 60) {
        
        // ✨ 2. DASHBOARD LINK FOR TEACHER REMINDER
        if (teacherSearchTerm) {
          const teacherMessage = `🔔 *Teacher Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour class *${cls.title}* is starting in exactly *1 Hour*.\n\n🕒 *Time:* ${timeString}\n\n🔗 *Teacher Dashboard:*\nhttps://lms.learnwithayman.com\n\n*Learn With Ayman Admin Team*`;
          await sendMessage(teacherSearchTerm, teacherMessage); 
          console.log(`✅ Sent 1-hour Teacher reminder to search term: ${teacherSearchTerm}`);
          
          await delay(25000); 
        }

        // Message for the STUDENT (Keeps the Zoom Link)
        if (studentSearchTerm) {
          const studentMessage = `🔔 *Class Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nGet ready! Your class *${cls.title}* is starting in exactly *1 Hour*.\n\n🔗 *Join Here:*\n${cls.zoomLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
          await sendMessage(studentSearchTerm, studentMessage); 
          console.log(`✅ Sent 1-hour Student reminder to search term: ${studentSearchTerm}`);
          
          await delay(25000); 
        }
      }

      // ==========================================
      // 3-MINUTE LATE ALERTS (TEACHER ONLY)
      // ==========================================
      if (minutesUntilStart === -3) {
        if (teacherSearchTerm) {
          
          // ✨ 3. BULLETPROOF LATE ALERT CHECK 
          const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
          
          // Smarter check: Looks for BOTH title OR the student group name to ensure we don't miss it
          const alreadyJoined = await ClassSession.findOne({
            $or: [
              { subject: cls.title },
              { studentGroupName: cls.studentGroupName }
            ],
            startTime: { $gte: oneHourAgo }, 
            status: { $in: ['in-progress', 'started', 'completed'] } 
          });

          if (alreadyJoined) {
            console.log(`✅ Teacher already joined "${cls.title}". Skipping the 3-minute late alert!`);
          } else {
            const lateMessage = `🚨 *Action Required: You are 3 minutes late!*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour class *${cls.title}* was scheduled to begin at *${timeString}*.\n\nYou are currently 3 minutes late. Please jump into the room immediately so the student is not left waiting. If you have an emergency, please notify the admin team!\n\n🔗 *Join Class Here:*\n${cls.zoomLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
            await sendMessage(teacherSearchTerm, lateMessage); 
            console.log(`🚨 Sent 3-minute late alert to search term: ${teacherSearchTerm}`);
            
            await delay(25000); 
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
// Runs every night at 12:00 AM
cron.schedule('0 0 * * *', async () => {
  try {
    console.log('🧹 Midnight Sweeper initialized: Checking for expired makeup credits...');
    const now = new Date();
    
    // Find all users who actually have makeup credits in their bank
    const usersWithMakeups = await User.find({ 'makeupBank.0': { $exists: true } });
    
    let expiredCount = 0;

    for (const student of usersWithMakeups) {
      const originalLength = student.makeupBank.length;
      
      // Keep only the makeup credits that haven't expired yet
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