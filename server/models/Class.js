const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
    className: { 
        type: String, 
        required: true,
        unique: true // Ensures we map one Google Calendar event name to one config
    },
    
    // Split into separate WhatsApp groups so you can notify them differently
    teacherGroupId: { 
        type: String, 
        required: true 
    },
    studentGroupId: { 
        type: String, 
        required: true 
    },

    // 🤖 NEW FIELDS FOR THE GHOST-BOT: The exact names of the WhatsApp groups
    teacherGroupName: { 
        type: String, 
        required: false // Optional so old classes don't break your database!
    },
    studentGroupName: { 
        type: String, 
        required: false 
    },
    
    // References to your separate user collections
    teacherId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' // Change to 'Teacher' if your schema is named differently
    },
    students: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' // Change to 'Student' if your schema is named differently
    }],

    // Tracking state for your 3-minute late alerts
    tracking: {
        lastCheckedDate: { type: String, default: "" }, // Format: YYYY-MM-DD
        teacherJoined: { type: Boolean, default: false },
        studentsJoinedCount: { type: Number, default: 0 }
    }
}, { timestamps: true });

module.exports = mongoose.model('Class', classSchema);