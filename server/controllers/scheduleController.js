const asyncHandler = require('express-async-handler');
const ClassSession = require('../models/ClassSession');
const User = require('../models/User');
const whatsappClient = require('../utils/whatsappBot');

// @desc    Schedule a new class
const scheduleClass = asyncHandler(async (req, res) => {
  const { teacherId, studentId, subject, startTime, durationMinutes, meetingLink, meetingId, passcode } = req.body;

  if (!teacherId || !studentId || !subject || !startTime || !durationMinutes) {
    res.status(400);
    throw new Error('Please add all fields');
  }

  const session = await ClassSession.create({
    teacher: teacherId,
    student: studentId,
    subject,
    meetingLink: meetingLink || '',
    meetingId: meetingId || '', 
    passcode: passcode || '',
    startTime,
    durationMinutes,
  });

  // 🚀 TEACHER UPDATE ALERT: NEW CLASS 🚀
  const teacher = await User.findById(teacherId);
  const student = await User.findById(studentId);
  
  if (teacher && teacher.whatsappGroupId) {
    const message = `⚠️ *Schedule Update Alert*\n\nالسلام عليكم / Assalamu Alaikum *${teacher.name}*,\n\nThere has been a change to your schedule regarding your class with *${student.name}*.\n\n📌 *Update Type:* 🔔 New Class Added\n🕒 *Class Time:* ${new Date(startTime).toLocaleString()}\n\nPlease check your Teacher Dashboard for full details. \n*Learn With Ayman Admin Team*`;
    await whatsappClient.sendMessage(teacher.whatsappGroupId, message);
  }

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
  const session = await ClassSession.findById(req.params.id)
    .populate('teacher', 'name whatsappGroupId')
    .populate('student', 'name');

  if (!session) {
    res.status(404);
    throw new Error('Class not found');
  }

  // 🚀 TEACHER UPDATE ALERT: CLASS REMOVED 🚀
  if (session.teacher && session.teacher.whatsappGroupId) {
    const message = `⚠️ *Schedule Update Alert*\n\nالسلام عليكم / Assalamu Alaikum *${session.teacher.name}*,\n\nThere has been a change to your schedule regarding your class with *${session.student.name}*.\n\n📌 *Update Type:* ❌ Canceled\n\nThis class has been removed from your schedule.\n\nPlease check your Teacher Dashboard for full details. \n*Learn With Ayman Admin Team*`;
    await whatsappClient.sendMessage(session.teacher.whatsappGroupId, message);
  }

  await session.deleteOne();
  res.status(200).json({ id: req.params.id });
});

// @desc    Get ALL classes (For Admin)
const getAllClasses = asyncHandler(async (req, res) => {
  const classes = await ClassSession.find({})
    .populate('teacher', 'name email')
    .populate('student', 'name email')
    .sort({ startTime: 1 }); 
  res.status(200).json(classes);
});

// @desc    Update class time (Admin only)
const updateClass = asyncHandler(async (req, res) => {
  const { newStartTime } = req.body;
  const session = await ClassSession.findById(req.params.id)
    .populate('teacher', 'name whatsappGroupId')
    .populate('student', 'name');

  if (!session) {
    res.status(404);
    throw new Error('Class not found');
  }

  session.startTime = newStartTime;
  await session.save();

  // 🚀 TEACHER UPDATE ALERT: RESCHEDULED 🚀
  if (session.teacher && session.teacher.whatsappGroupId) {
    const message = `⚠️ *Schedule Update Alert*\n\nالسلام عليكم / Assalamu Alaikum *${session.teacher.name}*,\n\nThere has been a change to your schedule regarding your class with *${session.student.name}*.\n\n📌 *Update Type:* 🔄 Rescheduled\n🕒 *New Class Time:* ${new Date(newStartTime).toLocaleString()}\n\nPlease check your Teacher Dashboard for full details. \n*Learn With Ayman Admin Team*`;
    await whatsappClient.sendMessage(session.teacher.whatsappGroupId, message);
  }

  res.status(200).json(session);
});

