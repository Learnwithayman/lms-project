const { mergeSubjects, viewFor } = require('../utils/reportParts'); // 🧩 Step 28: one part per teacher

// 👪 27 Nov: students whose FULL name appears in a class title (e.g. "Celia Dahir  Saber Dahir" → Celia + Saber)
const studentsNamedIn = async (text) => {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const hay = norm(text);
  const all = await User.find({ role: 'student' }, 'name');
  return all.filter((s) => { const n = norm(s.name); return n.length > 3 && hay.includes(n); });
};
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const MakeupRequest = require('../models/MakeupRequest');
const whatsappClient = require('../utils/whatsappBot');
const { buildCycle, shownSubscription } = require('../utils/cycleCalc'); // 🔄 Step 17: calculated classes done / remaining

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

  // 🔄 Step 17: cycle from the PayPal date + weekly calendar pattern (falls back to the saved values)
  let cycle = null;
  try {
    cycle = await buildCycle(user);
  } catch (error) {
    console.error('Cycle calculation failed:', error.message);
  }

  res.status(200).json({
    subscription: cycle ? shownSubscription(user, cycle) : (user.subscription || { status: 'none', totalClassesBought: 0, classesUsed: 0 }),
    cycle: cycle ? { mode: cycle.mode, remaining: cycle.remaining, cycleEnd: cycle.cycleEnd, paymentDue: !!cycle.paymentDue, payLink: cycle.payLink || null, billingType: (user.paypal && user.paypal.billingType) || 'none' } : null,
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

    const searchName = studentIdentifier.replace(/^\s*🎒?\s*makeup\s*:\s*/i, '').split('-')[0].trim(); // 27 Nov: a makeup class title is '🎒 Makeup: Name'
    const safeSearchName = searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let student = await User.findOne({
      $or: [
        { name: { $regex: new RegExp(safeSearchName, 'i') } },
        { studentGroupId: studentIdentifier.trim() },
        { whatsappGroupId: studentIdentifier.trim() },
        { legacyGroupIds: studentIdentifier.trim() } // 🔗 old group ID kept after the link fix
      ],
      role: 'student'
    });

    if (!student) {
      // 👪 27 Nov: one class for two children (e.g. "Celia Dahir  Saber Dahir"): each child has their own report
      const named = await studentsNamedIn(searchName);
      if (named.length > 1) return res.status(409).json({ message: 'This class has more than one student. Please choose which child this report is for.', choices: named.map((s) => s.name.trim()) });
      if (named.length === 1) student = await User.findById(named[0]._id);
    }

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

    const safeQuran = { ...sanitizeSub(quran), score: quran?.score }; // 🧩 Step 28: an empty score stays empty (not 0) inside the part
    const safeArabic = { ...sanitizeSub(arabic), score: arabic?.score };
    const safeIslamic = { ...sanitizeSub(islamicStudies), score: islamicStudies?.score };

    const existingReportIndex = student.monthlyReports.findIndex(r => r.monthYear === monthYear);

    // 🧩 Step 28 (26 Nov): each teacher saves only THEIR part of each subject; other teachers' parts are kept.
    // (Replaces the old "smart merge": a subject this teacher did not tick is left exactly as it was.)
    const merged = mergeSubjects({
      existing: existingReportIndex >= 0 ? student.monthlyReports[existingReportIndex].toObject() : null,
      incoming: { quran: safeQuran, arabic: safeArabic, islamicStudies: safeIslamic },
      partNames: req.body.partNames || {},
      teacher: req.user,
      isFinalized
    });
    let finalQuran = merged.quran;
    let finalArabic = merged.arabic;
    let finalIslamic = merged.islamicStudies;
    let finalTeacherNote = teacherNote || '';

    if (existingReportIndex >= 0) {
      const existing = student.monthlyReports[existingReportIndex];

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

    // 📋 Step 5: remember which teacher saved which part (first save time is kept for the on-time check)
    const now = new Date();
    const previousSavedBy = existingReportIndex >= 0 ? (student.monthlyReports[existingReportIndex].savedBy || []).map((e) => (e.toObject ? e.toObject() : e)) : [];
    const savedBy = previousSavedBy.filter((e) => e.teacher);
    let mine = savedBy.find((e) => String(e.teacher) === String(req.user._id));
    if (!mine) {
      mine = { teacher: req.user._id, teacherName: req.user.name };
      savedBy.push(mine);
    }
    mine.teacherName = req.user.name;
    if (!mine.planSavedAt) mine.planSavedAt = now;
    if (isFinalized && !mine.reportSavedAt) mine.reportSavedAt = now;
    reportData.savedBy = savedBy;
    reportData.lastSavedByName = req.user.name;
    reportData.lastSavedAt = now;

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

  const searchName = studentIdentifier.replace(/^\s*🎒?\s*makeup\s*:\s*/i, '').split('-')[0].trim(); // 27 Nov: a makeup class title is '🎒 Makeup: Name'
  const safeSearchName = searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let student = await User.findOne({
    $or: [
      { name: { $regex: new RegExp(safeSearchName, 'i') } },
      { studentGroupId: studentIdentifier.trim() },
      { whatsappGroupId: studentIdentifier.trim() },
      { legacyGroupIds: studentIdentifier.trim() } // 🔗 old group ID kept after the link fix
    ],
    role: 'student'
  });

  if (!student) {
    // 👪 27 Nov: one class for two children: the form asks which child
    const named = await studentsNamedIn(searchName);
    if (named.length > 1) return res.status(409).json({ message: 'This class has more than one student. Please choose which child this report is for.', choices: named.map((s) => s.name.trim()) });
    if (named.length === 1) student = await User.findById(named[0]._id);
  }

  if (!student) {
    res.status(404);
    throw new Error(`Could not find a student named "${searchName}".`);
  }

  // 🧩 Step 28b (26 Nov): subjects the student studies with OTHER teachers, so a teacher who teaches only Quran does
  // not have to tick every subject to get the right maximum score: the other teachers' parts this month, plus the
  // subjects of the student's most recent other report.
  const reports = student.monthlyReports || [];
  const report = reports.find(r => r.monthYear === monthYear);
  const previous = [...reports].reverse().find(r => r.monthYear !== monthYear) || null;
  const previousSubjects = previous ? ['quran', 'arabic', 'islamicStudies'].filter((k) => previous[k] && previous[k].enrolled) : [];

  if (!report) {
    return res.status(200).json({ empty: true, previousSubjects }); // no report yet for this month
  }

  // 🧩 Step 28: the teacher's own part of each subject + the other teachers' parts (read-only in the form)
  const plainReport = report.toObject ? report.toObject() : report;
  res.status(200).json({ ...plainReport, view: viewFor(plainReport, req.user), previousSubjects });
});

// @desc    Get report statuses for all students (Teacher View)
// @route   GET /api/student/reports-status
// @access  Private (Teacher)
const getStudentReportStatuses = asyncHandler(async (req, res) => {
  const students = await User.find({ role: 'student' });
  const statuses = {};

  students.forEach(student => {
    let status = '⚪ No Plan Yet';

    // ✨ FIX: Simply grab the absolute latest report array item to avoid Render server timezone/date-string formatting bugs
    if (student.monthlyReports && student.monthlyReports.length > 0) {
      const latestReport = student.monthlyReports[student.monthlyReports.length - 1];

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

    // ✨ FIX: Add .trim() to ensure clean keys
    if (student.name) {
      statuses[student.name.toLowerCase().trim()] = status; 
    }
    if (student.studentGroupId) {
      statuses[student.studentGroupId.toLowerCase().trim()] = status;
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