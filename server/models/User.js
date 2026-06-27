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
    
    // --- CONTACT INFO ---
    phone: { type: String, required: false },
    whatsappNumber: { type: String, required: false }, 
    timezone: { type: String, default: 'Africa/Cairo' },

    // --- CALENDAR & BOT LINKING ---
    teacherGroupId: { type: String, default: '' }, 
    studentGroupId: { type: String, default: '' }, 
    
    // --- TEACHER PAYROLL ---
    hourlyRate: { type: Number, default: 3.0 },
    currency: { type: String, default: 'USD' }, // <--- NEW: Currency tracking
    
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

module.exports = mongoose.model('User', userSchema);