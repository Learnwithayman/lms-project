const cron = require('node-cron');
const User = require('../models/User');
const { sendMessage } = require('./whatsappBot');

// ==========================================
// ⏸️ STUDENT RETURN-DAY ALERTS (Step 3)
// ==========================================
// No automatic reactivation. On (or after) the return date, each message is sent once:
//   - Admin alerts group: 10:00 AM Cairo
//   - Student group (welcome back): 10:00 AM Eastern
// Teachers are NOT notified (decision 15 Nov).

const ADMIN_GROUP_TARGET = process.env.ADMIN_WHATSAPP_NUMBER || 'https://chat.whatsapp.com/BYFE1IPRs2KGJNhGaxvpJd';

// Today's date (YYYY-MM-DD) in a time zone
const todayIn = (timeZone) => new Date().toLocaleDateString('en-CA', { timeZone });
// The stored return date (date only, saved as UTC midnight) as YYYY-MM-DD
const dayOf = (date) => new Date(date).toISOString().slice(0, 10);
const fmtDay = (date) => new Date(date).toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: 'medium' });
const savedCount = (p) => Math.max(0, (p.savedTotalClasses || 0) - (p.savedClassesUsed || 0));

const adminReturnMessage = (user) => {
  const p = user.pause;
  const untilText = p.returnPrecision === 'month' ? new Date(p.returnDate).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }) : fmtDay(p.returnDate); // ⏸️ Step 30
  const untilLine = p.kind === 'full' ? `📅 *Paused until:* ${untilText}` : `🧳 *Away until:* ${untilText}`;
  const savedLine = p.kind === 'full' ? `\n🎒 *Saved classes:* ${savedCount(p)}` : '';
  return `السلام عليكم / Assalamu Alaikum 🌿\n\n⏰ *Student Return Today*\n👤 *Student:* ${user.name}\n${untilLine}${savedLine}\n\nPlease reactivate the subscription and confirm the schedule. ✅`;
};

const studentWelcomeMessage = (user) => {
  const p = user.pause;
  const classesLine = p.kind === 'full'
    ? `📚 Your ${savedCount(p)} saved classes are ready, and our team will confirm your schedule shortly, Insha'Allah.`
    : `📚 Your classes continue as scheduled, Insha'Allah.`;
  return `السلام عليكم / Assalamu Alaikum 🌙\n\n🎉 Welcome back, *${user.name}*! We're delighted to have you with us again.\n${classesLine}\n\n*Learn With Ayman Admin Team* 💚`;
};

// Students still paused whose return date has arrived and who haven't had this message yet
const dueStudents = async (sentField, timeZone) => {
  const today = todayIn(timeZone);
  const paused = await User.find({ 'pause.kind': { $in: ['full', 'away'] }, 'pause.returnDate': { $exists: true } });
  return paused.filter((u) => !u.pause[sentField] && dayOf(u.pause.returnDate) <= today);
};

const runAdminReturnAlerts = async () => {
  try {
    const due = await dueStudents('adminAlertSentAt', 'Africa/Cairo');
    for (const user of due) {
      await sendMessage(ADMIN_GROUP_TARGET, adminReturnMessage(user));
      user.pause.adminAlertSentAt = new Date();
      await user.save();
    }
    if (due.length) console.log(`⏰ Return-day admin alerts sent: ${due.map((u) => u.name).join(', ')}`);
  } catch (error) {
    console.error('❌ Error sending return-day admin alerts:', error);
  }
};

const runStudentWelcomes = async () => {
  try {
    const due = await dueStudents('studentWelcomeSentAt', 'America/New_York');
    for (const user of due) {
      if (user.studentGroupId && user.studentGroupId.trim()) {
        await sendMessage(user.studentGroupId.trim(), studentWelcomeMessage(user));
      } else {
        await sendMessage(ADMIN_GROUP_TARGET, `⚠️ ${user.name} returns today but has no group link, so no welcome-back message was sent.`);
      }
      user.pause.studentWelcomeSentAt = new Date();
      await user.save();
    }
    if (due.length) console.log(`🎉 Welcome-back messages sent: ${due.map((u) => u.name).join(', ')}`);
  } catch (error) {
    console.error('❌ Error sending welcome-back messages:', error);
  }
};

cron.schedule('0 10 * * *', runAdminReturnAlerts, { timezone: 'Africa/Cairo' });
cron.schedule('0 10 * * *', runStudentWelcomes, { timezone: 'America/New_York' });

module.exports = { runAdminReturnAlerts, runStudentWelcomes, adminReturnMessage, studentWelcomeMessage };
