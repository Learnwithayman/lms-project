const mongoose = require('mongoose');

const leadSchema = mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    whatsappNumber: { type: String, required: true },
    studentAge: { type: String, default: '' },
    preferredSubjects: { type: [String], default: [] },
    status: { type: String, default: 'New Request' }, // Can be 'New Request', 'Trial Scheduled', 'Enrolled'
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lead', leadSchema);