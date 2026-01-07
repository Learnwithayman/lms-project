const express = require('express');
const router = express.Router();
const { 
  scheduleClass, 
  getMyClasses, 
  deleteClass, 
  getAllClasses, 
  updateClass 
} = require('../controllers/scheduleController');
const { protect } = require('../middleware/authMiddleware');

// Admin creates the class
router.post('/', protect, scheduleClass);

// Teachers/Students view their classes
router.get('/my-classes', protect, getMyClasses);

// Admin view ALL classes
router.get('/all', protect, getAllClasses);

// Admin updates class time
router.put('/:id', protect, updateClass);

// Admin deletes a class
router.delete('/:id', protect, deleteClass);

module.exports = router;