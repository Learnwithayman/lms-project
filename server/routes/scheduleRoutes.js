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
    getTeacherSchedule, // Our calendar engine
    getAdminLiveMonitor, 
    resendReminder,      
    resendNotes,         
    joinClass,          // 👈 Restored from our earlier update today
    grantMakeupCredit,  // 👈 NEW: The Makeup Bank Engine
    cancelUpcomingClass, // 👈 NEW: Admin Cancel
    getMessageLogs,      // 👈 NEW: The missing link!
    adminForceEndClass   // 👈 ✨ NEW: The Force End Superpower!
} = require('../controllers/scheduleController');

// Import your authentication middleware
const { protect } = require('../middleware/authMiddleware');

// 🚨 THE FIXED ROUTE 🚨
// Must be just '/google-calendar' and protected so we can read req.user.whatsappGroupId!
router.get('/google-calendar', protect, getTeacherSchedule);

// Your other existing routes
router.post('/', protect, scheduleClass);
router.get('/my-classes', protect, getMyClasses);
router.get('/all', protect, getAllClasses);
router.get('/earnings', protect, getTeacherEarnings);

// 🚪 THE FIXED DOORS: Renamed to match the frontend exactly!
router.get('/payroll-report', protect, getAdminPayrollReport);
router.post('/payroll-adjustment', protect, addTeacherAdjustment);

router.get('/completed', protect, getCompletedClasses);
router.put('/end', protect, endClass);
router.post('/attendance', protect, markAttendance);
router.put('/:id', protect, updateClass);
router.delete('/:id', protect, deleteClass);

// ==========================================
// 📡 ADMIN COMMAND CENTER & SUBSCRIPTIONS
// ==========================================
router.get('/admin-live-monitor', protect, getAdminLiveMonitor);
router.post('/resend-reminder', protect, resendReminder);
router.post('/resend-notes', protect, resendNotes);
router.post('/join', protect, joinClass);          // 👈 Join route
router.post('/makeup', protect, grantMakeupCredit); // 👈 NEW: 90-Day Makeup Route
router.post('/admin-cancel', protect, cancelUpcomingClass); // 👈 NEW: Admin Cancel Route
router.get('/message-logs', protect, getMessageLogs); 

router.put('/admin-force-end', protect, adminForceEndClass); // 👈 🚨 THE MISSING ROUTE IS HERE 🚨

// 💰 FORCE RUN MONTHLY PAYROLL (Manual Trigger from Admin Dashboard Button)
router.post('/force-payroll', protect, async (req, res) => {
    try {
        console.log('🔥 Admin clicked Force Run Payroll!');
        
        // This imports the payroll action script directly from your utility folder
        const { calculateAndSendPayroll } = require('../utils/payrollCron'); 
        
        if (calculateAndSendPayroll) {
            await calculateAndSendPayroll();
            res.status(200).json({ message: 'Payroll sequence initiated successfully!' });
        } else {
            console.log('⚠️ Payroll calculation handler function not found inside payrollCron.js');
            res.status(200).json({ message: 'Route connected, but execution function missing.' });
        }

    } catch (error) {
        console.error('❌ Error triggering manual payroll:', error);
        res.status(500).json({ message: 'Server error while forcing payroll process.' });
    }
});

module.exports = router;