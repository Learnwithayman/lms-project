const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { sendMessage } = require('../utils/whatsappBot');
const D = require('../utils/reportDuties'); // 📋 Step 5: who owes which plan / report
const { STUDENT_PASSWORD } = require('../utils/studentLogin'); // 🔐 shared student password
const ClassChange = require('../models/ClassChange'); // 📜 Step 7: postpone / cancel counts
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
      
      const explicitStudent = description.match(/StudentGroup[^\n]*?chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);
      
      if (explicitStudent) {
          codes.student = `https://chat.whatsapp.com/${explicitStudent[1].trim()}`;
      } else {
          const allLinks = [...description.matchAll(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/gi)];
          if (allLinks.length > 1) {
              codes.student = `https://chat.whatsapp.com/${allLinks[1][1].trim()}`;
          } else if (allLinks.length === 1) {
              codes.student = `https://chat.whatsapp.com/${allLinks[0][1].trim()}`;
          }
      }
      
      if (codes.student) break; 
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
  // ✨ FIX: Fetch ALL students and filter their reports manually to prevent MongoDB array query bugs
  const users = await User.find({ role: 'student' });
  
  let pending = [];
  users.forEach(user => {
    if (user.monthlyReports && user.monthlyReports.length > 0) {
      user.monthlyReports.forEach(report => {
        // Find every single report across all months that is not marked as 'approved'
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
            teacherNote: report.teacherNote,
            lastSavedByName: report.lastSavedByName || '',
            lastSavedAt: report.lastSavedAt || null
          });
        }
      });
    }
  });

  // 👥 Step 5: two-teacher students — how many teachers saved this part, and who we are still waiting for
  const monthKeys = [...new Set(pending.map((p) => D.normMonth(p.monthYear)).filter((k) => k && k >= D.GO_LIVE.reports))];
  const dutiesByMonth = {};
  for (const key of monthKeys) {
    try {
      dutiesByMonth[key] = (await D.buildMonthDuties(key, { students: users })).duties;
    } catch (error) {
      console.error(`Could not check teachers for ${key}:`, error.message);
    }
  }
  pending.forEach((p) => {
    const duties = (dutiesByMonth[D.normMonth(p.monthYear)] || []).filter((d) => String(d.student._id) === String(p.studentId));
    const field = p.isFinalized ? 'reportDone' : 'planDone';
    p.teacherCount = duties.length;
    p.doneCount = duties.filter((d) => d[field]).length;
    p.waitingFor = duties.filter((d) => !d[field]).map((d) => d.teacher.name);
  });
  
  res.status(200).json(pending);
});

