const mongoose = require('mongoose');

// ⚙️ Small key/value settings (e.g. "groupIdsSwitchedAt" after the Step 8 switch to new IDs)
const settingSchema = mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
