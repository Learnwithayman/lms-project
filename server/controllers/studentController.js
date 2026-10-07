const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const MakeupRequest = require('../models/MakeupRequest');
const whatsappClient = require('../utils/whatsappBot'); 

const getSubscriptionSummary = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const now = new Date();
  
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
const addOrUpdateReport = async (req, res) => {
  try {
    const { studentIdentifier, monthYear, isFinalized, teacherNote, quran, arabic, islamicStudies } = req.body;

    if (!studentIdentifier) {
      return res.status(400).json({ message: 'No student identifier was found from the calendar event.' });
    }

    const searchName = studentIdentifier.split('-')[0].trim();
    const safeSearchName = searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const student = await User.findOne({
      $or: [ 
        { name: { $regex: new RegExp(safeSearchName, 'i') } }, 
        { studentGroupId: studentIdentifier.trim() },
        { whatsappGroupId: studentIdentifier.trim() }
      ],
      role: 'student'
    });

    if (!student) {
      return res.status(404).json({ message: `❌ Could not find a student named "${searchName}". Please check the Admin Users tab.` });
    }

    if (!student.monthlyReports) {
      student.monthlyReports = [];
    }

    // ✨ FIX 1: Safely sanitize incoming data AND include maxPossible!
    const sanitizeSub = (sub) => ({
      enrolled: sub?.enrolled || false,
      plan: sub?.plan || '',
      score: sub?.score === '' ? 0 : Number(sub?.score) || 0,
      maxPossible: sub?.maxPossible === '' ? 0 : Number(sub?.maxPossible) || 0,
      completed: sub?.completed || false,
      comment: sub?.comment || ''
    });

    const safeQuran = sanitizeSub(quran);
    const safeArabic = sanitizeSub(arabic);
    const safeIslamic = sanitizeSub(islamicStudies);

    // ✨ FIX 2: Default totalScore to 0 instead of null to prevent schema crashes
    let totalScore = 0; 
    if (isFinalized) {
      totalScore = safeQuran.score + safeArabic.score + safeIslamic.score;
    }

    const existingReportIndex = student.monthlyReports.findIndex(r => r.monthYear === monthYear);
    
    const reportData = { 
        monthYear, 
        isFinalized, 
        teacherNote: teacherNote || '', 
        quran: safeQuran, 
        arabic: safeArabic, 
        islamicStudies: safeIslamic, 
        totalScore, 
        approvalStatus: 'pending' 
    };

    // ✨ FIX 3: Safely replace the whole object and force Mongoose to mark it as modified
    if (existingReportIndex >= 0) {
      student.monthlyReports[existingReportIndex] = {
        ...student.monthlyReports[existingReportIndex].toObject(),
        ...reportData
      };
      student.markModified('monthlyReports');
    } else {
      student.monthlyReports.push(reportData);
    }

    // ✨ FIX 4: Strict Try/Catch specifically for the Database Save
    try {
      await student.save();
    } catch (dbError) {
      console.error("Mongoose Validation Error:", dbError);
      return res.status(400).json({ message: `Database Rejected Save: ${dbError.message}` });
    }

    // 🤖 TRIGGER WHATSAPP ALERT TO ADMIN
    try {
      const adminGroupTarget = process.env.ADMIN_WHATSAPP_NUMBER || 'https://chat.whatsapp.com/BYFE1IPRs2KGJNhGaxvpJd'; 
      
      if (adminGroupTarget && whatsappClient && whatsappClient.sendMessage) {
        const phaseName = isFinalized ? "Phase 2 (Final Grades)" : "Phase 1 (Draft Plan)";
        const msg = `📝 *Pending Approval Alert*\n\n*Student:* ${student.name}\n*Month:* ${monthYear}\n*Submission:* ${phaseName}\n\nPlease log in to the Admin Dashboard to review and approve.`;
        
        whatsappClient.sendMessage(adminGroupTarget, msg).catch(err => console.log("Bot offline, skipping message."));
      }
    } catch (err) {
      console.error("Failed to send WhatsApp alert for report:", err);
    }

    return res.status(200).json({ message: 'Report saved successfully', reports: student.monthlyReports });

  } catch (serverError) {
    console.error("Server Error:", serverError);
    return res.status(500).json({ message: `Server Crash: ${serverError.message}` });
  }
};

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

  const adminMessage = `⚖️ *NEW GRADE APPEAL* \n\n*Student:* ${user.name}\n*Phone:* ${user.whatsappNumber || 'N/A'}\n*Report:* ${monthYear}\n*Reason:* "${reason}" \n\nPlease review this with the teacher and contact the parent.`;

  try {
    const adminGroupTarget = process.env.ADMIN_WHATSAPP_NUMBER || 'https://chat.whatsapp.com/BYFE1IPRs2KGJNhGaxvpJd';
    
    if (adminGroupTarget && whatsappClient && whatsappClient.sendMessage) {
      whatsappClient.sendMessage(adminGroupTarget, adminMessage).catch(err => console.log("Bot offline, skipping appeal message."));
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

  const searchName = studentIdentifier.split('-')[0].trim();
  const safeSearchName = searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const student = await User.findOne({
    $or: [ 
      { name: { $regex: new RegExp(safeSearchName, 'i') } }, 
      { studentGroupId: studentIdentifier.trim() },
      { whatsappGroupId: studentIdentifier.trim() }
    ],
    role: 'student'
  });

  if (!student) {
    res.status(404);
    throw new Error(`Could not find a student named "${searchName}".`);
  }

  if (!student.monthlyReports) {
    return res.status(200).json(null); 
  }

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