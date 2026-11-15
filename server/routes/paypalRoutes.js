const express = require('express');
const router = express.Router();
const { paypalWebhook, manualRenew } = require('../controllers/paypalController');
const { protect } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware'); // 🔐 Role locks

// @route   POST /api/paypal/webhook
// @desc    PayPal notices (invoice sent / paid, subscription payments)
// @access  Public (called by PayPal's servers)
router.post('/webhook', paypalWebhook);

// @route   POST /api/paypal/manual-renew/:id
// @desc    Mark a manual-payment student as paid and start a new 28-day cycle
// @access  Admin only
router.post('/manual-renew/:id', protect, allowRoles('admin'), manualRenew);

module.exports = router;
