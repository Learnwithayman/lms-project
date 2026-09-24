const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const MakeupRequest = require('../models/MakeupRequest');

const getSubscriptionSummary = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const now = new Date();
  
  // Filter for valid, unused makeup credits
  const activeMakeups = user.makeupBank ? user.makeupBank.filter(
    (makeup) => !makeup.isUsed && new Date(makeup.expirationDate) > now
  ) : [];

  res.status(200).json({
    subscription: user.subscription || { status: 'none', totalClassesBought: 0, classesUsed: 0 },
    makeupCount: activeMakeups.length,
    activeMakeups: activeMakeups,
    // ✨ NEW: Send the Study Plans and Reports to the frontend charts
    monthlyReports: user.monthlyReports || [] 
  });
});

const requestMakeup = asyncHandler(async (req, res) => {
  const { originalDate, preferredDate, reason } = req.body;

  if (!originalDate || !preferredDate) {
    res.status(400);
    throw new Error('Please provide both the original missed date and your preferred makeup date.');
  }

  const request = await MakeupRequest.create({
    student: req.user._id,
    originalDate,
    preferredDate,
    reason
  });

  res.status(201).json(request);
});

module.exports = {
  getSubscriptionSummary,
  requestMakeup
};