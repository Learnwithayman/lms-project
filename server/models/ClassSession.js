const mongoose = require('mongoose');

const classSessionSchema = mongoose.Schema({
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  subject: {
    type: String,
    required: true
  },
  // The new field for Zoom links
  meetingLink: {
    type: String,
    default: '',
  },
  startTime: {
    type: Date,
    required: true,
  },
  durationMinutes: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ['scheduled', 'completed', 'cancelled'],
    default: 'scheduled',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('ClassSession', classSessionSchema);