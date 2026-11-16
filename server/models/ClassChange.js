const mongoose = require('mongoose');

// 📜 Step 7: history of every postpone / move / cancel / makeup booking
const classChangeSchema = mongoose.Schema(
  {
    action: { type: String, enum: ['postpone', 'move', 'teacher-change', 'cancel', 'book'], required: true },
    by: { type: String, enum: ['student', 'admin'], required: true },
    byUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cancelledBy: { type: String },                 // cancel only: 'student' | 'teacher' | 'admin'
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    studentName: { type: String },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    teacherName: { type: String },
    newTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    newTeacherName: { type: String },
    eventId: { type: String },
    title: { type: String },
    oldStart: { type: Date },
    newStart: { type: Date },
    reason: { type: String },
    credit: { type: Boolean, default: false },      // makeup credit given
    countedUsed: { type: Boolean, default: false }, // counted from the student package
    teacherPaid: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ClassChange', classChangeSchema);
