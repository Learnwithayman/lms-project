const express = require('express');
const dotenv = require('dotenv').config();
const connectDB = require('./config/db');
const cors = require('cors'); // <--- New tool

const port = process.env.PORT || 5000;

connectDB();

const app = express();

app.use(cors()); // <--- Allow the frontend to connect
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/api/courses', require('./routes/courseRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/schedule', require('./routes/scheduleRoutes'));
app.listen(port, () => console.log(`Server started on port ${port}`));