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
const { protect } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware'); // 🔐 Role locks

// 🔐 Only admins can create users or see the full user list
router.post('/', protect, allowRoles('admin'), registerUser);
router.get('/', protect, allowRoles('admin'), getAllUsers);
router.post('/login', loginUser);
router.get('/me', protect, getMe);

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

// ✨ Assign Teachers Route (Admin only)
router.put('/:id/assign', protect, allowRoles('admin'), assignTeachers);

// --- TEST ROUTE ---
// 📲 WhatsApp Bot Test (Admin Dashboard button) — Admin only
router.post('/test-group', protect, allowRoles('admin'), testGroupMessage); 

module.exports = router;
