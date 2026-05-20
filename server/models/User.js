const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ['student', 'teacher', 'admin'],
      default: 'student',
    },
    // Contact Info
    phone: { type: String, required: false },
    whatsappNumber: { type: String, required: false }, 
    whatsappGroupId: { type: String, default: '' }, 
    timezone: { type: String, default: 'Africa/Cairo' },
    hourlyRate: { type: Number, default: 3.0 },
    
    // The Adjustments Ledger for bonuses and deductions
    adjustments: [
      {
        amount: { type: Number, required: true }, 
        reason: { type: String },                 
        date: { type: Date, default: Date.now }
      }
    ],
  },
  { timestamps: true }
);

// Encrypt password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Check if password matches
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// This exact line is what makes .findOne() work in your controller!
module.exports = mongoose.model('User', userSchema);