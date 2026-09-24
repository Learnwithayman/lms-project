const express = require('express');
const router = express.Router();
const { getSubscriptionSummary, requestMakeup, addOrUpdateReport } = require('../controllers/studentController');
const { protect } = require('../middleware/authMiddleware');

// Mount the protected Day 4 endpoints
router.get('/subscription-summary', protect, getSubscriptionSummary);
router.post('/request-makeup', protect, requestMakeup);

// ✨ NEW: Teacher submits a Phase 1 Plan or Phase 2 Graded Report
router.post('/reports', protect, addOrUpdateReport);

module.exports = router;