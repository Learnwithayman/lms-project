const cron = require('node-cron');
const ClassSession = require('../models/ClassSession');
const User = require('../models/User');
const whatsappClient = require('./whatsappBot');

// ---------------------------------------------------------
// 1. DAILY ITINERARY (Runs every day at 12:01 AM Egypt Time)
// ---------------------------------------------------------
cron.schedule('1 0 * * *', async () => {
  try {
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find all classes happening in the next 24 hours
    const classesToday = await ClassSession.find({
      startTime: { $gte: now, $lte: next24Hours },
      status: { $ne: 'completed' }
    }).populate('teacher', 'name whatsappGroupId').populate('student', 'name').sort({ startTime: 1 });

    if (classesToday.length === 0) return;

    // Group classes by teacher so we can send one summary message per teacher
    const classesByTeacher = {};
    classesToday.forEach((cls) => {
      const teacherId = cls.teacher._id.toString();
      if (!classesByTeacher[teacherId]) {
        classesByTeacher[teacherId] = { teacher: cls.teacher, classes: [] };
      }
      classesByTeacher[teacherId].classes.push(cls);
    });

    // Format and send the daily schedule to each teacher
    for (const [teacherId, data] of Object.entries(classesByTeacher)) {
      if (data.teacher.whatsappGroupId) {
        let scheduleText = `السلام عليكم / Assalamu Alaikum *${data.teacher.name}*, ☀️\n\nHere is your schedule for today:\n\n*Your Classes Today:*\n`;
        
        data.classes.forEach(cls => {
          const timeString = new Date(cls.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          scheduleText += `🕒 *${timeString}* - ${cls.student.name} - (${cls.durationMinutes} mins)\n`;
        });

        scheduleText += `\nHave a blessed and productive day! 📚\n*Learn With Ayman Admin Team*`;
        
        await whatsappClient.sendMessage(data.teacher.whatsappGroupId, scheduleText);
      }
    }
  } catch (error) {
    console.error('Error running Daily Itinerary cron:', error);
  }
}, { timezone: "Africa/Cairo" });

// ---------------------------------------------------------
// 2. EVERY MINUTE CHECKS (1-Hour Reminders & 2-Minute Late Alerts)
// ---------------------------------------------------------
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    
    // Exact windows for 1 hour from now, and 2 minutes ago
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const oneHourAndOneMinFromNow = new Date(now.getTime() + 61 * 60 * 1000);
    
    const twoMinsAgo = new Date(now.getTime() - 2 * 60 * 1000);
    const threeMinsAgo = new Date(now.getTime() - 3 * 60 * 1000);

    // --- FIND CLASSES STARTING IN EXACTLY 1 HOUR ---
    const upcomingClasses = await ClassSession.find({
      startTime: { $gte: oneHourFromNow, $lt: oneHourAndOneMinFromNow },
      status: { $ne: 'completed' }
    }).populate('teacher', 'name whatsappGroupId').populate('student', 'name');

    for (const cls of upcomingClasses) {
      if (cls.teacher && cls.teacher.whatsappGroupId) {
        const timeString = new Date(cls.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const message = `🔔 *Upcoming Class Reminder*\n\nالسلام عليكم / Assalamu Alaikum *${cls.teacher.name}*,\n\nYour next class is starting in exactly *1 Hour*.\n\n👤 *Student:* ${cls.student.name}\n🕒 *Time:* ${timeString}\n📖 *Subject:* ${cls.subject}\n\n🔗 *Class Link:*\n${cls.meetingLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
        await whatsappClient.sendMessage(cls.teacher.whatsappGroupId, message);
      }
    }

    // --- FIND CLASSES THAT STARTED 2 MINUTES AGO (Teacher Late) ---
    const lateClasses = await ClassSession.find({
      startTime: { $lte: twoMinsAgo, $gt: threeMinsAgo },
      status: { $ne: 'completed' } 
    }).populate('teacher', 'name whatsappGroupId').populate('student', 'name');

    for (const cls of lateClasses) {
      if (cls.teacher && cls.teacher.whatsappGroupId) {
        const timeString = new Date(cls.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const message = `🚨 *Action Required: Class Started*\n\nالسلام عليكم / Assalamu Alaikum *${cls.teacher.name}*,\n\nYour class with *${cls.student.name}* was scheduled to begin at *${timeString}*.\n\nPlease jump into the room immediately so the student is not left waiting. If you are experiencing internet issues or an emergency, please notify the admin team right away!\n\n🔗 *Join Class Here:*\n${cls.meetingLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
        await whatsappClient.sendMessage(cls.teacher.whatsappGroupId, message);
      }
    }

  } catch (error) {
    console.error('Error running minute-by-minute checks:', error);
  }
});