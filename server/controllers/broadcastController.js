const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { sendMessage } = require('../utils/whatsappBot');
const { loginBlock } = require('../utils/studentLogin');

// ==========================================
// 📣 STEP 9: SEND UPDATES (Admin)
// ==========================================
// Messages go through the existing WhatsApp queue: one every 20 seconds, in order.
// Teachers: only those marked Active (broadcastActive). Students: all except paused / away.

const ADMIN_GROUP = process.env.ADMIN_WHATSAPP_NUMBER || 'https://chat.whatsapp.com/BYFE1IPRs2KGJNhGaxvpJd';
const TEACHER_GREETING = 'السلام عليكم معلمينا ومعلماتنا الأفاضل';
const SIGN = '*Learn With Ayman Admin Team* 💚';

const isPaused = (u) => !!(u.pause && (u.pause.kind === 'full' || u.pause.kind === 'away'));
const cleanText = (t) => String(t || '').trim();
const groupOf = (u, field) => (u[field] || '').trim();

// @route GET /api/admin/broadcast/recipients
const getRecipients = asyncHandler(async (req, res) => {
  const teachers = await User.find({ role: 'teacher' });
  const students = await User.find({ role: 'student' });
  res.status(200).json({
    teachers: teachers.map((t) => ({ id: String(t._id), name: t.name, active: !!t.broadcastActive, hasGroup: !!groupOf(t, 'teacherGroupId') })),
    students: students.map((s) => ({
      id: String(s._id),
      name: s.name,
      hasGroup: !!groupOf(s, 'studentGroupId'),
      paused: isPaused(s),
      assignedTeacherIds: (s.assignedTeachers || []).map(String)
    })).sort((a, b) => a.name.localeCompare(b.name))
  });
});

// @route PUT /api/admin/broadcast/teacher/:id { active }
const setTeacherActive = asyncHandler(async (req, res) => {
  const t = await User.findById(req.params.id);
  if (!t || t.role !== 'teacher') {
    res.status(404);
    throw new Error('Teacher not found.');
  }
  t.broadcastActive = !!(req.body && req.body.active);
  await t.save();
  res.status(200).json({ id: String(t._id), active: t.broadcastActive });
});

// Sends in order through the queue; the page does not wait for every message
const queueAll = (jobs, label) => {
  const results = jobs.map((job) => sendMessage(job.to, job.text).then(() => true).catch(() => false));
  Promise.all(results).then((ok) => {
    console.log(`📣 ${label}: ${ok.filter(Boolean).length} sent, ${ok.filter((x) => !x).length} failed`);
  });
};

// @route POST /api/admin/broadcast/teachers { message }
const sendTeachers = asyncHandler(async (req, res) => {
  const body = cleanText(req.body && req.body.message);
  if (!body) {
    res.status(400);
    throw new Error('Please write the message first.');
  }
  const teachers = (await User.find({ role: 'teacher', broadcastActive: true })).filter((t) => groupOf(t, 'teacherGroupId'));
  if (!teachers.length) {
    res.status(400);
    throw new Error('No active teachers with a group link. Tick "Active" for the teachers first.');
  }
  const text = `${TEACHER_GREETING}\n\n${body}\n\n${SIGN}`;
  queueAll(teachers.map((t) => ({ to: groupOf(t, 'teacherGroupId'), text })), 'Teacher update');
  res.status(200).json({ message: `Queued for ${teachers.length} teacher(s), one every 20 seconds.`, count: teachers.length, names: teachers.map((t) => t.name) });
});

// @route POST /api/admin/broadcast/students { message, studentIds }
const sendStudents = asyncHandler(async (req, res) => {
  const body = cleanText(req.body && req.body.message);
  const ids = new Set(((req.body && req.body.studentIds) || []).map(String));
  if (!body) {
    res.status(400);
    throw new Error('Please write the message first.');
  }
  if (!ids.size) {
    res.status(400);
    throw new Error('Choose at least one student.');
  }
  const students = (await User.find({ role: 'student', _id: { $in: [...ids] } })).filter((s) => !isPaused(s)); // paused / away are never sent
  const withGroup = students.filter((s) => groupOf(s, 'studentGroupId'));
  if (!withGroup.length) {
    res.status(400);
    throw new Error('None of the chosen students has a group link saved.');
  }
  const jobs = withGroup.map((s) => ({
    to: groupOf(s, 'studentGroupId'),
    text: `السلام عليكم / Assalamu Alaikum *${s.name.trim()}* 🌿\n\n${body}\n\n${loginBlock(s)}\n${SIGN}`
  }));
  queueAll(jobs, 'Student update');
  const skipped = students.length - withGroup.length;
  res.status(200).json({
    message: `Queued for ${withGroup.length} student(s), one every 20 seconds.${skipped ? ` ${skipped} skipped (no group link).` : ''}`,
    count: withGroup.length,
    skippedNoGroup: skipped,
    pausedSkipped: ids.size - students.length
  });
});

module.exports = { getRecipients, setTeacherActive, sendTeachers, sendStudents, ADMIN_GROUP };
