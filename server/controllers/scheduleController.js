const asyncHandler = require('express-async-handler');
const ClassSession = require('../models/ClassSession');

// @desc    Schedule a new class
const scheduleClass = asyncHandler(async (req, res) => {
  const { teacherId, studentId, subject, startTime, durationMinutes, meetingLink } = req.body;

  if (!teacherId || !studentId || !subject || !startTime || !durationMinutes) {
    res.status(400);
    throw new Error('Please add all fields');
  }

  const session = await ClassSession.create({
    teacher: teacherId,
    student: studentId,
    subject,
    meetingLink: meetingLink || '',
    startTime,
    durationMinutes,
  });

  res.status(201).json(session);
});

// @desc    Get classes for the logged-in user
const getMyClasses = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const classes = await ClassSession.find({
    $or: [{ teacher: userId }, { student: userId }]
  })
  .populate('teacher', 'name email')
  .populate('student', 'name email')
  .sort({ startTime: 1 });

  res.status(200).json(classes);
});

// @desc    Delete a class session
const deleteClass = asyncHandler(async (req, res) => {
  const session = await ClassSession.findById(req.params.id);

  if (!session) {
    res.status(404);
    throw new Error('Class not found');
  }

  await session.deleteOne();
  res.status(200).json({ id: req.params.id });
});

// @desc    Get ALL classes (For Admin) - NEW
const getAllClasses = asyncHandler(async (req, res) => {
  const classes = await ClassSession.find({})
    .populate('teacher', 'name email')
    .populate('student', 'name email')
    .sort({ startTime: 1 }); // Sort by soonest first
  res.status(200).json(classes);
});

// @desc    Update class time (Admin only) - NEW
const updateClass = asyncHandler(async (req, res) => {
  const { newStartTime } = req.body;
  const session = await ClassSession.findById(req.params.id);

  if (!session) {
    res.status(404);
    throw new Error('Class not found');
  }

  session.startTime = newStartTime;
  await session.save();

  res.status(200).json(session);
});

module.exports = {
  scheduleClass,
  getMyClasses,
  deleteClass,
  getAllClasses,
  updateClass,
};