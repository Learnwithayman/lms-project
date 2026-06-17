const cron = require('node-cron');
const { getUpcomingClasses } = require('./calendarBot');
const { sendLmsNotification } = require('./whatsappBot'); 

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

      // ==========================================
      // 1-HOUR REMINDERS
      // ==========================================
      if (minutesUntilStart === 60) {
        
        // 1. Message for the TEACHER & SUPPORT TEAM (Keeps the time)
        if (cls.teacherGroupId) {
          const teacherMessage = `🔔 *Teacher Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour class *${cls.title}* is starting in exactly *1 Hour*.\n\n🕒 *Time:* ${timeString}\n\n🔗 *Class Link:*\n${cls.zoomLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
          await sendLmsNotification(cls.teacherGroupId, teacherMessage);
          console.log(`✅ Sent 1-hour Teacher reminder for ${cls.title}`);
        }

        // 2. Message for the STUDENT & PARENT (Time is REMOVED)
        if (cls.studentGroupId) {
          const studentMessage = `🔔 *Class Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nGet ready! Your class *${cls.title}* is starting in exactly *1 Hour*.\n\n🔗 *Join Here:*\n${cls.zoomLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
          await sendLmsNotification(cls.studentGroupId, studentMessage);
          console.log(`✅ Sent 1-hour Student reminder for ${cls.title}`);
        }
      }

      // ==========================================
      // 2-MINUTE LATE ALERTS (TEACHER ONLY)
      // ==========================================
      if (minutesUntilStart === -2) {
        if (cls.teacherGroupId) {
          const lateMessage = `🚨 *Action Required: Class Started*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour class *${cls.title}* was scheduled to begin at *${timeString}*.\n\nPlease jump into the room immediately so the student is not left waiting. If you have an emergency, please notify the admin team!\n\n🔗 *Join Class Here:*\n${cls.zoomLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
          await sendLmsNotification(cls.teacherGroupId, lateMessage);
          console.log(`🚨 Sent 2-minute late alert to Teacher for ${cls.title}`);
        }
      }
      
    }
  } catch (error) {
    console.error('❌ Error running minute-by-minute checks:', error);
  }
});