const mongoose = require('mongoose');
const ClassSession = require('../models/ClassSession');
const User = require('../models/User');
const LateProgress = require('../models/LateProgress');
const whatsappClient = require('../utils/whatsappBot');
const { extractGroupCodes } = require('./scheduleController');

// ==========================================
// ⏰ LATE FLOW (Step 2)
// ==========================================
// The clock is fixed to the class start time:
//   Reminder 1 unlocks at minute 3, reminder 2 at minute 8, reminder 3 at minute 13.
//   The teacher presses each one. At minute 15 the dashboard asks the teacher to record Absent.
//   "Student has joined" sends "class has started" to the student group (so parents know).

const STEP_MINUTES = { 1: 3, 2: 8, 3: 13 };
const EARLY_TOLERANCE_MS = 30 * 1000; // allow a 30-second clock difference between phone/PC and server

// Finds who the class is for and where to send (same order as markAttendance)
const resolveClassTarget = async (req) => {
  const { classId, studentGroupId, studentGroupName, title, zoomLink } = req.body;
  let studentName = title || 'Student';
  let studentDoc = null;
  let meetingLink = zoomLink || '';
  let subject = title;

  if (mongoose.Types.ObjectId.isValid(classId)) {
    const session = await ClassSession.findById(classId).populate('student');
    if (session) {
      studentDoc = session.student;
      meetingLink = session.meetingLink || meetingLink;
      subject = session.subject || subject;
    }
  } else if (studentGroupId) {
    studentDoc = await User.findOne({ $or: [{ studentGroupId }, { whatsappGroupId: studentGroupId }, { legacyGroupIds: studentGroupId }] }); // 🔗 + old group ID
  }
  if (studentDoc && studentDoc.name) studentName = studentDoc.name;

  const codes = await extractGroupCodes(subject);
  const targetGroup = codes.student || studentDoc?.studentGroupId || studentDoc?.whatsappGroupId || studentGroupId || studentGroupName;

  const teacher = await User.findById(req.user._id);
  return { studentName, teacherName: teacher ? teacher.name : 'Teacher', meetingLink, targetGroup };
};

// ---------- Messages (reminder 1 keeps today's text; 2, 3 and "joined" as approved) ----------

const reminderMessage = (step, student, teacher, link) => {
  const joinLink = link || 'No link provided';
  if (step === 1) {
    return `السلام عليكم / Assalamu Alaikum *${student}*, ✨\n\nJust a gentle reminder that our class is scheduled to begin right now. Your teacher, *${teacher}*, has opened the room and is waiting for you!\n\n🔗 *Join the class here:*\n${joinLink}\n\nWe hope you have a wonderful class! 📚\n\nWarm regards,\n*Learn With Ayman Support Team*`;
  }
  if (step === 2) {
    return `السلام عليكم / Assalamu Alaikum *${student}*, 🌿\n\n⏰ A kind second reminder: your teacher, *${teacher}*, is still waiting for you in the class.\n\n🔗 *Join the class here:*\n${joinLink}\n\nWarm regards,\n*Learn With Ayman Support Team*`;
  }
  return `السلام عليكم / Assalamu Alaikum *${student}*,\n\n⚠️ *Final reminder:* the waiting period ends in a few minutes. Please join now so the class is not recorded as absent.\n\n🔗 *Join the class here:*\n${joinLink}\n\nWarm regards,\n*Learn With Ayman Support Team*`;
};

const joinedMessage = (student, teacher) =>
  `السلام عليكم / Assalamu Alaikum, ✨\n\n✅ *${student}* has joined and the class with *${teacher}* has started. We wish you a wonderful class! 📚\n\nWarm regards,\n*Learn With Ayman Support Team*`;

// @desc    Send late reminder 1, 2 or 3
// @route   POST /api/schedule/late-reminder
// @access  Teacher
const sendLateReminder = async (req, res) => {
  try {
    const { classId, startTime } = req.body;
    const step = Number(req.body.step);
    if (!classId || !startTime || !STEP_MINUTES[step]) {
      return res.status(400).json({ message: 'classId, startTime and step (1, 2 or 3) are required.' });
    }

    const start = new Date(startTime);
    const unlockAt = start.getTime() + STEP_MINUTES[step] * 60 * 1000;
    if (Date.now() + EARLY_TOLERANCE_MS < unlockAt) {
      return res.status(400).json({ message: `Reminder ${step} unlocks at minute ${STEP_MINUTES[step]} of the class.` });
    }

    let progress = await LateProgress.findOne({ classId, teacher: req.user._id });
    const sentSteps = progress ? progress.reminders.map((r) => r.step) : [];
    if (sentSteps.includes(step)) {
      return res.status(200).json({ message: `Reminder ${step} was already sent.`, progress });
    }
    if (step > 1 && !sentSteps.includes(step - 1)) {
      return res.status(400).json({ message: `Please send reminder ${step - 1} first.` });
    }

    const { studentName, teacherName, meetingLink, targetGroup } = await resolveClassTarget(req);
    if (!targetGroup) {
      return res.status(400).json({ message: 'No student group link found for this class, so no reminder was sent.' });
    }

    if (!progress) {
      progress = new LateProgress({ classId, teacher: req.user._id, startTime: start, studentName, reminders: [] });
    }
    progress.reminders.push({ step, sentAt: new Date() });
    await progress.save();

    whatsappClient.sendMessage(targetGroup, reminderMessage(step, studentName, teacherName, meetingLink));
    res.status(200).json({ message: `Late reminder ${step} sent!`, progress });
  } catch (error) {
    console.error('Error sending late reminder:', error);
    res.status(500).json({ message: 'Server error while sending the late reminder.' });
  }
};

// @desc    Teacher confirms the student joined → "class has started" to the student group
// @route   POST /api/schedule/student-joined
// @access  Teacher
const markStudentJoined = async (req, res) => {
  try {
    const { classId, startTime } = req.body;
    if (!classId || !startTime) return res.status(400).json({ message: 'classId and startTime are required.' });

    let progress = await LateProgress.findOne({ classId, teacher: req.user._id });
    if (progress && progress.joinedAt) {
      return res.status(200).json({ message: 'Already marked as joined.', progress });
    }

    const { studentName, teacherName, targetGroup } = await resolveClassTarget(req);
    if (!targetGroup) {
      return res.status(400).json({ message: 'No student group link found for this class, so no message was sent.' });
    }

    if (!progress) {
      progress = new LateProgress({ classId, teacher: req.user._id, startTime: new Date(startTime), studentName, reminders: [] });
    }
    progress.joinedAt = new Date();
    await progress.save();

    whatsappClient.sendMessage(targetGroup, joinedMessage(studentName, teacherName));
    res.status(200).json({ message: 'Student marked as joined. Message sent!', progress });
  } catch (error) {
    console.error('Error marking student joined:', error);
    res.status(500).json({ message: 'Server error while marking the student as joined.' });
  }
};

// @desc    The teacher's late progress for recent classes (last 24 hours)
// @route   GET /api/schedule/late-progress
// @access  Teacher
const getLateProgress = async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const list = await LateProgress.find({ teacher: req.user._id, startTime: { $gte: since } });
    res.status(200).json(list);
  } catch (error) {
    console.error('Error loading late progress:', error);
    res.status(500).json({ message: 'Server error while loading late progress.' });
  }
};

module.exports = { sendLateReminder, markStudentJoined, getLateProgress };
