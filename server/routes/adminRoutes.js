const express = require('express');
const router = express.Router();
const {
  updateTeacherRate,
  createSubscription,
  getPendingReports,
  approveReport,
  rejectReport,
  addLegacyReport,
  getHonorList,
  getMonthlyReportTracking // ✨ NEW: Tracker Import
} = require('../controllers/adminController');
const { getReminderPreview } = require('../controllers/reportDutyController'); // 📋 Step 5: preview reminders
const { previewGroupIds, applyGroupIds, checkGroupIds } = require('../controllers/groupIdController'); // 🔄 Step 8: switch to new IDs
const { getRecipients, setTeacherActive, sendTeachers, sendStudents } = require('../controllers/broadcastController'); // 📣 Step 9: send updates
const { protect, admin } = require('../middleware/authMiddleware');

// All routes here are protected (Must be Logged In + Must be Admin)
router.put('/teacher-rate/:id', protect, admin, updateTeacherRate);
router.post('/subscription', protect, admin, createSubscription);

// ==========================================
// ✨ APPROVAL GATE ROUTES
// ==========================================
router.get('/pending-reports', protect, admin, getPendingReports);
router.put('/approve-report', protect, admin, approveReport);
router.put('/reject-report', protect, admin, rejectReport);

// ==========================================
// ✨ LEGACY PDF VAULT ROUTE
// ==========================================
router.post('/legacy-report', protect, admin, addLegacyReport);

// ==========================================
// ✨ HONOR LIST ROUTE
// ==========================================
router.get('/honor-list/:monthYear', protect, admin, getHonorList);

// ==========================================
// ✨ SCHOOL-WIDE REPORT TRACKER ROUTE
// ==========================================
router.get('/report-tracking/:monthYear', protect, admin, getMonthlyReportTracking); // ✨ NEW: Tracker Route

// 📋 Step 5: preview today's plan / report reminders (sends nothing)
router.get('/reminder-preview', protect, admin, getReminderPreview);

// 🔄 Step 8: switch to new group IDs (preview → apply) + old-ID checker
router.get('/group-ids/preview', protect, admin, previewGroupIds);
router.post('/group-ids/apply', protect, admin, applyGroupIds);
router.get('/group-ids/check', protect, admin, checkGroupIds);

// 📣 Step 9: send updates (teachers marked Active, or chosen students)
router.get('/broadcast/recipients', protect, admin, getRecipients);
router.put('/broadcast/teacher/:id', protect, admin, setTeacherActive);
router.post('/broadcast/teachers', protect, admin, sendTeachers);
router.post('/broadcast/students', protect, admin, sendStudents);

module.exports = router;