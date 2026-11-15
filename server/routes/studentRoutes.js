const express = require('express');
const router = express.Router();
const { 
  getSubscriptionSummary, 
  requestMakeup, 
  addOrUpdateReport, 
  appealReport,
  getExistingReport,
  getStudentReportStatuses // 👈 IMPORTED HERE
} = require('../controllers/studentController');
const { protect } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware'); // 🔐 Role locks

const studentOnly = allowRoles('student');
const teacherOnly = allowRoles('teacher');

// Get student's subscription, makeup bank, and progress reports (Student only)
router.get('/subscription-summary', protect, studentOnly, getSubscriptionSummary);

// Submit a makeup class request (Student only)
router.post('/request-makeup', protect, studentOnly, requestMakeup);

// ✨ NEW: Get all student report statuses for the current month (Must be above /reports/:id) (Teacher only)
router.get('/reports-status', protect, teacherOnly, getStudentReportStatuses);

// ✨ DYNAMIC GRADING: Get an existing report (For Teacher Phase 2 Loading) (Teacher only)
router.get('/reports/:studentIdentifier/:monthYear', protect, teacherOnly, getExistingReport);

// ✨ DYNAMIC GRADING: Add or update a monthly report (Phase 1 or 2) (Teacher only)
router.post('/reports', protect, teacherOnly, addOrUpdateReport);

// Grade Appeal Route (Student only)
router.post('/appeal-report', protect, studentOnly, appealReport);

module.exports = router;
