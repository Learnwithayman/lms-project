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
    required: false, // 🔓 Changed to false so "Join Class" doesn't crash!
    default: 60
  },
  status: {
    type: String,
    // 🔓 Added 'started' and 'in-progress' so the DB accepts the button click!
    enum: ['scheduled', 'started', 'in-progress', 'completed', 'cancelled'],
    default: 'scheduled',
  },
  studentGroupName: {
    type: String,
    default: '' // 🔓 Added so cron.js can actually find the student name!
  },
  teacherGroupName: {
    type: String,
    default: ''
  },
  notes: { 
    type: String, 
    default: '' 
  },
  homework: { 
    type: String, 
    default: '' 
  },
  // 👥 Step 13: group classes
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
  attendance: [{ student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, name: String, status: { type: String, enum: ['present', 'absent'] } }],
  recordingLink: { type: String, default: '' },
  seatBonus: { type: Number, default: 0 }, // $ added to the teacher's pay for paying seats (also saved as a teacher adjustment)
}, {
  timestamps: true,
});

module.exports = mongoose.model('ClassSession', classSessionSchema);