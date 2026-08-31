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
    currency: { type: String, default: 'USD' }, 
    
    // The Adjustments Ledger for bonuses and deductions
    adjustments: [
      {
        amount: { type: Number, required: true }, 
        reason: { type: String },                
        date: { type: Date, default: Date.now }
      }
    ],

    // --- ASSIGNED TEACHERS (For Students) ---
    assignedTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Legacy single teacher support
    assignedTeachers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // NEW: Multi-teacher array

    // ==========================================
    // ✨ NEW: SUBSCRIPTION & MAKEUP ENGINE 
    // ==========================================
    subscription: {
      status: { 
        type: String, 
        enum: ['active', 'expired', 'paused', 'none'], 
        default: 'none' 
      },
      startDate: { type: Date },
      endDate: { type: Date },
      totalClassesBought: { type: Number, default: 0 },
      classesUsed: { type: Number, default: 0 }
    },

    makeupBank: [
      {
        originalClassDate: { type: Date, required: true },
        expirationDate: { type: Date, required: true }, 
        reason: { type: String }, 
        isUsed: { type: Boolean, default: false } 
      }
    ]
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