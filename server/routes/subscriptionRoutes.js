const express = require('express');
const router = express.Router();
const { 
    createSubscription, 
    getStudentSubscriptionSummary,
    linkPayPalBilling,
    paypalWebhookHandler
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

// @route   POST /api/subscriptions/link
// @desc    Link a PayPal Subscription or Recurring Invoice to a user
// @access  Private
router.post('/link', protect, linkPayPalBilling);

// @route   POST /api/subscriptions/webhook
// @desc    Handle incoming PayPal Webhooks (Auto-renewals and Invoice payments)
// @access  Public (Called by PayPal Servers)
router.post('/webhook', paypalWebhookHandler);

module.exports = router;