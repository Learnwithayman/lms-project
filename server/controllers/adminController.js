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

// ==========================================
// ✨ APPROVAL GATE FUNCTIONS
// ==========================================

// @desc    Get all pending reports for Admin review
// @route   GET /api/admin/pending-reports
// @access  Private/Admin
const getPendingReports = asyncHandler(async (req, res) => {
  // Find users who have reports that are NOT marked as 'approved'
  const users = await User.find({ "monthlyReports.approvalStatus": { $ne: "approved" } });
  
  let pending = [];
  users.forEach(user => {
    user.monthlyReports.forEach(report => {
      if (report.approvalStatus !== 'approved') {
        pending.push({
          studentId: user._id,
          studentName: user.name,
          monthYear: report.monthYear,
          isFinalized: report.isFinalized,
          quran: report.quran,
          arabic: report.arabic,
          islamicStudies: report.islamicStudies,
          totalScore: report.totalScore,
          teacherNote: report.teacherNote
        });
      }
    });
  });
  
  res.status(200).json(pending);
});

// @desc    Approve a report and publish it to the student
// @route   PUT /api/admin/approve-report
// @access  Private/Admin
const approveReport = asyncHandler(async (req, res) => {
  const { studentId, monthYear } = req.body;
  const user = await User.findById(studentId);
  
  if (!user) {
    res.status(404);
    throw new Error('Student not found');
  }

  const report = user.monthlyReports.find(r => r.monthYear === monthYear);
  if (!report) {
    res.status(404);
    throw new Error('Report not found');
  }

  // Mark as approved so it shows on the Student Portal
  report.approvalStatus = 'approved';
  await user.save();

  // 🤖 WHATSAPP AUTOMATION LOGIC (For your MacroDroid Engine)
  let whatsappMessage = '';
  if (report.isFinalized) {
    // Phase 2: Final Report Approved
    whatsappMessage = `Assalamu Alaikum! Here is the student dashboard. Please log in and see the report for ${monthYear}: https://lms.learnwithayman.com/progress?report=${monthYear.replace(' ', '')} \n\nThe best compliment you can give us is a referral! Share this link with friends, and if they sign up, you get a special reward.`;
  } else {
    // Phase 1: Draft Plan Approved
    whatsappMessage = `Assalamu Alaikum, here is our plan for ${monthYear}. May Allah help us in achieving it: https://lms.learnwithayman.com/progress?report=${monthYear.replace(' ', '')}`;
  }

  res.status(200).json({ message: 'Report approved and published.', whatsappMessage });
});

// @desc    Reject a report and request edits from the teacher
// @route   PUT /api/admin/reject-report
// @access  Private/Admin
const rejectReport = asyncHandler(async (req, res) => {
  const { studentId, monthYear, adminNotes } = req.body;
  const user = await User.findById(studentId);

  if (!user) {
    res.status(404);
    throw new Error('Student not found');
  }

  const report = user.monthlyReports.find(r => r.monthYear === monthYear);
  if (!report) {
    res.status(404);
    throw new Error('Report not found');
  }

  // Mark as rejected so the teacher knows they need to fix it
  report.approvalStatus = 'rejected';
  await user.save();

  // 🤖 WHATSAPP AUTOMATION LOGIC (To the Teacher)
  const teacherMessage = `Action Required: Admin has requested an edit on ${user.name}'s ${monthYear} Plan. \n\nAdmin Notes: "${adminNotes}" \n\nPlease go to your dashboard and update immediately.`;
  
  res.status(200).json({ message: 'Report rejected and teacher notified.', teacherMessage });
});

// ==========================================
// ✨ NEW: LEGACY PDF VAULT FUNCTION
// ==========================================
// @desc    Add a Legacy PDF link to a student's vault
// @route   POST /api/admin/legacy-report
// @access  Private/Admin
const addLegacyReport = asyncHandler(async (req, res) => {
  const { studentId, monthYear, pdfLink } = req.body;

  const user = await User.findById(studentId);
  if (!user) {
    res.status(404);
    throw new Error('Student not found');
  }

  // Push the new legacy report link
  user.legacyReports.push({ monthYear, pdfLink });
  await user.save();

  res.status(201).json({ message: 'Legacy report added successfully!', legacyReports: user.legacyReports });
});

module.exports = {
  updateTeacherRate,
  createSubscription,
  getPendingReports,
  approveReport,
  rejectReport,
  addLegacyReport
};