const cron = require('node-cron');
const User = require('../models/User');
const ReminderRun = require('../models/ReminderRun');
const { sendMessage } = require('./whatsappBot');
const A = require('./availability');
const M = require('./rescheduleMessages');

// ==========================================
// 🗓️ STEP 7 TIMED MESSAGES
// ==========================================
//   Monday 10:00 AM Cairo → every teacher: "Weekly schedule check" (message 10), once per Monday
//   Daily 10:00 AM New York → students whose makeup credit expires within 7 days (message 6), once per credit

const runMondayScheduleCheck = async () => {
  try {
    const monday = A.dayIn(new Date(), A.CAIRO_TZ);
    const teachers = await User.find({ role: 'teacher' });
    let sent = 0;
    for (const t of teachers) {
      const target = (t.teacherGroupId || '').trim();
      if (!target) continue;
      try {
        await ReminderRun.create({ key: `${monday}|schedule-check|${t._id}` });
      } catch (dup) {
        continue; // already sent this Monday
      }
      await sendMessage(target, M.teacherMondayCheck(t));
      sent += 1;
    }
    if (sent) console.log(`🗓️ Monday schedule check sent to ${sent} teachers`);
  } catch (error) {
    console.error('❌ Error sending Monday schedule check:', error);
  }
};

const runCreditExpiryWarnings = async (now = new Date()) => {
  try {
    const soon = new Date(now.getTime() + 7 * A.DAY);
    const students = await User.find({ role: 'student', 'makeupBank.0': { $exists: true } });
    for (const s of students) {
      const due = (s.makeupBank || []).filter((c) => !c.isUsed && !c.expiryWarnedAt && new Date(c.expirationDate) > now && new Date(c.expirationDate) <= soon);
      if (!due.length) continue;
      due.sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate));
      const date = new Date(due[0].expirationDate).toLocaleDateString('en-US', { timeZone: A.STUDENT_TZ, dateStyle: 'medium' });
      due.forEach((c) => { c.expiryWarnedAt = now; });
      await s.save();
      if ((s.studentGroupId || '').trim()) await sendMessage(s.studentGroupId.trim(), M.studentCreditExpiring(s, date));
    }
  } catch (error) {
    console.error('❌ Error sending credit expiry warnings:', error);
  }
};

cron.schedule('0 10 * * 1', runMondayScheduleCheck, { timezone: 'Africa/Cairo' });
cron.schedule('0 10 * * *', () => runCreditExpiryWarnings(), { timezone: 'America/New_York' });

module.exports = { runMondayScheduleCheck, runCreditExpiryWarnings };
