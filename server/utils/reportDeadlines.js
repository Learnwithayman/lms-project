const cron = require('node-cron');
const User = require('../models/User');
const ReminderRun = require('../models/ReminderRun');
const { sendMessage } = require('./whatsappBot');
const D = require('./reportDuties');

// ==========================================
// 📋 PLAN & REPORT DEADLINES (Step 5)
// ==========================================
// Every day at 10:00 AM Cairo:
//   Plans:   day 1 gentle (all teachers) · day 3 firmer (missing only) · day 10 admin alert
//   Reports: day 25 gentle (all teachers) · day 27 firmer (missing only) · 3rd of next month admin alert
//   Admin approval nudge when plans / reports wait 2+ days
// The red dashboard panels (plans day 7, reports the day after the last class) are shown by the website.
// Each reminder is sent once (ReminderRun key). The "Preview today's reminders" button uses the same code.

const ADMIN_GROUP_TARGET = process.env.ADMIN_WHATSAPP_NUMBER || 'https://chat.whatsapp.com/BYFE1IPRs2KGJNhGaxvpJd';

const bullets = (names) => names.map((n) => `• ${n}`).join('\n');
const byTeacherLines = (groups) => groups.map((g) => `👨‍🏫 *${g.teacher.name}:* ${g.names.join(', ')}`).join('\n');

// Messages approved 16 Nov (Q4 = A)
const planGentleMessage = (teacher, label) =>
  `السلام عليكم ${teacher.name},\n\n📋 *Study Plans for ${label}*\n\nA new month has started. Please save the study plan for each of your students in the LMS. The *"Plan required"* card shows on each student's first class this month.\n\nJazakum Allahu khairan 🌿`;
const planFirmMessage = (teacher, label, names) =>
  `السلام عليكم ${teacher.name},\n\n⏰ *Study Plans still missing for ${label}*\n\nPlans are not saved yet for:\n${bullets(names)}\n\nPlease save them today in the LMS.`;
const planAdminMessage = (label, groups) =>
  `السلام عليكم\n\n⚠️ *Study Plans missing: ${label}*\n\n${byTeacherLines(groups)}`;
const reportGentleMessage = (teacher, label) =>
  `السلام عليكم ${teacher.name},\n\n📝 *Monthly Reports for ${label}*\n\nThe month is almost over. Please save the report for each of your students in the LMS. The *"Report required"* card shows on each student's last class this month.\n\nJazakum Allahu khairan 🌿`;
const reportFirmMessage = (teacher, label, names) =>
  `السلام عليكم ${teacher.name},\n\n⏰ *Monthly Reports still missing for ${label}*\n\nReports are not saved yet for:\n${bullets(names)}\n\nPlease save each one right after the student's last class this month.`;
