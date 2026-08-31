const mongoose = require('mongoose');

const progressReportSchema = mongoose.Schema(
  {
    // --- 1. CORE META DATA ---
    student: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    teacher: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    month: { 
        type: String, 
        required: true // e.g., "September"
    },
    year: { 
        type: Number, 
        required: true // e.g., 2026
    },

    // --- 2. THE TWO-PHASE LIFECYCLE ---
    status: { 
      type: String, 
      enum: [
          'Plan_Active',            // Phase 1: Start of month (Goals only, visible to student)
          'Pending_Admin_Approval', // Phase 2: End of month (Teacher filled grades, hidden from student)
          'Needs_Work',             // Admin rejected it, sent back to Teacher
          'Approved'                // Finalized and fully visible on Student Dashboard
      ], 
      default: 'Plan_Active' 
    },

    // --- 3. THE DYNAMIC SUBJECTS ---
    // Instead of hardcoding max scores, we store them dynamically based on enrollment
    quran: {
      goals: { type: String, default: '' }, 
      statusText: { type: String, default: '' }, // e.g., "Not yet" or "Completed"
      score: { type: Number, default: 0 },       // Allows decimals like 3.5
      maxScore: { type: Number, default: 0 }     // e.g., 4 or 6 depending on rules
    },
    arabic: {
      goals: { type: String, default: '' },
      statusText: { type: String, default: '' }, 
      score: { type: Number, default: 0 },
      maxScore: { type: Number, default: 0 } 
    },
    islamicStudies: {
      goals: { type: String, default: '' },
      statusText: { type: String, default: '' },
      score: { type: Number, default: 0 },
      maxScore: { type: Number, default: 0 } 
    },

    // --- 4. THE FINAL ASSESSMENT ---
    teacherFeedback: { type: String, default: '' }, // The pre-written template + custom notes
    totalScore: { type: Number, default: 0 },       // The final decimal score
    totalMaxScore: { type: Number, default: 10 },   // Almost always 10

    // --- 5. ADMIN CONTROL & APPEALS ---
    // If you (Admin) reject the report:
    adminNotes: { type: String, default: '' }, 
    teacherAcknowledged: { type: Boolean, default: false }, // Forces teacher to read your notes

    // If a Parent disputes a grade after approval:
    appeal: {
        isAppealed: { type: Boolean, default: false },
        reason: { type: String, default: '' },
        status: { type: String, enum: ['Open', 'Resolved'], default: 'Open' }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProgressReport', progressReportSchema);