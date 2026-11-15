const mongoose = require('mongoose');

// 📋 Step 5: one row per reminder already sent (unique key), so a reminder is never sent twice
// e.g. "2026-12-03|plans-firm|<teacherId>"
const reminderRunSchema = mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    sentAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

module.exports = mongoose.model('ReminderRun', reminderRunSchema);