// END A CLASS AND SAVE NOTES
const endClass = async (req, res) => {
  try {
    const { classId, notes, homework } = req.body;

    const session = await ClassSession.findById(classId)
      .populate('student', 'name whatsappGroupId');

    if (!session) {
      return res.status(404).json({ message: 'Class not found.' });
    }

    session.status = 'completed';
    session.notes = notes;
    session.homework = homework;
    await session.save();

    // 🚀 STUDENT ALERT: END CLASS REPORT 🚀
    if (session.student && session.student.whatsappGroupId) {
      const message = `السلام عليكم / Assalamu Alaikum! 🌟\n\nToday's lesson with *${session.student.name}* has been successfully completed. Here is a quick summary of what was covered:\n\n📌 *Class Notes:*\n${notes || 'No notes provided.'}\n\n📝 *Assigned Homework:*\n${homework || 'No homework assigned.'}\n\nIf you have any questions, please feel free to reach out. Have a wonderful day!\n\nWarm regards,\n*Learn With Ayman Support Team*`;
      await whatsappClient.sendMessage(session.student.whatsappGroupId, message);
    }

    res.status(200).json({ message: 'Class ended successfully!', updatedClass: session });

  } catch (error) {
    console.error('Error ending class:', error);
    res.status(500).json({ message: 'Server error while ending class.' });
  }
};

// --- NEW AUTOMATED ATTENDANCE FUNCTION ---
const markAttendance = async (req, res) => {
  try {
    const { classId, attendanceStatus } = req.body;

    const session = await ClassSession.findById(classId)
      .populate('student', 'name whatsappGroupId') 
      .populate('teacher', 'name');

    if (!session) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const studentGroupId = session.student.whatsappGroupId; 

    // 🚀 STUDENT ALERT: LATE OR ABSENT 🚀
    if (studentGroupId) {
      let message = '';

      if (attendanceStatus === 'Late') {
        message = `السلام عليكم / Assalamu Alaikum *${session.student.name}*, ✨\n\nJust a gentle reminder that our class is scheduled to begin right now. Your teacher, *${session.teacher.name}*, has opened the room and is waiting for you!\n\n🔗 *Join the class here:*\n${session.meetingLink || 'No link provided'}\n\nWe hope you have a wonderful class! 📚\n\nWarm regards,\n*Learn With Ayman Support Team*`;
      } 
      else if (attendanceStatus === 'Absent') {
        message = `السلام عليكم / Assalamu Alaikum *${session.student.name}*,\n\nWe hope everything is proceeding smoothly on your end and that you are safe and well. 🌿\n\nWe noticed that you haven't joined the meeting today. Since the 15-minute waiting period has passed, the teacher has now closed the meeting room. \n\n⚠️ *Please note: As per our attendance policy, this session is marked as absent and is not eligible for a makeup class.*\n\nWe look forward to seeing you at your next scheduled time, Insha'Allah! \n\nWarm regards,\n*Learn With Ayman Support Team*`;
      }

      await whatsappClient.sendMessage(studentGroupId, message);
    }

    res.status(200).json({ message: `Attendance marked as ${attendanceStatus} and message sent!`, session });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ message: 'Server error while marking attendance.' });
  }
};

const getCompletedClasses = async (req, res) => {
  try {
    const completedClasses = await ClassSession.find({
      $or: [{ teacher: req.user._id }, { student: req.user._id }],
      status: 'completed'
    }).sort({ startTime: -1 }); 
    res.status(200).json(completedClasses);
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching progress.' });
  }
};

const getTeacherEarnings = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const completedClasses = await ClassSession.find({
      teacher: req.user._id,
      status: 'completed',
      startTime: { $gte: startOfMonth, $lte: endOfMonth }
    });

    const totalMinutes = completedClasses.reduce((sum, cls) => sum + (cls.durationMinutes || 0), 0);
    const hourlyRate = req.user.hourlyRate || 3.0; 
    const totalHours = totalMinutes / 60;
    const currentEarnings = totalHours * hourlyRate;

    res.status(200).json({
      totalMinutes,
      totalHours: totalHours.toFixed(2),
      hourlyRate,
      currentEarnings: currentEarnings.toFixed(2) 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error calculating payroll.' });
  }
};

const getAdminPayrollReport = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const teachers = await User.find({ role: 'teacher' });

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
    res.status(500).json({ message: 'Server error generating payroll report.' });
  }
};

const addTeacherAdjustment = async (req, res) => {
  try {
    const { teacherId, amount, reason } = req.body;
    const teacher = await User.findById(teacherId);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    teacher.adjustments.push({ amount: Number(amount), reason: reason });
    await teacher.save();
    res.status(200).json({ message: 'Adjustment added successfully!', teacher });
  } catch (error) {
    res.status(500).json({ message: 'Server error adding adjustment.' });
  }
};

module.exports = {
  scheduleClass, getMyClasses, deleteClass, getAllClasses, updateClass,
  endClass, markAttendance, getCompletedClasses, getTeacherEarnings,
  getAdminPayrollReport, addTeacherAdjustment  
};