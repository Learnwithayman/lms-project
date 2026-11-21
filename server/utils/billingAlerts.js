// ==========================================
// 📦🧾 STEP 18: ADMIN ALERTS FOR STUDENTS NOT ON PAYPAL
// ==========================================
// - "Package by classes" (e.g. Hamza Hamwi): when the paid classes are all done → one alert to the admin group
//   (once per package; "Mark as paid" in the profile starts the next package).
// - "Monthly after-pay" (e.g. Joud and Layan): on the 26th → the number of classes done from the 26th to the 25th,
//   so the admin can send the invoice by hand.

const cron = require('node-cron');
const User = require('../models/User');
const ReminderRun = require('../models/ReminderRun');
const { sendMessage } = require('./whatsappBot');
const A = require('./availability');
const { buildCycle } = require('./cycleCalc');

const ADMIN_GROUP = process.env.ADMIN_WHATSAPP_NUMBER || 'https://chat.whatsapp.com/BYFE1IPRs2KGJNhGaxvpJd';
const TZ = A.STUDENT_TZ;
const SIGN = '*Learn With Ayman Admin Team* 💚';
const dayLabel = (d) => new Date(d).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
const dateLabel = (d) => new Date(d).toLocaleDateString('en-US', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });

const packageMessage = (s, r) =>
  `السلام عليكم / Assalamu Alaikum 🌿\n\n📦 *Package finished*\n👤 *Student:* ${(s.name || '').trim()}\n` +
  `✅ *Classes done:* ${r.total} of ${r.total}` + (r.owed ? `\n➕ *Taken after the package:* ${r.owed}` : '') +
  (r.lastClassAt ? `\n📅 *Last class:* ${dateLabel(r.lastClassAt)}` : '') +
  `\n\nPlease collect the payment, then press ✅ *Mark as paid* in the student's profile.\n\n${SIGN}`;

const afterPayMessage = (s, r, from, to) =>
  `السلام عليكم / Assalamu Alaikum 🌿\n\n🧾 *Invoice time*\n👤 *Student:* ${(s.name || '').trim()}\n` +
  `📅 *Period:* ${dateLabel(from)} → ${dateLabel(to)}\n✅ *Classes done:* ${r.done}\n` +
  (r.classes || []).filter((c) => c.done).map((c) => `• ${dayLabel(c.at)}`).join('\n') +
  `\n\nPlease send their invoice for this period.\n\n${SIGN}`;

// 📦 Every morning: packages that are used up → alert once per package
const runPackageAlerts = async (now = new Date()) => {
  try {
    const students = await User.find({ role: 'student', 'paypal.billingType': 'class_package' });
    for (const s of students) {
      const r = await buildCycle(s, { now });
      if (r.mode !== 'calculated' || !r.paymentDue) continue;
      const paid = r.packagesPaid || 1;
      if (s.paypal.packageAlertFor === paid) continue; // already alerted for this package
      s.paypal.packageAlertFor = paid;
      await s.save();
      await sendMessage(ADMIN_GROUP, packageMessage(s, r));
    }
  } catch (error) {
    console.error('❌ Package alerts failed:', error.message);
  }
};

// 🧾 On the 26th: classes done from the 26th of last month to the 25th → invoice reminder (once per month)
const runAfterPayReminders = async (now = new Date()) => {
  try {
    const [y, m, d] = A.dayIn(now, TZ).split('-').map(Number);
    if (d !== 26) return;
    const monthEnd = A.zonedToUtc(`${y}-${String(m).padStart(2, '0')}-26`, '00:00', TZ); // the 26th 00:00 = end of the month that just closed
    const students = await User.find({ role: 'student', 'paypal.billingType': 'after_pay_monthly' });
    for (const s of students) {
      if (s.pause && s.pause.kind === 'full') continue;
      const key = `${y}-${String(m).padStart(2, '0')}|after-pay-invoice|${s._id}`;
      if (await ReminderRun.exists({ key })) continue;
      const r = await buildCycle(s, { now: new Date(monthEnd.getTime() - 60 * 1000) });
      if (r.mode !== 'calculated') {
        await ReminderRun.create({ key });
        await sendMessage(ADMIN_GROUP, `السلام عليكم / Assalamu Alaikum 🌿\n\n🧾 *Invoice time*\n👤 *Student:* ${(s.name || '').trim()}\n\nThe classes could not be counted automatically (${(r.flags || [])[0] || r.mode}). Please count them by hand and send the invoice.\n\n${SIGN}`);
        continue;
      }
      await ReminderRun.create({ key });
      await sendMessage(ADMIN_GROUP, afterPayMessage(s, r, r.cycleStart, r.cycleEnd));
    }
  } catch (error) {
    console.error('❌ After-pay invoice reminders failed:', error.message);
  }
};

cron.schedule('15 9 * * *', () => runPackageAlerts(), { timezone: 'Africa/Cairo' });   // 9:15 AM Cairo every day
cron.schedule('30 9 26 * *', () => runAfterPayReminders(), { timezone: 'Africa/Cairo' }); // 9:30 AM Cairo on the 26th

module.exports = { runPackageAlerts, runAfterPayReminders, packageMessage, afterPayMessage };
