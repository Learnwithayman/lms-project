const express = require('express');
const router = express.Router();
const { 
  registerUser, 
  loginUser, 
  getMe, 
  getAllUsers, 
  deleteUser,
  testGroupMessage // <--- Added this
} = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', registerUser);
router.get('/', protect, getAllUsers);
router.post('/login', loginUser);
router.get('/me', protect, getMe);

// The Delete Route (requires ID)
router.delete('/:id', protect, deleteUser); 

// --- NEW TEST ROUTE ---
router.post('/test-group', testGroupMessage); // <--- Added this

module.exports = router;