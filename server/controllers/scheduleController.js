const asyncHandler = require('express-async-handler');
const ClassSession = require('../models/ClassSession');
const User = require('../models/User');
const whatsappClient = require('../utils/whatsappBot');
const { google } = require('googleapis');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// --- SMART PATH ROUTING FOR GOOGLE AUTH ---
let CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json'); 
if (!fs.existsSync(CREDENTIALS_PATH)) {
  CREDENTIALS_PATH = path.join(__dirname, '..', '..', 'credentials.json'); 
}
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS_PATH,
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});
const calendar = google.calendar({ version: 'v3', auth });

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

  const teacher = await User.findById(teacherId);
  const student = await User.findById(studentId);
  
  if (teacher && teacher.whatsappGroupId) {
    const message = `⚠️ *Schedule Update Alert*\n\nالسلام عليكم / Assalamu Alaikum *${teacher.name}*,\n\nThere has been a change to your schedule regarding your class with *${student.name}*.\n\n📌 *Update Type:* 🔔 New Class Added\n🕒 *Class Time:* ${new Date(startTime).toLocaleString()}\n\nPlease check your Teacher Dashboard for full details. \n*Learn With Ayman Admin Team*`;
    await whatsappClient.sendLmsNotification(teacher.whatsappGroupId, message);
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

  if (session.teacher && session.teacher.whatsappGroupId) {
    const message = `⚠️ *Schedule Update Alert*\n\nالسلام عليكم / Assalamu Alaikum *${session.teacher.name}*,\n\nThere has been a change to your schedule regarding your class with *${session.student.name}*.\n\n📌 *Update Type:* ❌ Canceled\n\nThis class has been removed from your schedule.\n\nPlease check your Teacher Dashboard for full details. \n*Learn With Ayman Admin Team*`;
    await whatsappClient.sendLmsNotification(session.teacher.whatsappGroupId, message);
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

  if (session.teacher && session.teacher.whatsappGroupId) {
    const message = `⚠️ *Schedule Update Alert*\n\nالسلام عليكم / Assalamu Alaikum *${session.teacher.name}*,\n\nThere has been a change to your schedule regarding your class with *${session.student.name}*.\n\n📌 *Update Type:* 🔄 Rescheduled\n🕒 *New Class Time:* ${new Date(newStartTime).toLocaleString()}\n\nPlease check your Teacher Dashboard for full details. \n*Learn With Ayman Admin Team*`;
    await whatsappClient.sendLmsNotification(session.teacher.whatsappGroupId, message);
  }

  res.status(200).json(session);
});

// ✨ BULLETPROOF END CLASS INTERCEPTOR ✨
const endClass = async (req, res) => {
  try {
    const { classId, studentName, notes, classroomLink, whatsappGroupId, studentGroupId } = req.body;
    const targetGroupId = studentGroupId || whatsappGroupId; 

    const teacher = await User.findById(req.user._id);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    let messageText = `🎓 *Class Completed!*\n*Teacher:* ${teacher.name}\n*Student:* ${studentName || 'Student'}\n\n📝 *Class Notes:*\n${notes || 'No notes provided.'}\n\n📚 *Homework:*\nHomework has been assigned! Please check Google Classroom to view the requirements and upload the completed assignment:\n🔗 ${classroomLink || 'https://classroom.google.com'}`;

    // 🛡️ THE WHATSAPP SAFETY NET
    try {
      if (targetGroupId) {
        await whatsappClient.sendLmsNotification(targetGroupId, messageText);
        console.log(`✅ Post-class notes sent to ${targetGroupId}`);
      }
    } catch (waError) {
      console.error('⚠️ WhatsApp failed to send (Connection Closed), but saving class anyway:', waError.message);
    }

    let session;
    
    if (mongoose.Types.ObjectId.isValid(classId)) {
      session = await ClassSession.findById(classId);
      if (session) {
        session.status = 'completed';
        session.notes = notes;
        await session.save();
      }
    } 
    
    // Google Calendar Class - Saves perfectly now because student is required: false!
    if (!session) {
      const studentUser = await User.findOne({ whatsappGroupId: targetGroupId });
      
      session = await ClassSession.create({
        teacher: req.user._id,
        student: studentUser ? studentUser._id : null, 
        subject: studentName || 'Google Calendar Lesson',
        startTime: new Date(),
        durationMinutes: 60, 
        status: 'completed',
        notes: notes
      });
    }

    res.status(200).json({ message: 'Class ended successfully!', updatedClass: session });
  } catch (error) {
    console.error('🚨 Error ending class:', error);
    res.status(500).json({ message: 'Server error while ending class.' });
  }
};

