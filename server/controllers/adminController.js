const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { sendMessage } = require('../utils/whatsappBot');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

// ==========================================
// ✨ GOOGLE CALENDAR SETUP
// ==========================================
let CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json'); 
if (!fs.existsSync(CREDENTIALS_PATH)) {
  CREDENTIALS_PATH = path.join(__dirname, '..', '..', 'credentials.json'); 
}
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS_PATH,
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});
const calendar = google.calendar({ version: 'v3', auth });

// 🧠 SMART STUDENT LINK EXTRACTOR
const extractGroupCodes = async (searchQuery) => {
  let codes = { teacher: null, student: null };
  if (!searchQuery) return codes;
  
  try {
    const now = new Date();
    const past = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const future = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
    
    const response = await calendar.events.list({
      calendarId: 'admin@learnwithayman.com',
      timeMin: past.toISOString(),
      timeMax: future.toISOString(),
      q: searchQuery, 
      singleEvents: true
    });
    
    for (const event of (response.data.items || [])) {
      const description = event.description || "";
      
      // 1. Look specifically for a labeled student link
      const explicitStudent = description.match(/StudentGroup[^\n]*?chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);
      
      if (explicitStudent) {
          codes.student = `https://chat.whatsapp.com/${explicitStudent[1].trim()}`;
      } else {
          // 2. Fallback: Grab ALL links. If there are 2, the second is the student.
          const allLinks = [...description.matchAll(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/gi)];
          if (allLinks.length > 1) {
              codes.student = `https://chat.whatsapp.com/${allLinks[1][1].trim()}`;
          } else if (allLinks.length === 1) {
              codes.student = `https://chat.whatsapp.com/${allLinks[0][1].trim()}`;
          }
      }
      
      if (codes.student) break; // Stop searching once we find the student!
    }
  } catch (error) {
    console.error('⚠️ Calendar Link Extraction Error:', error.message);
  }
  return codes;
};

// @desc    Update a Teacher's Hourly Rate
// @route   PUT /api/admin/teacher-rate/:id
// @access  Private/Admin
const updateTeacherRate = asyncHandler(async (req, res) => {
  const { hourlyRate } = req.body;
  const teacher = await User.findById(req.params.id);

  if (!teacher) {
    res.status(404);
    throw new Error('Teacher not found');
  }

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

  const student = await User.findById(studentId);
  if (!student) {
    res.status(404);
    throw new Error('Student not found');
  }

  const subscription = await Subscription.create({
    student: studentId,
    totalClasses,
    classesUsed: 0,
    pricePaid,
    startDate: new Date(), 
    endDate: new Date(endDate), 
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

  report.approvalStatus = 'approved';
  await user.save();

  let whatsappMessage = '';
  if (report.isFinalized) {
    whatsappMessage = `🏆 *Monthly Report Card Available!*\n\nAssalamu Alaikum ${user.name},\n\nYour final graded report and teacher feedback for ${monthYear} are now available.\n\nPlease log in to view your scores and notes:\n🔗 https://lms.learnwithayman.com/progress`;
  } else {
    whatsappMessage = `📚 *Monthly Study Plan Available!*\n\nAssalamu Alaikum ${user.name},\n\nYour study plan for ${monthYear} has been finalized by your teacher and approved.\n\nYou can view your goals for this month in your Progress Hub:\n🔗 https://lms.learnwithayman.com/progress`;
  }

  try {
    // ✨ SEARCH CALENDAR FOR THE PERFECT STUDENT LINK
    const codes = await extractGroupCodes(user.name);
    
    // Prioritize Calendar Link -> Then DB Link -> Then DB Number
    const targetJid = codes.student || user.studentGroupId || user.whatsappGroupId || user.whatsappNumber;
    
    if (targetJid && sendMessage) {
      await sendMessage(targetJid, whatsappMessage).catch(err => console.log("Bot offline, skipping."));
    }
  } catch (err) {
    console.error("Failed to queue WhatsApp approval message:", err);
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

  report.approvalStatus = 'rejected';
  await user.save();

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

  user.legacyReports.push({ monthYear, pdfLink });
  await user.save();

  res.status(201).json({ message: 'Legacy report added successfully!', legacyReports: user.legacyReports });
});

// ==========================================
// ✨ NEW: HONOR LIST GENERATOR
// ==========================================
// @desc    Get Honor List (Students with 10/10 total score) for a specific month
// @route   GET /api/admin/honor-list/:monthYear
// @access  Private/Admin
const getHonorList = asyncHandler(async (req, res) => {
  const { monthYear } = req.params;

  const students = await User.find({ role: 'student' });
  let honorList = [];

  students.forEach(student => {
    if (student.monthlyReports && student.monthlyReports.length > 0) {
      const report = student.monthlyReports.find(r => r.monthYear === monthYear);
      
      // If the report exists, is finalized, and has a perfect score of 10
      if (report && report.isFinalized && report.totalScore === 10) {
        honorList.push({
          studentName: student.name,
          score: report.totalScore,
          quranScore: report.quran?.score || 0,
          arabicScore: report.arabic?.score || 0,
          islamicScore: report.islamicStudies?.score || 0
        });
      }
    }
  });

  // Sort alphabetically
  honorList.sort((a, b) => a.studentName.localeCompare(b.studentName));

  res.status(200).json({
    month: monthYear,
    totalHonored: honorList.length,
    students: honorList
  });
});

module.exports = {
  updateTeacherRate,
  createSubscription,
  getPendingReports,
  approveReport,
  rejectReport,
  addLegacyReport,
  getHonorList
};