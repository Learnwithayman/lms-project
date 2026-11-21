const asyncHandler = require('express-async-handler');
const S = require('../utils/paypalSync');

// ==========================================
// 💳 STEP 17: PAYPAL CYCLES (Admin): preview → apply, daily switch
// ==========================================

// @route GET /api/admin/paypal-sync/status
const getSyncStatus = asyncHandler(async (req, res) => {
  res.status(200).json(await S.getStatus());
});

// @route GET /api/admin/paypal-sync/preview (reads PayPal only, saves nothing)
const previewSync = asyncHandler(async (req, res) => {
  res.status(200).json(await S.buildPreview());
});

// @route POST /api/admin/paypal-sync/apply (saves the PayPal cycles on the students, with backup)
const applySync = asyncHandler(async (req, res) => {
  const r = await S.apply({ source: 'button', by: req.user._id });
  res.status(200).json({ message: `Updated ${r.updated} students from PayPal. ${r.unpaid} not paid yet. ${r.problems.length} to check.`, ...r });
});

// @route PUT /api/admin/paypal-sync/daily { on }
const setDailySync = asyncHandler(async (req, res) => {
  res.status(200).json(await S.setDaily(!!(req.body && req.body.on)));
});

module.exports = { getSyncStatus, previewSync, applySync, setDailySync };
