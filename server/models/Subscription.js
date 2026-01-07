const mongoose = require('mongoose');

const subscriptionSchema = mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    // The Bundle Details
    totalClasses: { type: Number, required: true }, // e.g., 8 classes
    classesUsed: { type: Number, default: 0 },      // Starts at 0
    
    // Dates
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    
    pricePaid: { type: Number }, // For your financial records
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);