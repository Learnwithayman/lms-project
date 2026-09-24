const express = require('express');
const router = express.Router();
const { 
  getSubscriptionSummary, 
  requestMakeup, 
  addOrUpdateReport, 
  appealReport,
  getExistingReport // 👈 IMPORTED HERE
} = require('../controllers/studentController');
const { protect } = require('../middleware/authMiddleware');

// Get student's subscription, makeup bank, and progress reports
router.get('/subscription-summary', protect, getSubscriptionSummary);

// Submit a makeup class request
router.post('/request-makeup', protect, requestMakeup);

// ✨ DYNAMIC GRADING: Get an existing report (For Teacher Phase 2 Loading)
router.get('/reports/:studentIdentifier/:monthYear', protect, getExistingReport);

// ✨ DYNAMIC GRADING: Add or update a monthly report (Phase 1 or 2)
router.post('/reports', protect, addOrUpdateReport);

// Grade Appeal Route
router.post('/appeal-report', protect, appealReport);

module.exports = router;