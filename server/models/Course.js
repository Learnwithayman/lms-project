const mongoose = require('mongoose');

// We define the structure for a single lesson here
const lessonSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  contentType: {
    type: String,
    required: true,
    enum: ['video', 'text', 'quiz'],
  },
  content: {
    type: String, // This could be a video URL or text content
  },
});

const courseSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  title: {
    type: String,
    required: [true, 'Please add a course title'],
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
  },
  lessons: [lessonSchema], // <-- This is the new line
}, {
  timestamps: true,
});

module.exports = mongoose.model('Course', courseSchema);