// --- AUTOMATED ATTENDANCE FUNCTION ---
const markAttendance = async (req, res) => {
  try {
    const { classId, attendanceStatus, studentGroupId, title, startTime, zoomLink } = req.body;
    let session;
    let targetGroup = studentGroupId;

    if (mongoose.Types.ObjectId.isValid(classId)) {
      session = await ClassSession.findById(classId)
        .populate('student', 'name whatsappGroupId') 
        .populate('teacher', 'name');
      if (!session) return res.status(404).json({ message: 'Class not found' });
      targetGroup = session.student?.whatsappGroupId;
    } else {
      const studentUser = await User.findOne({ whatsappGroupId: studentGroupId });
      const teacherUser = await User.findById(req.user._id);
      session = {
        student: { name: studentUser ? studentUser.name : 'Student' },
        teacher: { name: teacherUser ? teacherUser.name : 'Teacher' },
        meetingLink: zoomLink || ''
      };
    }

    if (targetGroup) {
      let message = '';
      if (attendanceStatus === 'Late') {
        message = `السلام عليكم / Assalamu Alaikum *${session.student.name}*, ✨\n\nJust a gentle reminder that our class is scheduled to begin right now. Your teacher, *${session.teacher.name}*, has opened the room and is waiting for you!\n\n🔗 *Join the class here:*\n${session.meetingLink || 'No link provided'}\n\nWe hope you have a wonderful class! 📚\n\nWarm regards,\n*Learn With Ayman Support Team*`;
      } else if (attendanceStatus === 'Absent') {
        message = `السلام عليكم / Assalamu Alaikum *${session.student.name}*,\n\nWe hope everything is proceeding smoothly on your end and that you are safe and well. 🌿\n\nWe noticed that you haven't joined the meeting today. Since the 15-minute waiting period has passed, the teacher has now closed the meeting room. \n\n⚠️ *Please note: As per our attendance policy, this session is marked as absent and is not eligible for a makeup class.*\n\nWe look forward to seeing you at your next scheduled time, Insha'Allah! \n\nWarm regards,\n*Learn With Ayman Support Team*`;
      }
      await whatsappClient.sendLmsNotification(targetGroup, message);
    }

    res.status(200).json({ message: `Attendance marked as ${attendanceStatus} and message sent!` });
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

    const completedClasses = await ClassSession.find({
      teacher: req.user._id,
      status: 'completed',
      startTime: { $gte: startOfMonth }
    });

    const totalMinutes = completedClasses.reduce((sum, cls) => sum + (cls.durationMinutes || 0), 0);
    const hourlyRate = req.user.hourlyRate || 4.0; 
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

    // 🔥 THE FIX: Use Regex to find "teacher", "Teacher", or "TEACHER" regardless of case!
    const teachers = await User.find({ role: { $regex: /^teacher$/i } });

    const payrollReport = await Promise.all(teachers.map(async (teacher) => {
      const completedClasses = await ClassSession.find({
        teacher: teacher._id,
        status: 'completed',
        startTime: { $gte: startOfMonth, $lte: endOfMonth }
      });

      const totalMinutes = completedClasses.reduce((sum, cls) => sum + (cls.durationMinutes || 0), 0);
      const hourlyRate = teacher.hourlyRate || 3.0; // Default rate fallback
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
    console.error('Server error generating payroll report:', error);
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

// --- THE GOOGLE CALENDAR DASHBOARD ENGINE ---
const getTeacherSchedule = async (req, res) => {
  try {
    const targetUserId = req.user?.id || req.user?._id;
    const databaseUser = await User.findById(targetUserId);
    
    if (!databaseUser) {
      return res.status(404).json({ message: 'Teacher profile not found' });
    }

    const teacherGroupId = databaseUser.whatsappGroupId || 
                           databaseUser.teacherGroupId || 
                           databaseUser.groupId || 
                           databaseUser.whatsappGroup;

    console.log(`📡 Fetching Google Calendar for Teacher: ${databaseUser.name}`);

    if (!teacherGroupId) {
      return res.status(200).json([]); 
    }

    const myCalendarId = 'admin@learnwithayman.com'; 
    
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);

    const response = await calendar.events.list({
      calendarId: myCalendarId,
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    let processedClasses = events.map(event => {
      const start = event.start.dateTime || event.start.date;
      const description = event.description || "";
      
      // 🛠️ SMART DETECTOR: Teacher ID
      const teacherMatch = description.match(/(?:teachergroup|teacher id|group id|id)[\s*:-]*([0-9]+@g\.us)/i) || description.match(/TeacherGroup[^\d]*([0-9]+@g\.us)/i);
      const extractedTeacherId = teacherMatch ? teacherMatch[1] : null;

      // 🛠️ SMART DETECTOR: Student ID
      const studentMatch = description.match(/(?:studentgroup|student id|id)[\s*:-]*([0-9]+@g\.us)/i) || description.match(/StudentGroup[^\d]*([0-9]+@g\.us)/i);
      const studentGroupId = studentMatch ? studentMatch[1] : null;

      // 🛠️ SMART DETECTOR: Zoom Link
      const zoomMatch = description.match(/(https:\/\/[^\s<"]*zoom\.us[^\s<"]*)/i);
      const zoomLink = zoomMatch ? zoomMatch[1] : null;

      // 🛠️ SMART DETECTOR: Google Classroom Link
      const classroomMatch = description.match(/(?:classroom|link|classwork)[\s*:-]*(https?:\/\/[^\s<"]+)/i) || description.match(/(https:\/\/classroom\.google\.com[^\s<"]*)/i);
      const classroomLink = classroomMatch ? (classroomMatch[1] || classroomMatch[2]) : null;

      return {
        id: event.id,
        title: event.summary,
        startTime: new Date(start),
        teacherGroupId: extractedTeacherId,
        studentGroupId: studentGroupId,
        zoomLink: zoomLink,
        classroomLink: classroomLink // <--- Sent to frontend!
      };
    });

    const teacherSpecificClasses = processedClasses.filter(
      (cls) => cls.teacherGroupId === teacherGroupId
    );

    res.status(200).json(teacherSpecificClasses);
  } catch (error) {
    console.error('❌ Error fetching Teacher Schedule:', error.message);
    res.status(500).json({ message: 'Server error while fetching schedule' });
  }
};

module.exports = {
  scheduleClass, getMyClasses, deleteClass, getAllClasses, updateClass,
  endClass, markAttendance, getCompletedClasses, getTeacherEarnings,
  getAdminPayrollReport, addTeacherAdjustment, getTeacherSchedule 
};