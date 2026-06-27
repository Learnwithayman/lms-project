const express = require('express');
const dotenv = require('dotenv').config();
const connectDB = require('./config/db');
const cors = require('cors'); 

const port = process.env.PORT || 5000;

// Connect to MongoDB Database
connectDB();

// --- Start the WhatsApp Bot & Automated Systems ---
require('./utils/whatsappBot');
require('./utils/cronJobs'); // Turns on the automated time-based WhatsApp alerts

const app = express();

// Middleware Configuration
app.use(cors()); // Allows your live frontend web app to talk to this server smoothly
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ✨ RENDER HEALTH CHECK ROUTE ✨
// Render requests a valid HTTP response to confirm your server booted up cleanly on their architecture!
app.get('/', (req, res) => {
  res.status(200).send('🚀 Learn With Ayman LMS Backend Engine is Live and Healthy!');
});

// API Route Handlers
app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/schedule', require('./routes/scheduleRoutes'));

// Start listening for traffic
app.listen(port, () => console.log(`Server started on port ${port}`));