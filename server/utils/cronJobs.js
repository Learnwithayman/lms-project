const cron = require('node-cron');
const { getUpcomingClasses } = require('./calendarBot');
const { sendMessage } = require('./whatsappBot'); 

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
      // If the description exists and contains "do not send", skip it entirely!
      if (cls.description && cls.description.toLowerCase().includes('do not send')) {
        console.log(`🚫 Skipped reminders for "${cls.title}" because it is marked as "do not send".`);
        continue; // Skips to the next class in the list
      }

      const timeDifferenceMs = cls.startTime - now;
      const minutesUntilStart = Math.round(timeDifferenceMs / (1000 * 60));
      const timeString = new Date(cls.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: "Africa/Cairo" });

      // ✨ THE SMART FALLBACK ENGINE ✨
      let teacherSearchTerm = (cls.teacherGroupName && cls.teacherGroupName.trim() !== '') ? cls.teacherGroupName : cls.title;
      let studentSearchTerm = (cls.studentGroupName && cls.studentGroupName.trim() !== '') ? cls.studentGroupName : cls.title;

      // 🚨 SAFETY CATCH
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
          
          // ⏳ Pause 25 seconds for the phone to type, send, and go home
          await delay(25000); 
        }

        // 2. Message for the STUDENT & PARENT
        if (studentSearchTerm) {
          const studentMessage = `🔔 *Class Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nGet ready! Your class *${cls.title}* is starting in exactly *1 Hour*.\n\n🔗 *Join Here:*\n${cls.zoomLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
          await sendMessage(studentSearchTerm, studentMessage); 
          console.log(`✅ Sent 1-hour Student reminder to search term: ${studentSearchTerm}`);
          
          // ⏳ Pause 25 seconds for the phone to finish this message before moving to another class
          await delay(25000); 
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
          
          // ⏳ Pause 25 seconds just in case multiple late alerts fire at the exact same minute
          await delay(25000); 
        }
      }
      
    }
  } catch (error) {
    console.error('❌ Error running minute-by-minute checks:', error);
  }
});