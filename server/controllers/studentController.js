const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const MakeupRequest = require('../models/MakeupRequest');
const { sendMessage } = require('../utils/whatsappBot'); 

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

  // 🤖 TRIGGER WHATSAPP ALERT TO ADMIN
  try {
    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER; 
    if (adminPhone && sendMessage) {
      const phaseName = isFinalized ? "Phase 2 (Final Grades)" : "Phase 1 (Draft Plan)";
      const msg = `📝 *Pending Approval Alert*\n\n*Student:* ${student.name}\n*Month:* ${monthYear}\n*Submission:* ${phaseName}\n\nPlease log in to the Admin Dashboard to review and approve.`;
      
      await sendMessage(`${adminPhone}@s.whatsapp.net`, msg).catch(err => console.log("Bot offline, skipping message."));
    }
  } catch (err) {
    console.error("Failed to send WhatsApp alert for report:", err);
  }

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
  const adminMessage = `⚖️ *NEW GRADE APPEAL* \n\n*Student:* ${user.name}\n*Phone:* ${user.whatsappNumber || 'N/A'}\n*Report:* ${monthYear}\n*Reason:* "${reason}" \n\nPlease review this with the teacher and contact the parent.`;

  try {
    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
    if (adminPhone && sendMessage) {
      await sendMessage(`${adminPhone}@s.whatsapp.net`, adminMessage).catch(err => console.log("Bot offline, skipping appeal message."));
    }
  } catch (err) {
    console.error("Failed to send appeal WhatsApp alert:", err);
  }

  res.status(200).json({ message: 'Appeal submitted successfully', adminMessage });
});

// @desc    Get an existing report for a specific student and month
// @route   GET /api/student/reports/:studentIdentifier/:monthYear
// @access  Private (Teacher/Admin)
const getExistingReport = asyncHandler(async (req, res) => {
  const { studentIdentifier, monthYear } = req.params;

  if (!studentIdentifier) {
    res.status(400);
    throw new Error('No student identifier provided.');
  }

  const searchName = studentIdentifier.trim();

  // Smart Search to find the student
  const student = await User.findOne({
    $or: [ 
      { name: { $regex: new RegExp(`^${searchName}$`, 'i') } }, 
      { studentGroupId: searchName } 
    ],
    role: 'student'
  });

  if (!student) {
    res.status(404);
    throw new Error(`Could not find a student named "${searchName}".`);
  }

  // Look for the specific month's report
  const report = student.monthlyReports.find(r => r.monthYear === monthYear);

  if (!report) {
    return res.status(200).json(null); 
  }

  res.status(200).json(report);
});

// @desc    Get report statuses for all students (Teacher View)
// @route   GET /api/student/reports-status
// @access  Private (Teacher)
const getStudentReportStatuses = asyncHandler(async (req, res) => {
  const students = await User.find({ role: 'student' });
  const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  const statuses = {};

  students.forEach(student => {
    const report = student.monthlyReports?.find(r => r.monthYear === currentMonth);
    let status = '⚪ No Plan Yet';

    if (report) {
      if (report.isFinalized && report.approvalStatus === 'approved') {
        status = '🏆 Phase 2 Finalized';
      } else if (report.isFinalized && report.approvalStatus !== 'approved') {
        status = '🟡 Phase 2 Pending Admin';
      } else if (!report.isFinalized && report.approvalStatus === 'approved') {
        status = '🟢 Phase 1 Active';
      } else {
        status = '🔵 Phase 1 Drafted (Pending Admin)';
      }
    }

    // Map by both name and studentGroupId to ensure the frontend can match it perfectly
    if (student.name) statuses[student.name.toLowerCase()] = status;
    if (student.studentGroupId) statuses[student.studentGroupId.toLowerCase()] = status;
  });

  res.status(200).json(statuses);
});

module.exports = {
  getSubscriptionSummary,
  requestMakeup,
  addOrUpdateReport,
  appealReport,
  getExistingReport,
  getStudentReportStatuses 
};