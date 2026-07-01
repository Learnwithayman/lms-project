const mongoose = require('mongoose');

const payrollHistorySchema = new mongoose.Schema({
  month: { type: String, required: true }, // e.g., "June 2026"
  year: { type: Number, required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: String,
  email: String,
  totalHours: Number,
  hourlyRate: Number,
  baseEarnings: Number,
  adjustmentsTotal: Number,
  finalEarnings: Number
}, { timestamps: true });

module.exports = mongoose.model('PayrollHistory', payrollHistorySchema);