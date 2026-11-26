const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// 🧩 Step 28 (26 Nov): one teacher's part of a subject in a monthly report (e.g. "Fiqh" by one teacher, "Hadith" by another)
const reportPartSchema = new mongoose.Schema({
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  teacherName: { type: String, default: '' },
  part: { type: String, default: '' },
  plan: { type: String, default: '' },
  completed: { type: Boolean, default: false },
  comment: { type: String, default: '' },
  score: { type: Number, default: null },
  final: { type: Boolean, default: false }, // saved in the report phase (counts for the average)
  enrolled: { type: Boolean, default: true },
  updatedAt: { type: Date }
}, { _id: false });

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
    broadcastActive: { type: Boolean, default: false }, // 📣 Step 9: teacher receives "Send updates" (ticked in the admin panel)

    // --- CALENDAR & BOT LINKING ---
    teacherGroupId: { type: String, default: '' }, 
    studentGroupId: { type: String, default: '' },
    legacyGroupIds: [{ type: String }], // 🔗 old WhatsApp group IDs (1203…@g.us) kept after "Fix group links", still used to match classes
    
    // --- TEACHER PAYROLL ---
    hourlyRate: { type: Number, default: 3.0 },
    // 🆔 Step 21: the teacher's Zoom room (shown in the student reminders)
    zoomLink: { type: String, default: '' },
    zoomMeetingId: { type: String, default: '' },
    zoomPasscode: { type: String, default: '' },
    // 🎁 W2 Phase A: free trials booked from the website. The visitor first chooses a female or a
    // male teacher, and only teachers ticked here are offered a trial (Ayman's own hours stay free).
    gender: { type: String, enum: ['', 'male', 'female'], default: '' },
    trialsOpen: { type: Boolean, default: false },
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
        enum: ['subscription', 'recurring_invoice', 'none', 'class_package', 'after_pay_monthly'], // 📦🧾 Step 18: package by classes / monthly after-pay (26th → 25th)
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
        enum: ['monthly', 'quarterly', 'semiannual', 'yearly', 'calendar_year'], // 28 / 84 / 168 / 336 days / same date next year (Step 17)
        default: 'monthly'
      },

      // 🛡️ Webhook safety fields (Step 1)
      lastInvoiceId: { type: String },        // Last invoice that started a cycle (stops double renewals)
      lastInvoiceSentAt: { type: Date },      // When PayPal sent that invoice
      lastPaidAt: { type: Date },             // Last time a payment was received
      lastInvoiceUrl: { type: String },       // 🔄 Step 17: pay link of the last invoice ("Pay here" on the student dashboard)
      cycleUnit: { type: String },            // 💳 Step 17: PayPal interval unit (DAY / WEEK / MONTH / YEAR)
      cycleCount: { type: Number },           //    and count, e.g. DAY × 28, WEEK × 48, YEAR × 1
      currentCyclePaid: { type: Boolean, default: null }, // paid for the current cycle (read from PayPal); null = unknown
      lastSyncedAt: { type: Date },           // last "PayPal cycles" sync
      packagesPaid: { type: Number },         // 📦 Step 18: "Package by classes": packages paid since the package start (Mark as paid adds 1)
      packageAlertFor: { type: Number },      //    admin "package finished" alert already sent for this packagesPaid value
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
        isUsed: { type: Boolean, default: false },

        // 🔁 Step 7: postpone / cancel credits and self-booking
        source: { type: String },                    // 'postpone' | 'admin-postpone' | 'cancel' | 'admin'
        teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        teacherName: { type: String },
        durationMinutes: { type: Number },
        template: {                                  // copy of the original class, used to book the makeup
          summary: { type: String },
          description: { type: String },
          timeZone: { type: String },
          location: { type: String },
          colorId: { type: String }
        },
        waitingTeacherUpdate: { type: Boolean, default: false }, // teacher asked to update hours first
        usedAt: { type: Date },
        usedForEventId: { type: String },
        expiryWarnedAt: { type: Date },
        noSlotsAlertAt: { type: Date }
      }
    ],

    // 🗓️ Step 7: teacher free hours ("My Schedule"), all times in Cairo time
    availability: {
      weekly: [
        {
          day: { type: Number },        // 0 = Sunday … 6 = Saturday
          start: { type: String },      // "16:00"
          end: { type: String }         // "21:00"
        }
      ],
      blocked: [{ type: String }],      // whole days off, "YYYY-MM-DD"
      extra: [
        {
          date: { type: String },       // "YYYY-MM-DD"
          start: { type: String },
          end: { type: String }
        }
      ],
      confirmedAt: { type: Date }       // last "My hours are correct" / save
    },

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
          maxPossible: { type: Number, default: 4 },
          completed: { type: Boolean, default: false }, // 🧩 26 Nov: was sent by the form but never saved (not in the schema)
          comment: { type: String, default: '' },
          parts: [reportPartSchema] // 🧩 Step 28: one part per teacher (e.g. Fiqh / Hadith)
        },
        
        arabic: {
          enrolled: { type: Boolean, default: false },
          plan: { type: String, default: '' },
          score: { type: Number, default: null },
          maxPossible: { type: Number, default: 3 },
          completed: { type: Boolean, default: false }, // 🧩 26 Nov: was sent by the form but never saved (not in the schema)
          comment: { type: String, default: '' },
          parts: [reportPartSchema] // 🧩 Step 28: one part per teacher (e.g. Fiqh / Hadith)
        },
        
        islamicStudies: {
          enrolled: { type: Boolean, default: false },
          plan: { type: String, default: '' },
          score: { type: Number, default: null },
          maxPossible: { type: Number, default: 3 },
          completed: { type: Boolean, default: false }, // 🧩 26 Nov: was sent by the form but never saved (not in the schema)
          comment: { type: String, default: '' },
          parts: [reportPartSchema] // 🧩 Step 28: one part per teacher (e.g. Fiqh / Hadith)
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
    return next(); // 🔐 26 Nov: stop here; without return an unchanged password was hashed a second time
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Check if password matches
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);