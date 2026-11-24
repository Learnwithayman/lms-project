const mongoose = require('mongoose');

// 👥 STEP 13 (24 Nov): group courses (e.g. Kareem + Adam).
// One weekly class for several students. Members are Gift (free), a NEW student on their own PayPal
// seat subscription, or an already-enrolled student whose $20 is added to their MAIN invoice (the LMS
// only reminds the admin; PayPal is never changed by the LMS). Group classes never count against a
// member's own subscription.
const memberSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, default: '' },
  billing: { type: String, enum: ['gift', 'new_paypal', 'main_invoice'], default: 'gift' },
  paypalSubscriptionId: { type: String, default: '' }, // optional, for a NEW student's seat subscription
  joinedAt: { type: Date, default: Date.now },
  leftAt: { type: Date, default: null } // set when removed (kept for history)
}, { _id: true });

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  course: { type: String, default: '', trim: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  weekday: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday … 6 = Saturday
  time: { type: String, required: true },                    // "HH:MM" in timeZone
  timeZone: { type: String, default: 'America/New_York' },
  durationMinutes: { type: Number, default: 60 },
  startDate: { type: String, default: '' },                  // "YYYY-MM-DD" first week (optional)
  whatsappLink: { type: String, default: '' },               // the course WhatsApp group (all members + teacher)
  classroomLink: { type: String, default: '' },              // the group's Google Classroom
  zoomLink: { type: String, default: '' },
  seatPrice: { type: Number, default: 5 },                   // $ per hour per paying seat
  teacherSeatBonus: { type: Number, default: 2 },            // $ per hour per paying seat, added to the teacher's pay
  active: { type: Boolean, default: true },
  calendarEventId: { type: String, default: '' },            // the current weekly series in Google Calendar
  pastEventIds: [{ type: String }],                          // older series (time / teacher changed)
  members: [memberSchema]
}, { timestamps: true });

module.exports = mongoose.model('Group', groupSchema);
