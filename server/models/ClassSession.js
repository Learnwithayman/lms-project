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
    required: false, // 🔓 STRICT RULE REMOVED! Google classes will now save flawlessly.
  },
  subject: {
    type: String,
    required: true
  },
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
  notes: { 
    type: String, 
    default: '' 
  },
  homework: { 
    type: String, 
    default: '' 
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('ClassSession', classSessionSchema);