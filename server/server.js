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

// 💰 Turn on the new Monthly Payroll Robotic Accountant
const { startPayrollCron } = require('./utils/payrollCron');
startPayrollCron(); 

const app = express();

// Middleware Configuration — Robust CORS Configuration
const allowedOrigins = [
  'https://lms.learnwithayman.com',
  'http://localhost:3000' // Keeps it working for local tests too!
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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

// 🚀 FIXED: Added '0.0.0.0' to explicitly open the port for Render!
app.listen(port, '0.0.0.0', () => console.log(`Server started on port ${port}`));