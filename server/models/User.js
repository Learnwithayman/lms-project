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
    assignedTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
    assignedTeachers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], 

    // ==========================================
    // ✨ PAYPAL BILLING ENGINE (Subscriptions & Invoices)
    // ==========================================
    paypal: {
      billingType: { 
        type: String, 
        enum: ['subscription', 'recurring_invoice', 'none'], 
        default: 'none' 
      },
      subscriptionId: { type: String, trim: true, index: true },   // For I-...
      recurringSeriesId: { type: String, trim: true, index: true },// For RI-... (PayPal Recurring Series ID)
      invoiceId: { type: String, trim: true, index: true },        // For INV2-...
      planName: { type: String },                                  // e.g., "Quran Intensive - 12x"
      status: { 
        type: String, 
        enum: ['active', 'paused', 'expired', 'cancelled'], 
        default: 'active' 
      },
      cycleStartDate: { type: Date },
      cycleEndDate: { type: Date },
      nextBillingDate: { type: Date },
      amount: { type: Number },
      billingCycle: {                         // ⏳ Length of a new cycle when PayPal bills (4-week months)
        type: String,
        enum: ['monthly', 'quarterly', 'semiannual', 'yearly'], // 28 / 84 / 168 / 336 days
        default: 'monthly'
      },

      // 🛡️ Webhook safety fields (Step 1)
      lastInvoiceId: { type: String },        // Last invoice that started a cycle (stops double renewals)
      lastInvoiceSentAt: { type: Date },      // When PayPal sent that invoice
      lastPaidAt: { type: Date },             // Last time a payment was received
      processedEventIds: [{ type: String }]   // Recent PayPal event IDs already handled (duplicate protection)
    },

    // ✨ RECURRING LESSON SLOTS
    recurringSlots: [
      {
        dayOfWeek: { type: String }, // e.g., "Sunday", "Tuesday"
        startTime: { type: String }, // e.g., "18:00"
        endTime: { type: String },   // e.g., "18:45"
        durationMinutes: { type: Number, default: 45 }
      }
    ],

    // ==========================================
    // ✨ SUBSCRIPTION & MAKEUP ENGINE 
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

    // ==========================================
    // ⏸️ STUDENT PAUSE (Step 3)
    // ==========================================
    // kind 'full' → subscription paused (status 'paused'), cycle saved to resume on return.
    // kind 'away' → subscription continues (status stays 'active'), all class reminders muted.
    // Stays paused until the admin reactivates (even after the return date).
    pause: {
      kind: { type: String, enum: ['full', 'away'] },
      startedAt: { type: Date },
      returnDate: { type: Date },
      savedClassesUsed: { type: Number },      // full pause: cycle snapshot to resume
      savedTotalClasses: { type: Number },
      savedDaysLeft: { type: Number },
      classesRemovedAt: { type: Date },        // when the admin removed future classes
      classesRemovedCount: { type: Number },
      adminAlertSentAt: { type: Date },        // return-day alerts (sent once)
      studentWelcomeSentAt: { type: Date }
    },

    makeupBank: [
      {
        originalClassDate: { type: Date, required: true },
        expirationDate: { type: Date, required: true }, 
        reason: { type: String }, 
        isUsed: { type: Boolean, default: false } 
      }
    ],

    // ==========================================
    // ✨ DYNAMIC STUDY PLANS & REPORTS ENGINE
    // ==========================================
    monthlyReports: [
      {
        monthYear: { type: String, required: true }, // e.g., "September 2026"
        
        quran: {
          enrolled: { type: Boolean, default: false },
          plan: { type: String, default: '' },
          score: { type: Number, default: null },
          maxPossible: { type: Number, default: 4 }
        },
        
        arabic: {
          enrolled: { type: Boolean, default: false },
          plan: { type: String, default: '' },
          score: { type: Number, default: null },
          maxPossible: { type: Number, default: 3 }
        },
        
        islamicStudies: {
          enrolled: { type: Boolean, default: false },
          plan: { type: String, default: '' },
          score: { type: Number, default: null },
          maxPossible: { type: Number, default: 3 }
        },
        
        totalScore: { type: Number, default: null }, // Always out of 10
        teacherNote: { type: String, default: '' },
        isFinalized: { type: Boolean, default: false }, // false = Phase 1 Plan, true = Phase 2 Report
        approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        createdAt: { type: Date, default: Date.now },

        // 📋 Step 5: which teacher saved which part (first save time = on-time check)
        savedBy: [
          {
            teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            teacherName: { type: String },
            planSavedAt: { type: Date },
            reportSavedAt: { type: Date }
          }
        ],
        lastSavedByName: { type: String },   // shown on the approval screen ("New part from …")
        lastSavedAt: { type: Date },         // approval nudge (waiting 2+ days)
        waitingForNames: [{ type: String }], // "Approve and wait for {name}"
        planSentAt: { type: Date },          // student notified once per phase
        reportSentAt: { type: Date }
      }
    ],

    // ==========================================
    // ✨ LEGACY PDF VAULT
    // ==========================================
    legacyReports: [
      {
        monthYear: { type: String, required: true }, // e.g., "August 2026"
        pdfLink: { type: String, required: true },   // Google Drive Link
        addedAt: { type: Date, default: Date.now }
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