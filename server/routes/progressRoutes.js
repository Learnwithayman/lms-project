const express = require('express');
const router = express.Router();
const { 
    createPlan, 
    submitReportGrades, 
    getMyReports 
} = require('../controllers/progressController');
const { protect } = require('../middleware/authMiddleware');


// Teacher routes for creating and grading
router.post('/plan', protect, createPlan);
router.put('/report/:id', protect, submitReportGrades);

// Student route for viewing the Thndr Dashboard data
router.get('/my-reports', protect, getMyReports);

module.exports = router;