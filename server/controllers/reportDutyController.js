const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const ReminderRun = require('../models/ReminderRun');
const D = require('../utils/reportDuties');
const { computeActions } = require('../utils/reportDeadlines');

// ==========================================
// 📋 STEP 5: PLAN & REPORT DEADLINES
// ==========================================

const loadPeople = () => Promise.all([User.find({ role: 'teacher' }), User.find({ role: 'student' })]);

// @desc    The teacher's own plan / report duties: progress bar, class cards, red panel
// @route   GET /api/student/my-duties
// @access  Private (Teacher)
const getMyDuties = asyncHandler(async (req, res) => {
  const now = new Date();
  const today = D.dayIn(now, D.CAIRO_TZ);
  const day = Number(today.slice(8, 10));
  const cur = today.slice(0, 7);
  const keys = [D.shiftMonth(cur, -1), cur, D.shiftMonth(cur, 1)];

  const [teachers, students] = await loadPeople();
  const built = await Promise.all(keys.map((k) => D.buildMonthDuties(k, { teachers, students })));
  const [prevM, curM, nextM] = built.map((m) => ({ ...m, mine: m.duties.filter((d) => String(d.teacher._id) === String(req.user._id)) }));

  // Cards on classes: "Plan required" on the first class, "Report required" on the last class
  const cards = {};
  const addCard = (eventId, kind, m, d) => {
    cards[eventId] = cards[eventId] || [];
    cards[eventId].push({ kind, month: m.label, monthKey: m.key, studentName: d.student.name });
  };
  for (const m of [curM, nextM]) {
    if (m.key < D.GO_LIVE.plans) continue;
    m.mine.forEach((d) => { if (!d.planDone && d.firstClass) addCard(d.firstClass.id, 'plan', m, d); });
  }
  for (const m of [prevM, curM]) {
    if (m.key < D.GO_LIVE.reports) continue;
    m.mine.forEach((d) => { if (!d.reportDone && d.lastClass) addCard(d.lastClass.id, 'report', m, d); });
  }

  // Red "Immediate action required" panel
  const panel = [];
  if (cur >= D.GO_LIVE.plans && day >= 7) {
    const missing = curM.mine.filter((d) => !d.planDone).map((d) => d.student.name);
    if (missing.length) panel.push({ kind: 'plan', month: curM.label, students: missing });
  }
  for (const m of [prevM, curM]) {
    if (m.key < D.GO_LIVE.reports) continue;
    m.mine
      .filter((d) => !d.reportDone && d.lastClass && D.dayIn(d.lastClass.start, D.CAIRO_TZ) < today)
      .forEach((d) => panel.push({ kind: 'report', month: m.label, students: [d.student.name] }));
  }

  // Progress bar for this month
  const count = (list, field) => ({
    done: list.filter((d) => d[field]).length,
    total: list.length,
    missing: list.filter((d) => !d[field]).map((d) => d.student.name)
  });
  const progress = {
    month: curM.label,
    plansOn: cur >= D.GO_LIVE.plans,
    reportsOn: cur >= D.GO_LIVE.reports,
    plans: count(curM.mine, 'planDone'),
    reports: count(curM.mine, 'reportDone')
  };

  res.status(200).json({ today, progress, cards, panel });
});

// @desc    Preview today's reminders (or any day) without sending anything
// @route   GET /api/admin/reminder-preview?date=YYYY-MM-DD
// @access  Private/Admin
const getReminderPreview = asyncHandler(async (req, res) => {
  const asked = String(req.query.date || '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : D.dayIn(new Date(), D.CAIRO_TZ);
  const { actions, warnings } = await computeActions(date, { preview: true });
  const sentKeys = new Set((await ReminderRun.find({ key: { $in: actions.map((a) => a.key) } })).map((r) => r.key));
  res.status(200).json({
    date,
    actions: actions.map((a) => ({ kind: a.kind, toName: a.toName, to: a.to, text: a.text, alreadySent: sentKeys.has(a.key) })),
    warnings
  });
});

// @desc    Which teachers actually teach each student this month (Users page mismatch check)
// @route   GET /api/users/assignment-check
// @access  Private/Admin
const getAssignmentCheck = asyncHandler(async (req, res) => {
  const cur = D.dayIn(new Date(), D.CAIRO_TZ).slice(0, 7);
  const m = await D.buildMonthDuties(cur);
  const calendarTeachers = {};
  m.duties.forEach((d) => {
    const id = String(d.student._id);
    calendarTeachers[id] = calendarTeachers[id] || [];
    calendarTeachers[id].push({ id: String(d.teacher._id), name: d.teacher.name });
  });
  res.status(200).json({ month: m.label, calendarTeachers });
});

module.exports = { getMyDuties, getReminderPreview, getAssignmentCheck };
