const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const MakeupRequest = require('../models/MakeupRequest');

const getSubscriptionSummary = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const now = new Date();
  
  // Filter for valid, unused makeup credits
  const activeMakeups = user.makeupBank ? user.makeupBank.filter(
    (makeup) => !makeup.isUsed && new Date(makeup.expirationDate) > now
  ) : [];

  res.status(200).json({
    subscription: user.subscription || { status: 'none', totalClassesBought: 0, classesUsed: 0 },
    makeupCount: activeMakeups.length,
    activeMakeups: activeMakeups,
    // ✨ NEW: Send the Study Plans and Reports to the frontend charts
    monthlyReports: user.monthlyReports || [] 
  });
});

const requestMakeup = asyncHandler(async (req, res) => {
  const { originalDate, preferredDate, reason } = req.body;

  if (!originalDate || !preferredDate) {
    res.status(400);
    throw new Error('Please provide both the original missed date and your preferred makeup date.');
  }

  const request = await MakeupRequest.create({
    student: req.user._id,
    originalDate,
    preferredDate,
    reason
  });

  res.status(201).json(request);
});

// @desc    Add or update a monthly report (Phase 1 or Phase 2)
// @route   POST /api/student/reports
// @access  Private (Teacher)
const addOrUpdateReport = asyncHandler(async (req, res) => {
  const { studentIdentifier, monthYear, isFinalized, teacherNote, quran, arabic, islamicStudies } = req.body;

  if (!studentIdentifier) {
    res.status(400);
    throw new Error('No student identifier was found from the calendar event.');
  }

  const searchName = studentIdentifier.trim();

  // 🧠 SMART SEARCH: Case-insensitive regex search to forgive minor typos
  const student = await User.findOne({
    $or: [ 
      { name: { $regex: new RegExp(`^${searchName}$`, 'i') } }, 
      { studentGroupId: searchName } 
    ],
    role: 'student'
  });

  if (!student) {
    res.status(404);
    throw new Error(`❌ Database Error: Could not find a student named "${searchName}". Please check the student's exact name in the Admin Users tab.`);
  }

  // Calculate total score if finalized
  let totalScore = null;
  if (isFinalized) {
    totalScore = (Number(quran?.score) || 0) + (Number(arabic?.score) || 0) + (Number(islamicStudies?.score) || 0);
  }

  const existingReportIndex = student.monthlyReports.findIndex(r => r.monthYear === monthYear);
  const reportData = { monthYear, isFinalized, teacherNote, quran, arabic, islamicStudies, totalScore, approvalStatus: 'pending' };

  if (existingReportIndex >= 0) {
    student.monthlyReports[existingReportIndex] = { 
        ...student.monthlyReports[existingReportIndex].toObject(), 
        ...reportData 
    };
  } else {
    student.monthlyReports.push(reportData);
  }

  await student.save();
  res.status(200).json({ message: 'Report saved successfully', reports: student.monthlyReports });
});

// @desc    Submit a grade appeal
// @route   POST /api/student/appeal-report
// @access  Private (Student/Parent)
const appealReport = asyncHandler(async (req, res) => {
  const { monthYear, reason } = req.body;
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // 🤖 WHATSAPP AUTOMATION LOGIC (To the Admin)
  const adminMessage = `⚖️ NEW GRADE APPEAL \n\nStudent: ${user.name}\nPhone: ${user.whatsappNumber || 'N/A'}\nReport: ${monthYear}\nReason: "${reason}" \n\nPlease review this with the teacher and contact the parent.`;

  // NOTE: Insert your MacroDroid queue save here directed to your Admin WhatsApp number
  console.log("Admin Alert:", adminMessage);

  res.status(200).json({ message: 'Appeal submitted successfully', adminMessage });
});

module.exports = {
  getSubscriptionSummary,
  requestMakeup,
  addOrUpdateReport,
  appealReport 
};