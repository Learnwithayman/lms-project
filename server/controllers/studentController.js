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

    const existingReportIndex = student.monthlyReports.findIndex(r => r.monthYear === monthYear);
    
    // ✨ SMART MERGE LOGIC (Database Protection)
    let finalQuran = safeQuran;
    let finalArabic = safeArabic;
    let finalIslamic = safeIslamic;
    let finalTeacherNote = teacherNote || '';

    if (existingReportIndex >= 0) {
      const existing = student.monthlyReports[existingReportIndex];
      
      // If incoming payload says NOT enrolled, but database has data, preserve the database!
      if (!safeQuran.enrolled && existing.quran && existing.quran.enrolled) {
        finalQuran = existing.quran;
      }
      if (!safeArabic.enrolled && existing.arabic && existing.arabic.enrolled) {
        finalArabic = existing.arabic;
      }
      if (!safeIslamic.enrolled && existing.islamicStudies && existing.islamicStudies.enrolled) {
        finalIslamic = existing.islamicStudies;
      }

      // Merge teacher notes instead of overriding
      if (existing.teacherNote && !finalTeacherNote.includes(existing.teacherNote)) {
        finalTeacherNote = finalTeacherNote ? `${existing.teacherNote}\n\n---\n\n${finalTeacherNote}` : existing.teacherNote;
      }
    }

    let totalScore = 0; 
    if (isFinalized) {
      totalScore = (finalQuran.score || 0) + (finalArabic.score || 0) + (finalIslamic.score || 0);
    }

    const reportData = { 
        monthYear, 
        isFinalized, 
        teacherNote: finalTeacherNote, 
        quran: finalQuran, 
        arabic: finalArabic, 
        islamicStudies: finalIslamic, 
        totalScore, 
        approvalStatus: 'pending' 
    };

    if (existingReportIndex >= 0) {
      student.monthlyReports[existingReportIndex] = {
        ...student.monthlyReports[existingReportIndex].toObject(),
        ...reportData
      };
      student.markModified('monthlyReports');
    } else {
      student.monthlyReports.push(reportData);
    }

    try {
      await student.save();
    } catch (dbError) {
      console.error("Mongoose Validation Error:", dbError);
      return res.status(400).json({ message: `Database Rejected Save: ${dbError.message}` });
    }

    try {
      const adminGroupTarget = process.env.ADMIN_WHATSAPP_NUMBER || 'https://chat.whatsapp.com/BYFE1IPRs2KGJNhGaxvpJd'; 
      
      if (adminGroupTarget && whatsappClient && whatsappClient.sendMessage) {
        const phaseName = isFinalized ? "Phase 2 (Final Grades)" : "Phase 1 (Draft Plan)";
        const msg = `📝 *Pending Approval Alert*\n\n*Student:* ${student.name}\n*Month:* ${monthYear}\n*Submission:* ${phaseName}\n\nPlease log in to the Admin Dashboard to review and approve. \n\n `;
        
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
  const targetMonth = req.query.monthYear || new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const statuses = {};

  students.forEach(student => {
    let status = '⚪ No Plan Yet';

    const currentReport = student.monthlyReports?.find(r => r.monthYear === targetMonth);
    const latestReport = currentReport || (student.monthlyReports && student.monthlyReports.length > 0 ? student.monthlyReports[student.monthlyReports.length - 1] : null);

    if (latestReport) {
      if (latestReport.isFinalized && latestReport.approvalStatus === 'approved') {
        status = '🏆 Phase 2 Finalized';
      } else if (latestReport.isFinalized && latestReport.approvalStatus !== 'approved') {
        status = '🟡 Phase 2 Pending';
      } else if (!latestReport.isFinalized && latestReport.approvalStatus === 'approved') {
        status = '🟢 Phase 1 Active';
      } else {
        status = '🔵 Phase 1 Drafted';
      }
    }

    if (student.name) {
      statuses[student.name] = status; 
      statuses[student.name.toLowerCase()] = status;
    }
    if (student.studentGroupId) {
      statuses[student.studentGroupId] = status;
      statuses[student.studentGroupId.toLowerCase()] = status;
    }
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