const express = require('express');
const router = express.Router();
const { captureTrialLead } = require('../controllers/leadController');

// This route is public so WordPress can send data to it without needing a login token
router.post('/trial', captureTrialLead);

module.exports = router;