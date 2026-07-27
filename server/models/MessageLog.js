const mongoose = require('mongoose');

const messageLogSchema = mongoose.Schema(
  {
    recipient: {
      type: String,
      required: true,
    },
    messageBody: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      default: 'sent', // Can be 'sent' or 'failed'
    },
    errorMessage: {
      type: String,
      default: '',
    }
  },
  {
    timestamps: true, // Automatically creates createdAt and updatedAt fields
  }
);

module.exports = mongoose.model('MessageLog', messageLogSchema);