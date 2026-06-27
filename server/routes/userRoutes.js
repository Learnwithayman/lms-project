const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  getMe,
  getAllUsers,
  deleteUser,
  testGroupMessage,
  createAdminInstantly // <--- Importing the hack here
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', registerUser);
router.get('/', protect, getAllUsers);
router.post('/login', loginUser);
router.get('/me', protect, getMe);

// The Delete Route (requires ID)
router.delete('/:id', protect, deleteUser);

// --- NEW TEST ROUTE ---
router.post('/test-group', testGroupMessage); 

// --- EMERGENCY ADMIN ROUTE ---
router.get('/emergency-admin', createAdminInstantly);

module.exports = router;