const mongoose = require('mongoose');

// 🧾 Every PayPal webhook notice the server receives is saved here,
// so we can always see exactly what PayPal sent and what the LMS did with it.
const paypalEventSchema = mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true }, // PayPal's event id (WH-...)
    eventType: { type: String },                             // e.g. INVOICING.INVOICE.SENT
    resourceId: { type: String },                            // Invoice (INV2-...) or subscription (I-...) id
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },          // First matched student
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],       // All matched students (siblings)
    matchedBy: { type: String },                             // seriesId / invoiceId / email / subscriptionId / none
    result: { type: String },                                // What the LMS did, in plain words
    raw: { type: mongoose.Schema.Types.Mixed }               // The full notice from PayPal
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaypalEvent', paypalEventSchema);
