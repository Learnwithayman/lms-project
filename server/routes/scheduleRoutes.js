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
    getMessageLogs,      
    adminForceEndClass,
    getPendingMakeups,
    resolveMakeupRequest,
    syncStudentTimezoneToGoogleCalendar
} = require('../controllers/scheduleController');
const { sendLateReminder, markStudentJoined, getLateProgress } = require('../controllers/lateController'); // ⏰ Late flow (Step 2)
const { getAwayStudents } = require('../controllers/pauseController'); // ⏸️ Student pause (Step 3)
const R = require('../controllers/rescheduleController'); // 🔁 Step 7: postpone, makeups, teacher schedule

// Import your authentication middleware
const { protect } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware'); // 🔐 Role locks

// 🔐 Shortcuts for who is allowed through each door
const adminOnly = allowRoles('admin');
const teacherOnly = allowRoles('teacher');
const teacherOrStudent = allowRoles('teacher', 'student');
const studentOnly = allowRoles('student');

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

// ⏰ Late flow (Step 2): reminders at minute 3 / 8 / 13, 'Student has joined', saved progress
router.post('/late-reminder', protect, teacherOnly, sendLateReminder);
router.post('/student-joined', protect, teacherOnly, markStudentJoined);
router.get('/late-progress', protect, teacherOnly, getLateProgress);
router.get('/away-students', protect, teacherOnly, getAwayStudents); // ⏸️ 'Student away until…' on teacher classes

// 🗓️ Step 7: teacher "My Schedule" (free hours)
router.get('/my-availability', protect, teacherOnly, R.getMyAvailability);
router.put('/my-availability', protect, teacherOnly, R.saveMyAvailability);
router.post('/my-availability/confirm', protect, teacherOnly, R.confirmMyAvailability);

// 🔁 Step 7: student postpone + makeup self-booking
router.get('/makeup-info', protect, studentOnly, R.getMakeupInfo);
router.get('/free-slots', protect, studentOnly, R.getStudentFreeSlots);
router.post('/postpone', protect, studentOnly, R.studentPostpone);
router.post('/book-makeup', protect, studentOnly, R.bookMakeup);

// ==========================================
// 📡 ADMIN COMMAND CENTER & SUBSCRIPTIONS
// ==========================================
router.get('/admin-live-monitor', protect, adminOnly, getAdminLiveMonitor);
router.post('/resend-reminder', protect, adminOnly, resendReminder);
router.post('/resend-notes', protect, adminOnly, resendNotes);
router.post('/join', protect, teacherOnly, joinClass);          
router.post('/makeup', protect, adminOnly, grantMakeupCredit); 
router.post('/admin-cancel', protect, adminOnly, R.adminCancel); // 🚫 Step 7: who cancelled + credit / pay choices, removes the class from Google Calendar
router.post('/admin-postpone', protect, adminOnly, R.adminPostpone); // 🔁 Step 7: student chooses / admin picks / another teacher
router.get('/admin/free-slots', protect, adminOnly, R.getAdminFreeSlots);
router.get('/admin/class-info/:eventId', protect, adminOnly, R.getAdminClassInfo);
// 🛠️ Step 11: admin "Manage" window (student overview, grant a credit, book a makeup / extra class)
router.get('/admin/student/:id/manage', protect, adminOnly, R.getAdminStudentManage);
router.post('/admin/grant-credit', protect, adminOnly, R.adminGrantCredit);
router.post('/admin/book-class', protect, adminOnly, R.adminBookClass);
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
