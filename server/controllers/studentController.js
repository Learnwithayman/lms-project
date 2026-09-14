const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const MakeupRequest = require('../models/MakeupRequest'); // ✨ NEW: Import the model
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

  const activeMakeups = user.makeupBank 
    ? user.makeupBank.filter(m => !m.isUsed && new Date(m.expirationDate) > new Date()) 
    : [];

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

  // ✨ NEW: Save the request to the database so it shows up in the Admin Inbox
  await MakeupRequest.create({
    student: user._id,
    originalDate,
    preferredDate,
    reason
  });

  const adminMessage = `🔔 *New Makeup Request*\n\n*Student:* ${user.name}\n*Original Missed Date:* ${new Date(originalDate).toLocaleDateString()}\n*Preferred Makeup Date:* ${new Date(preferredDate).toLocaleDateString()}\n*Reason:* ${reason || 'Not provided'}\n\nPlease check the admin dashboard to process this request.`;
  
  try {
    await whatsappClient.sendMessage('BYFE1IPRs2KGJNhGaxvpJd', adminMessage); 
  } catch (error) {
    console.error('⚠️ Failed to send admin WhatsApp alert:', error.message);
  }

  res.status(200).json({ message: 'Makeup request submitted successfully! Admin will contact you shortly.' });
});

module.exports = {
  getSubscriptionSummary,
  requestMakeup
};