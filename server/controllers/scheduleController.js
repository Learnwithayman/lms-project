const asyncHandler = require('express-async-handler');
const ClassSession = require('../models/ClassSession');
const User = require('../models/User');

// @desc    Schedule a new class
const scheduleClass = asyncHandler(async (req, res) => {
  const { teacherId, studentId, subject, startTime, durationMinutes, meetingLink } = req.body;

  if (!teacherId || !studentId || !subject || !startTime || !durationMinutes) {
    res.status(400);
    throw new Error('Please add all fields');
  }

  const session = await ClassSession.create({
    teacher: teacherId,
    student: studentId,
    subject,
    meetingLink: meetingLink || '',
    startTime,
    durationMinutes,
  });

  res.status(201).json(session);
});

// @desc    Get classes for the logged-in user
const getMyClasses = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  const classes = await ClassSession.find({
    $or: [{ teacher: userId }, { student: userId }]
  })
  .populate('teacher', 'name email')
  .populate('student', 'name email')
  .sort({ startTime: 1 });

  res.status(200).json(classes);
});

// @desc    Delete a class session
const deleteClass = asyncHandler(async (req, res) => {
  const session = await ClassSession.findById(req.params.id);

  if (!session) {
    res.status(404);
    throw new Error('Class not found');
  }

  await session.deleteOne();
  res.status(200).json({ id: req.params.id });
});

// @desc    Get ALL classes (For Admin) - NEW
const getAllClasses = asyncHandler(async (req, res) => {
  const classes = await ClassSession.find({})
    .populate('teacher', 'name email')
    .populate('student', 'name email')
    .sort({ startTime: 1 }); // Sort by soonest first
  res.status(200).json(classes);
});

// @desc    Update class time (Admin only) - NEW
const updateClass = asyncHandler(async (req, res) => {
  const { newStartTime } = req.body;
  const session = await ClassSession.findById(req.params.id);

  if (!session) {
    res.status(404);
    throw new Error('Class not found');
  }

  session.startTime = newStartTime;
  await session.save();

  res.status(200).json(session);
});

// END A CLASS AND SAVE NOTES
const endClass = async (req, res) => {
  try {
    const { classId, notes, homework } = req.body;

    // Find the class by ID and update its fields
    const updatedClass = await ClassSession.findByIdAndUpdate(
      classId,
      { 
        status: 'completed', 
        notes: notes, 
        homework: homework 
      },
      { new: true } // This tells MongoDB to return the newly updated data
    );

    if (!updatedClass) {
      return res.status(404).json({ message: 'Class not found.' });
    }

    res.status(200).json({ message: 'Class ended successfully!', updatedClass });

  } catch (error) {
    console.error('Error ending class:', error);
    res.status(500).json({ message: 'Server error while ending class.' });
  }
};

// GET ONLY COMPLETED CLASSES
const getCompletedClasses = async (req, res) => {
  try {
    // Find classes where the user is involved AND the status is 'completed'
    const completedClasses = await ClassSession.find({
      $or: [{ teacher: req.user._id }, { student: req.user._id }],
      status: 'completed'
    }).sort({ startTime: -1 }); // Sorts by newest first!

    res.status(200).json(completedClasses);
  } catch (error) {
    console.error('Error fetching completed classes:', error);
    res.status(500).json({ message: 'Server error fetching progress.' });
  }
};

// GET TEACHER EARNINGS FOR CURRENT MONTH
const getTeacherEarnings = async (req, res) => {
  try {
    // 1. Figure out the first and last day of the current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 2. Find only the completed classes for THIS teacher, THIS month
    const completedClasses = await ClassSession.find({
      teacher: req.user._id,
      status: 'completed',
      startTime: { $gte: startOfMonth, $lte: endOfMonth }
    });

    // 3. Add up all the minutes from those classes
    const totalMinutes = completedClasses.reduce((sum, cls) => sum + (cls.durationMinutes || 0), 0);

    // 4. Do the math! (Minutes / 60 to get hours, multiplied by their custom rate)
    // We are using 3.0 here to match your database default!
    const hourlyRate = req.user.hourlyRate || 3.0; 
    const totalHours = totalMinutes / 60;
    const currentEarnings = totalHours * hourlyRate;

    // 5. Send the final paycheck info back to the frontend
    res.status(200).json({
      totalMinutes,
      totalHours: totalHours.toFixed(2),
      hourlyRate,
      currentEarnings: currentEarnings.toFixed(2) // Rounds to 2 decimal places (e.g., $12.50)
    });
  } catch (error) {
    console.error('Error calculating earnings:', error);
    res.status(500).json({ message: 'Server error calculating payroll.' });
  }
};
// GET ALL TEACHERS PAYROLL REPORT (ADMIN ONLY)
const getAdminPayrollReport = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // 1. Find all users who are teachers
    const teachers = await User.find({ role: 'teacher' });

    // 2. Loop through every teacher and calculate their pay
    const payrollReport = await Promise.all(teachers.map(async (teacher) => {
      
      const completedClasses = await ClassSession.find({
        teacher: teacher._id,
        status: 'completed',
        startTime: { $gte: startOfMonth, $lte: endOfMonth }
      });

      const totalMinutes = completedClasses.reduce((sum, cls) => sum + (cls.durationMinutes || 0), 0);
      const hourlyRate = teacher.hourlyRate || 3.0;
      const totalHours = totalMinutes / 60;
      const baseEarnings = totalHours * hourlyRate;

      let adjustmentsTotal = 0;
      if (teacher.adjustments && teacher.adjustments.length > 0) {
        const thisMonthAdjustments = teacher.adjustments.filter(adj => {
          const adjDate = new Date(adj.date);
          return adjDate >= startOfMonth && adjDate <= endOfMonth;
        });
        adjustmentsTotal = thisMonthAdjustments.reduce((sum, adj) => sum + adj.amount, 0);
      }

      // Return a clean summary for this specific teacher
      return {
        teacherId: teacher._id,
        name: teacher.name,
        email: teacher.email,
        totalHours: totalHours.toFixed(2),
        hourlyRate,
        baseEarnings: baseEarnings.toFixed(2),
        adjustmentsTotal: adjustmentsTotal.toFixed(2),
        finalEarnings: (baseEarnings + adjustmentsTotal).toFixed(2)
      };
    }));

    res.status(200).json(payrollReport);
  } catch (error) {
    console.error('Error generating payroll report:', error);
    res.status(500).json({ message: 'Server error generating payroll report.' });
  }
};

// ADD BONUS OR DEDUCTION (ADMIN ONLY)
const addTeacherAdjustment = async (req, res) => {
  try {
    const { teacherId, amount, reason } = req.body;

    const teacher = await User.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Push the new transaction to their ledger
    teacher.adjustments.push({
      amount: Number(amount), // Converts string to number just in case
      reason: reason
    });

    await teacher.save();
    res.status(200).json({ message: 'Adjustment added successfully!', teacher });
  } catch (error) {
    console.error('Error adding adjustment:', error);
    res.status(500).json({ message: 'Server error adding adjustment.' });
  }
};

module.exports = {
  scheduleClass,
  getMyClasses,
  deleteClass,
  getAllClasses,
  updateClass,
  endClass,
  getCompletedClasses,
  getTeacherEarnings,
  getAdminPayrollReport, // <--- Added!
  addTeacherAdjustment   // <--- Added!
};