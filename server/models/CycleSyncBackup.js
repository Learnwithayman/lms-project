const mongoose = require('mongoose');

// 💳 Step 17: backup of a student's cycle values before each PayPal cycles sync (for undo / checking)
const cycleSyncBackupSchema = mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    studentName: { type: String },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    source: { type: String },                                   // 'button' | 'daily'
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }   // admin who pressed Apply (empty for daily)
  },
  { timestamps: true }
);

module.exports = mongoose.model('CycleSyncBackup', cycleSyncBackupSchema);
