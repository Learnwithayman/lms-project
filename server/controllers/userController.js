const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

// 1. Import your WhatsApp Bot 
const whatsappClient = require('../utils/whatsappBot');

// @desc    Register new user
const registerUser = asyncHandler(async (req, res) => {
  // 👈 NEW: Added assignedTeachers to the destructured request body
  const { name, email, password, role, whatsappNumber, teacherGroupId, studentGroupId, hourlyRate, currency, assignedTeachers } = req.body; 

  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Please add all fields');
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  const user = await User.create({
    name,
    email,
    password, 
    role: role || 'student',
    whatsappNumber, 
    teacherGroupId: teacherGroupId || '', 
    studentGroupId: studentGroupId || '',
    hourlyRate: hourlyRate || 3.0,
    currency: currency || 'USD',
    assignedTeachers: assignedTeachers || [] // 👈 NEW: Saves the assigned teacher array
  });

  if (user) {
    res.status(201).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      teacherGroupId: user.teacherGroupId,
      currency: user.currency,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// @desc    Authenticate a user
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (user && (await bcrypt.compare(password, user.password))) {
    res.json({
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      teacherGroupId: user.teacherGroupId, 
      currency: user.currency,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error('Invalid credentials');
  }
});

// @desc    Get user data
const getMe = asyncHandler(async (req, res) => {
  res.status(200).json(req.user);
});

// @desc    Get all users (Admin only)
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find({});
  res.json(users);
});

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Delete a user
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  await user.deleteOne();
  res.status(200).json({ id: req.params.id });
});

// --- TEST FUNCTION ---
// @desc    Test sending a group message
const testGroupMessage = asyncHandler(async (req, res) => {
  const targetName = req.body.groupName || 'Test Group'; 
  const message = '🤖 Hello! This is an automated test message from the LMS backend!';

  try {
    await whatsappClient.sendMessage(targetName, message);
    res.status(200).json({ success: true, message: `Group message sent to ${targetName}!` });
  } catch (error) {
    console.error(error);
    res.status(500);
    throw new Error('Failed to send WhatsApp message');
  }
});

// --- EMERGENCY ADMIN CREATOR ---
const createAdminInstantly = asyncHandler(async (req, res) => {
  const userExists = await User.findOne({ email: 'boss@learnwithayman.com' });
  
  if (userExists) {
    return res.json({ message: 'Admin already exists! Use boss@learnwithayman.com and password: BossPassword123!' });
  }

  const user = await User.create({
    name: 'Ayman (Super Admin)',
    email: 'boss@learnwithayman.com',
    password: 'BossPassword123!',
    role: 'admin'
  });

  res.status(201).json({ message: 'SUCCESS! Admin created. Go log in!', user });
});

// ==========================================
// 🎒 SUBSCRIPTION ENGINE
// ==========================================
// @desc    Update student subscription
const updateSubscription = asyncHandler(async (req, res) => {
  const { status, startDate, endDate, totalClassesBought } = req.body;
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (status) user.subscription.status = status;
  if (startDate) user.subscription.startDate = startDate;
  if (endDate) user.subscription.endDate = endDate;
  if (totalClassesBought !== undefined) user.subscription.totalClassesBought = Number(totalClassesBought);

  await user.save();
  res.status(200).json({ message: 'Subscription updated successfully!', user });
});

// ==========================================
// 🧑‍🏫 TEACHER STUDENTS ENGINE
// ==========================================
// @desc    Get students assigned to the logged-in teacher
// @route   GET /api/users/my-students
// @access  Private (Teacher/Admin)
const getMyStudents = asyncHandler(async (req, res) => {
  const students = await User.find({ 
    role: 'student', 
    // NEW: Checks if the logged-in teacher is anywhere in the student's assigned list
    $or: [
      { assignedTeacher: req.user.id }, 
      { assignedTeachers: { $in: [req.user.id] } } 
    ]
  }).select('-password'); 
  
  res.status(200).json(students);
});

module.exports = {
  registerUser,
  loginUser,
  getMe,
  getAllUsers, 
  deleteUser, 
  testGroupMessage, 
  createAdminInstantly,
  updateSubscription,
  getMyStudents 
};