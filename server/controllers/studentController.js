const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const whatsappClient = require('../utils/whatsappBot');

// @desc    Get student subscription & makeup summary
// @route   GET /api/student/subscription-summary
// @access  Private (Student)
const getSubscriptionSummary = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Filter for valid, unused makeup credits that haven't expired
  const activeMakeups = user.makeupBank 
    ? user.makeupBank.filter(m => !m.isUsed && new Date(m.expirationDate) > new Date()) 
    : [];

  // Returns clean JSON for the frontend Parent Portal
  res.status(200).json({
    subscription: user.subscription,
    makeupCount: activeMakeups.length,
    activeMakeups: activeMakeups
  });
});

// @desc    Request a makeup class
// @route   POST /api/student/request-makeup
// @access  Private (Student)
const requestMakeup = asyncHandler(async (req, res) => {
  const { originalDate, preferredDate, reason } = req.body;
  const user = await User.findById(req.user.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Build the alert message for the Admin
  const adminMessage = `🔔 *New Makeup Request*\n\n*Student:* ${user.name}\n*Original Missed Date:* ${new Date(originalDate).toLocaleDateString()}\n*Preferred Makeup Date:* ${new Date(preferredDate).toLocaleDateString()}\n*Reason:* ${reason || 'Not provided'}\n\nPlease check the admin dashboard to process this request.`;
  
  try {
    // Sends the alert to your main Admin WhatsApp group/number
    // Replace 'AdminTarget' with your actual Admin WhatsApp ID or Phone Number
    await whatsappClient.sendMessage('AdminTarget', adminMessage); 
  } catch (error) {
    console.error('⚠️ Failed to send admin WhatsApp alert:', error.message);
  }

  res.status(200).json({ message: 'Makeup request submitted successfully! Admin will contact you shortly.' });
});

module.exports = {
  getSubscriptionSummary,
  requestMakeup
};