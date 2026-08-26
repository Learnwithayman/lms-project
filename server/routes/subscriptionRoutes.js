const express = require('express');
const router = express.Router();
const { 
    createSubscription, 
    getStudentSubscriptionSummary 
} = require('../controllers/subscriptionController');
const { protect } = require('../middleware/authMiddleware');

// @route   POST /api/subscriptions
// @desc    Create a new subscription
// @access  Private (Admin)
router.post('/', protect, createSubscription);

// @route   GET /api/subscriptions/my-summary
// @desc    Get logged-in student's subscription and makeup summary
// @access  Private (Student)
router.get('/my-summary', protect, getStudentSubscriptionSummary);

module.exports = router;