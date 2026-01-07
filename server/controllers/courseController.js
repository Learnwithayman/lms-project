const asyncHandler = require('express-async-handler');
const Course = require('../models/Course');

// @desc    Get all courses
// @route   GET /api/courses
// @access  Public
const getCourses = asyncHandler(async (req, res) => {
  const courses = await Course.find({});
  res.json(courses);
});

// @desc    Get single course
// @route   GET /api/courses/:id
// @access  Public
const getCourseById = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (course) {
    res.json(course);
  } else {
    res.status(404);
    throw new Error('Course not found');
  }
});

// @desc    Create a new course
// @route   POST /api/courses
// @access  Private/Admin
const createCourse = asyncHandler(async (req, res) => {
  const { title, description, instructor, duration, videoUrl } = req.body;

  if (!title || !description || !videoUrl) {
    res.status(400);
    throw new Error('Please add a title, description, and video URL');
  }

  const course = await Course.create({
    user: req.user.id, // This links the admin to the course
    title,
    description,
    instructor,
    duration,
    videoUrl,
  });

  res.status(201).json(course);
});
// @desc    Get all users (Admin only)
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find({}); // Get everyone
  res.json(users);
});
// IMPORTANT: This exports all 3 functions so the router can use them
module.exports = {
  getCourses,
  getCourseById,
  createCourse,
  getAllUsers,
};