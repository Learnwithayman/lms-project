const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getMe,
  getAllUsers,
  deleteUser,
  testGroupMessage,
  updateSubscription,
  syncStudentWallet, // 👈 Imported auto-sync function
  getMyStudents,
  assignTeachers,
  updateUserProfile
} = require('../controllers/userController');
const { setPause, getPauseClasses, removePauseClasses, reactivateStudent } = require('../controllers/pauseController'); // ⏸️ Student pause (Step 3)
const { getAssignmentCheck } = require('../controllers/reportDutyController'); // 📋 Step 5: calendar teacher check
const { getClassChanges } = require('../controllers/rescheduleController'); // 📜 Step 7: class changes history
const { getStudentCycle } = require('../controllers/cycleController'); // 🔄 Step 17: calculated cycle
const { protect } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware'); // 🔐 Role locks

// 🔐 Only admins can create users or see the full user list
router.post('/', protect, allowRoles('admin'), registerUser);
router.get('/', protect, allowRoles('admin'), getAllUsers);
router.post('/login', loginUser);
router.get('/me', protect, getMe);

// 📋 Which teachers teach each student this month on Google Calendar (Admin only, Users page)
router.get('/assignment-check', protect, allowRoles('admin'), getAssignmentCheck);

// 🧑‍🏫 Teacher Students Route
router.get('/my-students', protect, getMyStudents);

// ✏️ Edit Profile Route (Admin only)
router.put('/:id', protect, allowRoles('admin'), updateUserProfile);

// Delete User Route (Admin only)
router.delete('/:id', protect, allowRoles('admin'), deleteUser);

// 💳 Subscription Routes (Admin only)
router.put('/:id/subscription', protect, allowRoles('admin'), updateSubscription);
router.post('/:id/sync-wallet', protect, allowRoles('admin'), syncStudentWallet); // 👈 Auto-Sync Wallet Route

// ⏸️ Student pause (Admin only)
router.post('/:id/pause', protect, allowRoles('admin'), setPause);
router.get('/:id/pause/classes', protect, allowRoles('admin'), getPauseClasses);
router.post('/:id/pause/remove-classes', protect, allowRoles('admin'), removePauseClasses);
router.post('/:id/reactivate', protect, allowRoles('admin'), reactivateStudent);

// 📜 Class changes history (Admin only, student profile)
router.get('/:id/class-changes', protect, allowRoles('admin'), getClassChanges);

// 🔄 Step 17: calculated cycle (classes done / remaining, payment due, flags) (Admin only, student profile)
router.get('/:id/cycle', protect, allowRoles('admin'), getStudentCycle);

// ✨ Assign Teachers Route (Admin only)
router.put('/:id/assign', protect, allowRoles('admin'), assignTeachers);

// --- TEST ROUTE ---
// 📲 WhatsApp Bot Test (Admin Dashboard button) — Admin only
router.post('/test-group', protect, allowRoles('admin'), testGroupMessage); 

module.exports = router;
