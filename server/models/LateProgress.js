const mongoose = require('mongoose');

// ⏰ Late flow progress for one class (Step 2)
// Saved on the server so the reminders & "joined" state survive a refresh or another device.
const lateProgressSchema = mongoose.Schema(
  {
    classId: { type: String, required: true },                  // Google Calendar event id (or ClassSession id)
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startTime: { type: Date, required: true },                  // Class start: the late clock is fixed to this
    studentName: { type: String },
    reminders: [
      {
        step: { type: Number },                                 // 1 = minute 3, 2 = minute 8, 3 = minute 13
        sentAt: { type: Date, default: Date.now }
      }
    ],
    joinedAt: { type: Date }                                    // When the teacher pressed "Student has joined"
  },
  { timestamps: true }
);

lateProgressSchema.index({ classId: 1, teacher: 1 }, { unique: true });

module.exports = mongoose.model('LateProgress', lateProgressSchema);
