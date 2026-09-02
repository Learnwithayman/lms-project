const express = require('express');
const router = express.Router();
const { getSubscriptionSummary, requestMakeup } = require('../controllers/studentController');
const { protect } = require('../middleware/authMiddleware');

// Mount the protected Day 4 endpoints
router.get('/subscription-summary', protect, getSubscriptionSummary);
router.post('/request-makeup', protect, requestMakeup);

module.exports = router;