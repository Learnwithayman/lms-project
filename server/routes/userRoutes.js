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
  getMyStudents // 👈 NEW: Imported the Teacher Students function
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', registerUser);
router.get('/', protect, getAllUsers);
router.post('/login', loginUser);
router.get('/me', protect, getMe);

// 🧑‍🏫 NEW: Get assigned students for the logged-in teacher
router.get('/my-students', protect, getMyStudents);

// The Delete Route (requires ID)
router.delete('/:id', protect, deleteUser);

// 💳 The Subscription Update Route
router.put('/:id/subscription', protect, updateSubscription);

// --- NEW TEST ROUTE ---
router.post('/test-group', testGroupMessage); 

// --- EMERGENCY ADMIN ROUTE ---
router.get('/emergency-admin', createAdminInstantly);

module.exports = router;