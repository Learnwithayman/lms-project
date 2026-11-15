const express = require('express');
const router = express.Router();
const { 
    createSubscription, 
    getStudentSubscriptionSummary
} = require('../controllers/subscriptionController');
const { protect } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware'); // 🔐 Role locks

// @route   POST /api/subscriptions
// @desc    Create a new subscription
// @access  Private (Admin only)
router.post('/', protect, allowRoles('admin'), createSubscription);

// @route   GET /api/subscriptions/my-summary
// @desc    Get logged-in student's subscription and makeup summary
// @access  Private (Student)
router.get('/my-summary', protect, getStudentSubscriptionSummary);

// 💳 PayPal webhook moved to /api/paypal (see paypalRoutes.js)

module.exports = router;
