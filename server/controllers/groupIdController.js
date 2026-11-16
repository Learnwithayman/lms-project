const asyncHandler = require('express-async-handler');
const G = require('../utils/groupIds');

// ==========================================
// 🔄 STEP 8: SWITCH TO NEW IDS (Admin)
// ==========================================

// @route GET /api/admin/group-ids/preview — nothing is changed
const previewGroupIds = asyncHandler(async (req, res) => {
  const p = await G.buildPreview();
  res.status(200).json({ switchedAt: p.switchedAt, counts: p.counts, classes: p.classes, lmsUpdates: p.lmsUpdates, people: p.people });
});

// @route POST /api/admin/group-ids/apply { choices, people } — backup, then Google Calendar + LMS
const applyGroupIds = asyncHandler(async (req, res) => {
  const result = await G.apply(req.body || {}, req.user._id);
  await G.check(true);
  res.status(200).json(result);
});

// @route GET /api/admin/group-ids/check — "⚠️ X classes still use old IDs" warning
const checkGroupIds = asyncHandler(async (req, res) => {
  res.status(200).json(await G.check(req.query.force === '1'));
});

module.exports = { previewGroupIds, applyGroupIds, checkGroupIds };
