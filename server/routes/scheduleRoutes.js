const express = require('express');
const router = express.Router();
const { 
    scheduleClass, 
    getMyClasses, 
    deleteClass, 
    getAllClasses, 
    updateClass, 
    endClass, 
    markAttendance, 
    getCompletedClasses, 
    getTeacherEarnings, 
    getAdminPayrollReport, 
    addTeacherAdjustment,
    getTeacherSchedule // Our calendar engine
} = require('../controllers/scheduleController');

// Import your authentication middleware (adjust path or name if it's different in your project)
const { protect } = require('../middleware/authMiddleware');

// 🚨 THE FIXED ROUTE 🚨
// Must be just '/google-calendar' and protected so we can read req.user.whatsappGroupId!
router.get('/google-calendar', protect, getTeacherSchedule);

// Your other existing routes
router.post('/', protect, scheduleClass);
router.get('/my-classes', protect, getMyClasses);
router.get('/all', protect, getAllClasses);
router.get('/earnings', protect, getTeacherEarnings);
router.get('/admin-payroll', protect, getAdminPayrollReport);
router.post('/adjustment', protect, addTeacherAdjustment);
router.get('/completed', protect, getCompletedClasses);
router.put('/end', protect, endClass);
router.post('/attendance', protect, markAttendance);
router.put('/:id', protect, updateClass);
router.delete('/:id', protect, deleteClass);

module.exports = router;