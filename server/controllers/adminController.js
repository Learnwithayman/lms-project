const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Subscription = require('../models/Subscription');

// @desc    Update a Teacher's Hourly Rate
// @route   PUT /api/admin/teacher-rate/:id
// @access  Private/Admin
const updateTeacherRate = asyncHandler(async (req, res) => {
  const { hourlyRate } = req.body;
  
  // Find the teacher
  const teacher = await User.findById(req.params.id);

  if (!teacher) {
    res.status(404);
    throw new Error('Teacher not found');
  }

  // Update the rate
  teacher.hourlyRate = hourlyRate;
  await teacher.save();

  res.status(200).json({
    id: teacher._id,
    name: teacher.name,
    newRate: teacher.hourlyRate,
    message: `Success! ${teacher.name}'s rate is now $${hourlyRate}/hr`
  });
});

// @desc    Create a Subscription for a Student (The Wallet)
// @route   POST /api/admin/subscription
// @access  Private/Admin
const createSubscription = asyncHandler(async (req, res) => {
  const { studentId, totalClasses, pricePaid, endDate } = req.body;

  // Check if student exists
  const student = await User.findById(studentId);
  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  // Create the subscription
  const subscription = await Subscription.create({
    student: studentId,
    totalClasses,
    classesUsed: 0,
    pricePaid,
    startDate: new Date(), // Starts Now
    endDate: new Date(endDate), // e.g., 30 days from now
    active: true,
  });

  res.status(201).json(subscription);
});

module.exports = {
  updateTeacherRate,
  createSubscription,
};