// @desc    Approve a report and publish it to the student
// @route   PUT /api/admin/approve-report
// @access  Private/Admin
const approveReport = asyncHandler(async (req, res) => {
  const { studentId, monthYear, mode, waitingFor } = req.body;
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

  // 👥 Step 5: "Approve and wait for {name}" → approved, but the student message waits for the other teacher
  if (mode === 'wait') {
    report.waitingForNames = Array.isArray(waitingFor) ? waitingFor : [];
    await user.save();
    return res.status(200).json({ message: `Approved. The student message will go out after ${report.waitingForNames.join(', ') || 'the other teacher'} saves and you approve.`, waiting: true });
  }

  // 📨 The student gets the message only once per phase (plan / report)
  report.waitingForNames = [];
  const sentField = report.isFinalized ? 'reportSentAt' : 'planSentAt';
  const alreadySent = !!report[sentField];
  if (!alreadySent) report[sentField] = new Date();
  await user.save();

  const commonPassword = STUDENT_PASSWORD; // 🔐 shared value (utils/studentLogin.js)

  let whatsappMessage = '';
  if (report.isFinalized) {
    whatsappMessage = `🏆 *Monthly Report Card Available!*\n\nAssalamu Alaikum ${user.name},\n\nYour final graded report and teacher feedback for ${monthYear} are now available.\n\nPlease log in to view your scores and notes:\n🔗 https://lms.learnwithayman.com \n\n🔐 *Your Login Details:*\n*Email:* ${user.email}\n*Password:* ${commonPassword}\n`;
  } else {
    whatsappMessage = `📚 *Monthly Study Plan Available!*\n\nAssalamu Alaikum ${user.name},\n\nYour study plan for ${monthYear} has been finalized by your teacher and approved.\n\nYou can view your goals for this month in your Progress Hub:\n🔗 https://lms.learnwithayman.com \n\n🔐 *Your Login Details:*\n*Email:* ${user.email}\n*Password:* ${commonPassword}\n`;
  }

  try {
    const codes = await extractGroupCodes(user.name);
    const targetJid = codes.student || user.studentGroupId || user.whatsappGroupId || user.whatsappNumber;
    
    if (targetJid && sendMessage && !alreadySent) {
      await sendMessage(targetJid, whatsappMessage).catch(err => console.log("Bot offline, skipping."));
    }
  } catch (err) {
    console.error("Failed to queue WhatsApp approval message:", err);
  }

  res.status(200).json({ message: alreadySent ? "Approved. The student was already sent this month's message, so no new message was sent." : 'Report approved and published.', whatsappMessage, alreadySent });
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
// ✨ LEGACY PDF VAULT FUNCTION
// ==========================================
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
// ✨ HONOR LIST GENERATOR
// ==========================================
const getHonorList = asyncHandler(async (req, res) => {
  const { monthYear } = req.params;

  const students = await User.find({ role: 'student' });
  let honorList = [];

  students.forEach(student => {
    if (student.monthlyReports && student.monthlyReports.length > 0) {
      const report = student.monthlyReports.find(r => r.monthYear === monthYear);
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

  honorList.sort((a, b) => a.studentName.localeCompare(b.studentName));

  res.status(200).json({
    month: monthYear,
    totalHonored: honorList.length,
    students: honorList
  });
});

// ==========================================
// ✨ SCHOOL-WIDE REPORT TRACKER
// ==========================================
const getMonthlyReportTracking = asyncHandler(async (req, res) => {
  const { monthYear } = req.params;
  const key = D.normMonth(monthYear);
  if (!key) {
    res.status(400);
    throw new Error(`Unknown month "${monthYear}"`);
  }

  // 📋 Step 5: only students who really owe something this month (a class on Google Calendar, not fully paused)
  const m = await D.buildMonthDuties(key);
  const rows = new Map();
  m.duties.forEach((d) => {
    const id = String(d.student._id);
    if (!rows.has(id)) {
      const r = d.record;
      rows.set(id, {
        studentId: d.student._id,
        studentName: d.student.name,
        status: r ? (r.isFinalized ? 'Final Report' : 'Draft Plan') : 'Missing',
        approvalStatus: r ? (r.approvalStatus || 'pending') : 'N/A',
        teachers: []
      });
    }
    rows.get(id).teachers.push({
      teacherId: String(d.teacher._id),
      name: d.teacher.name,
      planDone: d.planDone,
      reportDone: d.reportDone,
      planOnTime: d.planOnTime,
      reportOnTime: d.reportOnTime
    });
  });

  const trackingData = [...rows.values()].map((r) => ({
    ...r,
    teacherCount: r.teachers.length,
    plansDone: r.teachers.filter((t) => t.planDone).length,
    reportsDone: r.teachers.filter((t) => t.reportDone).length
  }));
  trackingData.sort((a, b) => a.studentName.localeCompare(b.studentName));

  // ⏱️ On time vs late, per teacher
  const stats = new Map();
  m.duties.forEach((d) => {
    const id = String(d.teacher._id);
    if (!stats.has(id)) stats.set(id, { teacherId: id, name: d.teacher.name, students: 0, plansSaved: 0, plansOnTime: 0, plansLate: 0, reportsSaved: 0, reportsOnTime: 0, reportsLate: 0 });
    const s = stats.get(id);
    s.students += 1;
    if (d.planDone) s.plansSaved += 1;
    if (d.planOnTime === true) s.plansOnTime += 1;
    if (d.planOnTime === false) s.plansLate += 1;
    if (d.reportDone) s.reportsSaved += 1;
    if (d.reportOnTime === true) s.reportsOnTime += 1;
    if (d.reportOnTime === false) s.reportsLate += 1;
  });
  const teacherStats = [...stats.values()].sort((a, b) => a.name.localeCompare(b.name));

  // 📜 Step 7: postponed / cancelled classes this month (by the class date), per student and per teacher
  const [y, mo] = key.split('-').map(Number);
  const changes = await ClassChange.find({
    action: { $in: ['postpone', 'move', 'teacher-change', 'cancel'] },
    oldStart: { $gte: new Date(Date.UTC(y, mo - 1, 1) - 86400000), $lt: new Date(Date.UTC(y, mo, 1) + 86400000) }
  });
  const changeCount = (list) => ({
    postponed: list.filter((c) => c.action !== 'cancel').length,
    cancelled: list.filter((c) => c.action === 'cancel').length
  });
  const monthChanges = changes.filter((c) => D.monthIn(c.oldStart, D.STUDENT_TZ) === key);
  trackingData.forEach((row) => { row.changes = changeCount(monthChanges.filter((c) => String(c.student) === String(row.studentId))); });
  teacherStats.forEach((t) => { t.changes = changeCount(monthChanges.filter((c) => String(c.teacher) === String(t.teacherId))); });

  const summary = {
    total: trackingData.length,
    missing: trackingData.filter(t => t.status === 'Missing').length,
    draft: trackingData.filter(t => t.status === 'Draft Plan').length,
    final: trackingData.filter(t => t.status === 'Final Report').length,
  };

  res.status(200).json({ month: m.label, summary, trackingData, teacherStats });
});

module.exports = {
  updateTeacherRate,
  createSubscription,
  getPendingReports,
  approveReport,
  rejectReport,
  addLegacyReport,
  getHonorList,
  getMonthlyReportTracking
};