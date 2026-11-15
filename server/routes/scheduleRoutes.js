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
    getTeacherSchedule, 
    getAdminLiveMonitor, 
    resendReminder,      
    resendNotes,         
    joinClass,          
    grantMakeupCredit,  
    cancelUpcomingClass, 
    getMessageLogs,      
    adminForceEndClass,
    getPendingMakeups,
    resolveMakeupRequest,
    syncStudentTimezoneToGoogleCalendar
} = require('../controllers/scheduleController');

// Import your authentication middleware
const { protect } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware'); // 🔐 Role locks

// 🔐 Shortcuts for who is allowed through each door
const adminOnly = allowRoles('admin');
const teacherOnly = allowRoles('teacher');
const teacherOrStudent = allowRoles('teacher', 'student');

// 🚨 THE FIXED ROUTE 🚨 (Teachers & Students: their own schedule)
router.get('/google-calendar', protect, teacherOrStudent, getTeacherSchedule);

// Your other existing routes
router.post('/', protect, adminOnly, scheduleClass);
router.get('/my-classes', protect, getMyClasses);
router.get('/all', protect, adminOnly, getAllClasses);
router.get('/earnings', protect, teacherOnly, getTeacherEarnings);

// 🚪 THE FIXED DOORS (Admin only)
router.get('/payroll-report', protect, adminOnly, getAdminPayrollReport);
router.post('/payroll-adjustment', protect, adminOnly, addTeacherAdjustment);

router.get('/completed', protect, teacherOrStudent, getCompletedClasses);
router.put('/end', protect, teacherOnly, endClass);
router.post('/attendance', protect, teacherOnly, markAttendance);

// ==========================================
// 📡 ADMIN COMMAND CENTER & SUBSCRIPTIONS
// ==========================================
router.get('/admin-live-monitor', protect, adminOnly, getAdminLiveMonitor);
router.post('/resend-reminder', protect, adminOnly, resendReminder);
router.post('/resend-notes', protect, adminOnly, resendNotes);
router.post('/join', protect, teacherOnly, joinClass);          
router.post('/makeup', protect, adminOnly, grantMakeupCredit); 
router.post('/admin-cancel', protect, adminOnly, cancelUpcomingClass); 
router.get('/message-logs', protect, adminOnly, getMessageLogs); 

// ✨ NEW: Route for Timezone Sync
router.post('/sync-timezone', protect, adminOnly, syncStudentTimezoneToGoogleCalendar);

// ✨ THE FIX: Specific PUT route MUST go before the wildcard!
router.put('/admin-force-end', protect, adminOnly, adminForceEndClass); 

// ✨ NEW: Admin Makeup Inbox Routes
router.get('/admin/makeups', protect, adminOnly, getPendingMakeups);
router.put('/admin/makeups/:id/resolve', protect, adminOnly, resolveMakeupRequest);

// ⚠️ WILDCARD ROUTES (Must ALWAYS be at the bottom)
router.put('/:id', protect, adminOnly, updateClass);
router.delete('/:id', protect, adminOnly, deleteClass);

// 💰 FORCE RUN MONTHLY PAYROLL (Manual Trigger from Admin Dashboard Button)
router.post('/force-payroll', protect, adminOnly, async (req, res) => {
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
