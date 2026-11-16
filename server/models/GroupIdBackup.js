const mongoose = require('mongoose');

// 🔄 Step 8: backup of every Google Calendar class description changed by "Switch to new IDs" (for undo)
const groupIdBackupSchema = mongoose.Schema(
  {
    eventId: { type: String, required: true },
    summary: { type: String },
    kind: { type: String },              // 'series' | 'single' | 'exception'
    oldDescription: { type: String },
    newDescription: { type: String },
    appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('GroupIdBackup', groupIdBackupSchema);
