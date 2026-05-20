const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

// 1. Import your WhatsApp Bot 
const whatsappClient = require('../utils/whatsappBot');

// @desc    Register new user
const registerUser = asyncHandler(async (req, res) => {
  // 2. Catch both whatsappNumber AND whatsappGroupId from the frontend form
  const { name, email, password, role, whatsappNumber, whatsappGroupId } = req.body; 

  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Please add all fields');
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error('User already exists');
  }

  // 3. Save the whatsappGroupId to the database alongside the other info
  const user = await User.create({
    name,
    email,
    password, 
    role: role || 'student',
    whatsappNumber, 
    whatsappGroupId, // <--- NEW: Saves the specific group ID directly to the student!
  });

  if (user) {
    res.status(201).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
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

// --- NEW TEST FUNCTION ---
// @desc    Test sending a group message
const testGroupMessage = asyncHandler(async (req, res) => {
  
  // 👉 PASTE YOUR EXACT GROUP ID INSIDE THESE QUOTES 👈
  const groupId = '120363328067141087@g.us'; 
  
  const message = '🤖 Hello! This is an automated test message from the LMS backend!';

  try {
    await whatsappClient.sendMessage(groupId, message);
    res.status(200).json({ success: true, message: 'Group message sent!' });
  } catch (error) {
    console.error(error);
    res.status(500);
    throw new Error('Failed to send WhatsApp message');
  }
});

module.exports = {
  registerUser,
  loginUser,
  getMe,
  getAllUsers, 
  deleteUser, 
  testGroupMessage, 
};