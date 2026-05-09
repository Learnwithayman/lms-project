const express = require('express');
const router = express.Router();
const {
  scheduleClass,
  getMyClasses,
  deleteClass,
  getAllClasses,
  updateClass,
  endClass,
  getCompletedClasses,
  getTeacherEarnings // <--- New import added here!
} = require('../controllers/scheduleController');
const { protect } = require('../middleware/authMiddleware');

// Admin creates the class
router.post('/', protect, scheduleClass);

// Teachers/Students view their classes
router.get('/my-classes', protect, getMyClasses);

// Admin view ALL classes
router.get('/all', protect, getAllClasses);

// View completed classes for Progress Hub (MUST BE ABOVE /:id)
router.get('/completed', protect, getCompletedClasses);

// View teacher earnings for the month (MUST BE ABOVE /:id)
router.get('/earnings', protect, getTeacherEarnings); // <--- New route added safely here!

// Teacher ends a class and saves notes (MUST BE ABOVE /:id)
router.put('/end', protect, endClass);

// Admin updates class time (Dynamic route)
router.put('/:id', protect, updateClass);

// Admin deletes a class (Dynamic route)
router.delete('/:id', protect, deleteClass);

module.exports = router;