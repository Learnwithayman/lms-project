const express = require('express');
const router = express.Router();
const {
  updateTeacherRate,
  createSubscription,
} = require('../controllers/adminController');
const { protect, admin } = require('../middleware/authMiddleware');

// All routes here are protected (Must be Logged In + Must be Admin)
router.put('/teacher-rate/:id', protect, admin, updateTeacherRate);
router.post('/subscription', protect, admin, createSubscription);

module.exports = router;