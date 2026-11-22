const mongoose = require('mongoose');

// 📨 Step 14: a durable copy of the WhatsApp send queue.
// The queue itself still lives in memory (utils/whatsappBot.js) for speed, but every message is saved
// here the moment it is queued, before any attempt to send it. If the server restarts while messages are
// still waiting (a Render restart, crash, or free-tier sleep), nothing is lost silently: on the next start,
// recent pending messages are resumed automatically, and older ones are reported to the admin instead of
// being resent blindly.
const queuedMessageSchema = mongoose.Schema(
  {
    recipient: { type: String, required: true },
    messageBody: { type: String, required: true },
    urgent: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'done', 'lost'], default: 'pending' } // 'done' = an attempt was made (see MessageLog for sent/failed); 'lost' = too old on restart, reported instead of resent
  },
  { timestamps: true }
);

module.exports = mongoose.model('QueuedMessage', queuedMessageSchema);
