const cron = require('node-cron');
const User = require('../models/User');
// Assuming you have a MessageLog model for MacroDroid. If it's named differently, adjust the import.
// const MessageLog = require('../models/MessageLog'); 

const startReportCrons = () => {

  // 🗓️ 1. THE 25TH OF THE MONTH: Phase 1 (Plans) Reminder
  // Runs at 9:00 AM on the 25th of every month
  cron.schedule('0 9 25 * *', async () => {
    console.log('🤖 CRON: Running 25th of the month Phase 1 reminder...');
    try {
      const teachers = await User.find({ role: 'teacher' });
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const monthName = nextMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

      for (let teacher of teachers) {
        if (teacher.whatsappNumber) {
          const message = `Assalamu Alaikum ${teacher.name}, \n\nThis is an automated reminder that Phase 1 Study Plans for ${monthName} are due by the 1st. Please log in to your dashboard to draft the goals for your students. \n\nJazakallah Khair!`;
          
          // Add to MacroDroid queue
          // await MessageLog.create({ recipient: teacher.whatsappNumber, messageBody: message, status: 'pending' });
          console.log(`Queued Phase 1 reminder for ${teacher.name}`);
        }
      }
    } catch (error) {
      console.error('Error running 25th cron:', error);
    }
  });

  // 🗓️ 2. THE 1ST OF THE MONTH: Phase 2 (Grades) Reminder
  // Runs at 9:00 AM on the 1st of every month
  cron.schedule('0 9 1 * *', async () => {
    console.log('🤖 CRON: Running 1st of the month Phase 2 reminder...');
    try {
      const teachers = await User.find({ role: 'teacher' });
      const thisMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

      for (let teacher of teachers) {
        if (teacher.whatsappNumber) {
          const message = `Assalamu Alaikum ${teacher.name}, \n\nWelcome to ${thisMonth}! Please remember to submit the Phase 2 Final Grades for last month's reports. You have a 5-day grace period before the system escalates overdue reports to admin.\n\nJazakallah Khair!`;
          
          // await MessageLog.create({ recipient: teacher.whatsappNumber, messageBody: message, status: 'pending' });
          console.log(`Queued Phase 2 reminder for ${teacher.name}`);
        }
      }
    } catch (error) {
      console.error('Error running 1st cron:', error);
    }
  });

  // 🗓️ 3. THE 6TH OF THE MONTH: The Escalation / Hard-Tone Nag
  // Runs at 9:00 AM on the 6th of every month
  cron.schedule('0 9 6 * *', async () => {
    console.log('🤖 CRON: Running 6th of the month Overdue reminder...');
    try {
      const teachers = await User.find({ role: 'teacher' });

      for (let teacher of teachers) {
        if (teacher.whatsappNumber) {
          const message = `⚠️ URGENT: Assalamu Alaikum ${teacher.name}, \n\nThe 5-day grace period for submitting monthly reports has ended. Any missing Phase 2 Grades or Phase 1 Plans are now OVERDUE and have been flagged to Admin. \n\nPlease update your dashboard immediately.`;
          
          // await MessageLog.create({ recipient: teacher.whatsappNumber, messageBody: message, status: 'pending' });
          console.log(`Queued OVERDUE reminder for ${teacher.name}`);
        }
      }
    } catch (error) {
      console.error('Error running 6th cron:', error);
    }
  });

  console.log('✅ Monthly Report Nag System (Crons) Initialized!');
};

module.exports = startReportCrons;