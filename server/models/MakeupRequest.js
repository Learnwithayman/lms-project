const mongoose = require('mongoose');

const makeupRequestSchema = mongoose.Schema({
  student: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  originalDate: { 
    type: Date, 
    required: true 
  },
  preferredDate: { 
    type: Date, 
    required: true 
  },
  reason: { 
    type: String 
  },
  status: { 
    type: String, 
    enum: ['pending', 'resolved'], 
    default: 'pending' 
  }
}, { timestamps: true });

module.exports = mongoose.model('MakeupRequest', makeupRequestSchema);