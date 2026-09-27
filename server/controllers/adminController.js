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

// Helper to pull the Student's exact invite link from Calendar
const extractStudentLinkFromCalendar = async (searchQuery) => {
  if (!searchQuery) return null;
  try {
    const now = new Date();
    const past = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000)); 
    const future = new Date(now.getTime() + (60 * 24 * 60 * 60 * 1000));
    
    const response = await calendar.events.list({
      calendarId: 'admin@learnwithayman.com',
      timeMin: past.toISOString(),
      timeMax: future.toISOString(),
      q: searchQuery, 
      singleEvents: true
    });
    
    for (const event of (response.data.items || [])) {
      const description = event.description || "";
      const cleanDesc = description.replace(/<[^>]*>?/gm, ' ').replace(/&nbsp;/g, ' ');

      // 1. Prioritize explicitly labeled Student Links
      const explicitStudentLink = cleanDesc.match(/StudentGroupLink[\s\S]*?chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);
      if (explicitStudentLink && explicitStudentLink[1] !== 'null') {
          return `https://chat.whatsapp.com/${explicitStudentLink[1].trim()}`;
      }

      // 2. Fallback: Find all links. If there are two, the second is usually the student. 
      const allLinks = [...cleanDesc.matchAll(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/gi)];
      if (allLinks.length > 1) {
          return `https://chat.whatsapp.com/${allLinks[1][1].trim()}`;
      } else if (allLinks.length === 1) {
          return `https://chat.whatsapp.com/${allLinks[0][1].trim()}`;
      }
    }
  } catch (error) {
    console.error('Admin Calendar Link Extraction Error:', error.message);
  }
  return null;
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
    // ✨ FIX: Search Google Calendar FIRST for the dynamic Invite Link. 
    // Fallback to the database profile only if the calendar search fails.
    let targetJid = await extractStudentLinkFromCalendar(user.name);
    
    if (!targetJid) {
        targetJid = user.studentGroupId || user.whatsappGroupId || user.whatsappNumber;
    }
    
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

module.exports = {
  updateTeacherRate,
  createSubscription,
  getPendingReports,
  approveReport,
  rejectReport,
  addLegacyReport
};