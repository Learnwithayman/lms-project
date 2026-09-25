const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// 1. Import your WhatsApp Bot 
const whatsappClient = require('../utils/whatsappBot');

// --- GOOGLE CALENDAR DIRECT AUTH SETUP ---
let CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json'); 
if (!fs.existsSync(CREDENTIALS_PATH)) {
  CREDENTIALS_PATH = path.join(__dirname, '..', '..', 'credentials.json'); 
}
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS_PATH,
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});
const calendar = google.calendar({ version: 'v3', auth });

// @desc    Register new user
const registerUser = asyncHandler(async (req, res) => {
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
    assignedTeachers: assignedTeachers || [] 
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
  const { status, startDate, endDate, totalClassesBought, classesUsed } = req.body;
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (status) user.subscription.status = status;
  if (startDate) user.subscription.startDate = startDate;
  if (endDate) user.subscription.endDate = endDate;
  if (totalClassesBought !== undefined) user.subscription.totalClassesBought = Number(totalClassesBought);
  
  if (classesUsed !== undefined) user.subscription.classesUsed = Number(classesUsed);

  await user.save();
  res.status(200).json({ message: 'Subscription updated successfully!', user });
});

// ⚡ 2-PHASE AUTO-COUNT ENGINE
// Phase 1: Start Date -> NOW (Classes Done)
// Phase 2: NOW -> End Date (Classes Remaining)
// @desc    Auto-count student classes directly from Google Calendar
// @route   POST /api/users/:id/sync-wallet
// @access  Private (Admin)
const syncStudentWallet = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate, totalClassesBought: inputTotal } = req.body;

  const student = await User.findById(id);
  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  const start = startDate ? new Date(startDate) : new Date();
  start.setHours(0, 0, 0, 0);

  const end = endDate ? new Date(endDate) : new Date(start.getTime() + 28 * 24 * 60 * 60 * 1000);
  end.setHours(23, 59, 59, 999);

  const now = new Date();

  const studentFullName = (student.name || '').toLowerCase().trim();
  const studentFirstName = studentFullName.split(' ')[0];
  const studentGroupId = (student.studentGroupId || '').toLowerCase().trim();

  let classesDone = 0;      // Phase 1: Start Date to NOW
  let classesRemaining = 0; // Phase 2: NOW to End Date

  try {
    const response = await calendar.events.list({
      calendarId: 'admin@learnwithayman.com',
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    events.forEach(evt => {
      if (evt.status === 'cancelled') return;

      const summary = (evt.summary || '').toLowerCase();
      const description = (evt.description || '').toLowerCase();

      const matchesFullName = studentFullName && (summary.includes(studentFullName) || description.includes(studentFullName));
      const matchesFirstName = studentFirstName && studentFirstName.length >= 3 && (summary.includes(studentFirstName) || description.includes(studentFirstName));
      const matchesGroupId = studentGroupId && studentGroupId.length > 3 && description.includes(studentGroupId);

      if (matchesFullName || matchesFirstName || matchesGroupId) {
        const rawTime = evt.start?.dateTime || evt.start?.date;
        if (!rawTime) return;

        const eventTime = new Date(rawTime).getTime();
        const nowTime = now.getTime();

        // Phase 1: Past classes (Start Date -> NOW)
        if (eventTime < nowTime) {
          classesDone++;
        } 
        // Phase 2: Future classes (NOW -> End Date)
        else {
          classesRemaining++;
        }
      }
    });

  } catch (err) {
    console.error("Google Calendar Auto-Sync Error:", err.message);
  }

  const calendarTotal = classesDone + classesRemaining;
  const finalTotal = Number(inputTotal) > 0 ? Number(inputTotal) : calendarTotal;

  student.subscription = {
    status: 'active',
    totalClassesBought: finalTotal,
    classesUsed: classesDone, // Phase 1: Classes Done
    startDate: start,
    endDate: end
  };

  await student.save();

  res.status(200).json({
    message: `⚡ 2-Phase Auto-Sync Complete!\n\n• Phase 1 (Classes Done before today): ${classesDone}\n• Phase 2 (Classes Remaining from today): ${classesRemaining}\n• Total Package: ${finalTotal}`,
    subscription: student.subscription,
    classesDone,
    classesRemaining
  });
});

// ==========================================
// 🧑‍🏫 TEACHER STUDENTS ENGINE
// ==========================================
// @desc    Get students assigned to the logged-in teacher
const getMyStudents = asyncHandler(async (req, res) => {
  const students = await User.find({ 
    role: 'student', 
    $or: [
      { assignedTeacher: req.user.id }, 
      { assignedTeachers: { $in: [req.user.id] } } 
    ]
  }).select('-password'); 
  
  res.status(200).json(students);
});

// Assign Teachers directly to a student profile
const assignTeachers = asyncHandler(async (req, res) => {
  const { assignedTeachers } = req.body;
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  user.assignedTeachers = assignedTeachers;
  await user.save();

  res.status(200).json({ message: 'Teachers updated successfully!', user });
});

// Update user profile details
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  ).select('-password');

  res.status(200).json(updatedUser);
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
  syncStudentWallet,
  getMyStudents,
  assignTeachers,
  updateUserProfile
};