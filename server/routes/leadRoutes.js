const express = require('express');
const router = express.Router();
const { captureTrialLead } = require('../controllers/leadController');
const { publicGuard } = require('../utils/publicGuard'); // 🛡️ W2 Phase A: spam protection

// This route is public so WordPress can send data to it without needing a login token
router.post('/trial', publicGuard, captureTrialLead);

module.exports = router;