const cron = require('node-cron');
const { getUpcomingClasses } = require('./calendarBot');
const { sendMessage } = require('./whatsappBot'); 

console.log('✅ Dual-Group Cron jobs initialized. Listening for upcoming classes...');

// ---------------------------------------------------------
// EVERY MINUTE CHECKS (1-Hour Reminders & Late Alerts)
// ---------------------------------------------------------
cron.schedule('* * * * *', async () => {
  try {
    const classes = await getUpcomingClasses();
    const now = new Date();

    for (const cls of classes) {
      const timeDifferenceMs = cls.startTime - now;
      const minutesUntilStart = Math.round(timeDifferenceMs / (1000 * 60));
      const timeString = new Date(cls.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: "Africa/Cairo" });

      // ✨ THE SMART FALLBACK ENGINE ✨
      // 1. Use the explicitly provided group name if it exists and isn't blank.
      // 2. If it's missing, use the Calendar Event Title as the search term!
      let teacherSearchTerm = (cls.teacherGroupName && cls.teacherGroupName.trim() !== '') ? cls.teacherGroupName : cls.title;
      let studentSearchTerm = (cls.studentGroupName && cls.studentGroupName.trim() !== '') ? cls.studentGroupName : cls.title;

      // 🚨 SAFETY CATCH: If the fallback somehow grabbed an old ID, stop it from breaking the phone!
      if (teacherSearchTerm && teacherSearchTerm.includes('@g.us')) teacherSearchTerm = cls.title;
      if (studentSearchTerm && studentSearchTerm.includes('@g.us')) studentSearchTerm = cls.title;

      // ==========================================
      // 1-HOUR REMINDERS
      // ==========================================
      if (minutesUntilStart === 60) {
        
        // 1. Message for the TEACHER & SUPPORT TEAM
        if (teacherSearchTerm) {
          const teacherMessage = `🔔 *Teacher Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour class *${cls.title}* is starting in exactly *1 Hour*.\n\n🕒 *Time:* ${timeString}\n\n🔗 *Class Link:*\n${cls.zoomLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
          await sendMessage(teacherSearchTerm, teacherMessage); 
          console.log(`✅ Sent 1-hour Teacher reminder to search term: ${teacherSearchTerm}`);
        }

        // 2. Message for the STUDENT & PARENT
        if (studentSearchTerm) {
          const studentMessage = `🔔 *Class Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nGet ready! Your class *${cls.title}* is starting in exactly *1 Hour*.\n\n🔗 *Join Here:*\n${cls.zoomLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
          await sendMessage(studentSearchTerm, studentMessage); 
          console.log(`✅ Sent 1-hour Student reminder to search term: ${studentSearchTerm}`);
        }
      }

      // ==========================================
      // 2-MINUTE LATE ALERTS (TEACHER ONLY)
      // ==========================================
      if (minutesUntilStart === -2) {
        if (teacherSearchTerm) {
          const lateMessage = `🚨 *Action Required: Class Started*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour class *${cls.title}* was scheduled to begin at *${timeString}*.\n\nPlease jump into the room immediately so the student is not left waiting. If you have an emergency, please notify the admin team!\n\n🔗 *Join Class Here:*\n${cls.zoomLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
          await sendMessage(teacherSearchTerm, lateMessage); 
          console.log(`🚨 Sent 2-minute late alert to search term: ${teacherSearchTerm}`);
        }
      }
      
    }
  } catch (error) {
    console.error('❌ Error running minute-by-minute checks:', error);
  }
});