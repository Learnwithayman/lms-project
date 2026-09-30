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

module.exports = router;