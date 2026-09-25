const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getMe,
  getAllUsers,
  deleteUser,
  testGroupMessage,
  createAdminInstantly, 
  updateSubscription,
  syncStudentWallet, // 👈 Imported auto-sync function
  getMyStudents,
  assignTeachers,
  updateUserProfile
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', registerUser);
router.get('/', protect, getAllUsers);
router.post('/login', loginUser);
router.get('/me', protect, getMe);

// 🧑‍🏫 Teacher Students Route
router.get('/my-students', protect, getMyStudents);

// ✏️ Edit Profile Route
router.put('/:id', protect, updateUserProfile);

// Delete User Route
router.delete('/:id', protect, deleteUser);

// 💳 Subscription Routes
router.put('/:id/subscription', protect, updateSubscription);
router.post('/:id/sync-wallet', protect, syncStudentWallet); // 👈 NEW: Auto-Sync Wallet Route

// ✨ Assign Teachers Route
router.put('/:id/assign', protect, assignTeachers);

// --- TEST & ADMIN ROUTES ---
router.post('/test-group', testGroupMessage); 
router.get('/emergency-admin', createAdminInstantly);

module.exports = router;