const reportAdminMessage = (label, groups) =>
  `السلام عليكم\n\n⚠️ *Monthly Reports missing: ${label}*\n\n${byTeacherLines(groups)}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const approvalNudgeMessage = (plans, reports, oldestDays) =>
  `السلام عليكم\n📝 *Waiting for your approval:* ${plural(plans, 'plan')}, ${plural(reports, 'report')} (oldest: ${plural(oldestDays, 'day')})`;

// Duties grouped by teacher → [{ teacher, names: [student names] }]
const groupByTeacher = (duties) => {
  const map = new Map();
  for (const d of duties) {
    const id = String(d.teacher._id);
    if (!map.has(id)) map.set(id, { teacher: d.teacher, names: [] });
    const g = map.get(id);
    if (!g.names.includes(d.student.name)) g.names.push(d.student.name);
  }
  return [...map.values()].sort((a, b) => (a.teacher.name || '').localeCompare(b.teacher.name || ''));
};

// Plans / reports saved 2+ days ago and still waiting for the admin (from the go-live month on)
const pendingApprovals = async (now = Date.now()) => {
  const students = await User.find({ role: 'student', 'monthlyReports.approvalStatus': 'pending' });
  let plans = 0;
  let reports = 0;
  let oldestDays = 0;
  for (const s of students) {
    for (const r of s.monthlyReports || []) {
      if (r.approvalStatus !== 'pending') continue;
      const key = D.normMonth(r.monthYear);
      if (!key || key < D.GO_LIVE.reports) continue;
      const days = Math.floor((now - new Date(r.lastSavedAt || r.createdAt).getTime()) / D.DAY_MS);
      if (days < 2) continue;
      if (r.isFinalized) reports += 1; else plans += 1;
      oldestDays = Math.max(oldestDays, days);
    }
  }
  return { plans, reports, oldestDays };
};

// Everything that should be sent on a given Cairo day ('YYYY-MM-DD'). Sends nothing.
const computeActions = async (today, { preview = false } = {}) => {
  const day = Number(today.slice(8, 10));
  const cur = today.slice(0, 7);
  const prev = D.shiftMonth(cur, -1);
  const actions = [];
  const warnings = [];

  const toTeacher = (kind, teacher, text) => {
    const target = (teacher.teacherGroupId || '').trim();
    if (!target) {
      warnings.push(`${teacher.name} has no group link saved, so the "${kind}" reminder can't be sent.`);
      return;
    }
    actions.push({ key: `${today}|${kind}|${teacher._id}`, kind, toName: teacher.name, to: target, text });
  };
  const toAdmin = (kind, text) => actions.push({ key: `${today}|${kind}`, kind, toName: 'Admin group', to: ADMIN_GROUP_TARGET, text });

  const plansOn = cur >= D.GO_LIVE.plans;
  const reportsOn = cur >= D.GO_LIVE.reports;
  const needCur = preview || (plansOn && [1, 3, 10].includes(day)) || (reportsOn && [25, 27].includes(day));

  if (needCur) {
    const m = await D.buildMonthDuties(cur);
    if (plansOn && day === 1) groupByTeacher(m.duties).forEach((g) => toTeacher('plans-gentle', g.teacher, planGentleMessage(g.teacher, m.label)));
    if (plansOn && day === 3) groupByTeacher(m.duties.filter((d) => !d.planDone)).forEach((g) => toTeacher('plans-firm', g.teacher, planFirmMessage(g.teacher, m.label, g.names)));
    if (plansOn && day === 10) {
      const groups = groupByTeacher(m.duties.filter((d) => !d.planDone));
      if (groups.length) toAdmin('plans-admin', planAdminMessage(m.label, groups));
    }
    if (reportsOn && day === 25) groupByTeacher(m.duties.filter((d) => !d.noPlan)).forEach((g) => toTeacher('reports-gentle', g.teacher, reportGentleMessage(g.teacher, m.label)));
    if (reportsOn && day === 27) groupByTeacher(m.duties.filter((d) => !d.reportDone && !d.noPlan)).forEach((g) => toTeacher('reports-firm', g.teacher, reportFirmMessage(g.teacher, m.label, g.names)));

    if (preview) {
      const noTeacher = m.unmatched.filter((u) => u.missing === 'teacher');
      const noStudent = m.unmatched.filter((u) => u.missing === 'student');
      const titles = (list) => [...new Set(list.map((u) => u.title))].slice(0, 15).join(', ');
      if (noTeacher.length) warnings.push(`${noTeacher.length} classes in ${m.label} couldn't be matched to a teacher (check the teacher's group link in Users): ${titles(noTeacher)}`);
      if (noStudent.length) warnings.push(`${noStudent.length} classes in ${m.label} couldn't be matched to a student: ${titles(noStudent)}`);
      const linkless = m.teachers.filter((t) => !(t.teacherGroupId || '').trim()).map((t) => t.name);
      if (linkless.length) warnings.push(`Teachers with no group link saved: ${linkless.join(', ')}`);
    }
  }

  if (day === 3 && prev >= D.GO_LIVE.reports) {
    const m = await D.buildMonthDuties(prev);
    const groups = groupByTeacher(m.duties.filter((d) => !d.reportDone && !d.noPlan)); // 27 Nov: no plan → no report
    if (groups.length) toAdmin('reports-admin',reportAdminMessage(m.label, groups));
  }

  const waiting = await pendingApprovals();
  if (waiting.plans + waiting.reports > 0) toAdmin('approval-nudge', approvalNudgeMessage(waiting.plans, waiting.reports, waiting.oldestDays));

  return { today, actions, warnings };
};

// The daily 10 AM Cairo run: send each action once
const runDailyDeadlines = async () => {
  try {
    const today = D.dayIn(new Date(), D.CAIRO_TZ);
    const { actions, warnings } = await computeActions(today);
    let sent = 0;
    for (const a of actions) {
      try {
        await ReminderRun.create({ key: a.key });
      } catch (dup) {
        continue; // already sent today
      }
      await sendMessage(a.to, a.text);
      sent += 1;
    }
    if (sent) console.log(`📋 Plan/report deadline messages queued: ${sent}`);
    if (warnings.length) console.log(`📋 Deadline warnings: ${warnings.join(' | ')}`);
  } catch (error) {
    console.error('❌ Error running plan/report deadlines:', error);
  }
};

cron.schedule('0 10 * * *', runDailyDeadlines, { timezone: 'Africa/Cairo' });

module.exports = {
  computeActions,
  runDailyDeadlines,
  pendingApprovals,
  planGentleMessage,
  planFirmMessage,
  planAdminMessage,
  reportGentleMessage,
  reportFirmMessage,
  reportAdminMessage,
  approvalNudgeMessage
};
