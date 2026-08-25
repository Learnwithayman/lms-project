const asyncHandler = require('express-async-handler');
const ClassSession = require('../models/ClassSession');
const User = require('../models/User');
const MessageLog = require('../models/MessageLog'); 
const whatsappClient = require('../utils/whatsappBot');
const { google } = require('googleapis');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// --- DELAY HELPER FOR RESENDING ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

// ==========================================
// ✨ MACRODROID LINK EXTRACTOR HELPER (HTML-PROOF) ✨
// Dynamically grabs Group Invite Codes directly from Google Calendar!
// ==========================================
const extractGroupCodes = async (classTitle) => {
  let codes = { teacher: null, student: null };
  if (!classTitle || classTitle === 'Google Calendar Lesson') return codes;
  
  try {
    const now = new Date();
    const past = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const future = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
    
    const response = await calendar.events.list({
      calendarId: 'admin@learnwithayman.com',
      timeMin: past.toISOString(),
      timeMax: future.toISOString(),
      q: classTitle, 
      singleEvents: true
    });
    
    const events = response.data.items || [];
    
    // Scan matching events for the Link Codes
    for (const event of events) {
      if (event.description && event.description.includes('GroupLink')) {
        
        // ✨ HTML-Proof Regex: Jumps over hidden Google Calendar <a href="..."> tags!
        const tMatch = event.description.match(/TeacherGroupLink[\s\S]*?chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);
        if (tMatch && tMatch[1] !== 'null') codes.teacher = tMatch[1].trim();
        
        const sMatch = event.description.match(/StudentGroupLink[\s\S]*?chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);
        if (sMatch && sMatch[1] !== 'null') codes.student = sMatch[1].trim();
        
        if (codes.teacher || codes.student) break; // Stop loop once found!
      }
    }
  } catch (error) {
    console.error('⚠️ Calendar Link Extraction Error:', error.message);
  }
  return codes;
};

// @desc    Schedule a new class
const scheduleClass = asyncHandler(async (req, res) => {
  const { teacherId, studentId, subject, startTime, durationMinutes, meetingLink, meetingId, passcode, teacherGroupName, studentGroupName } = req.body;

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
    teacherGroupName: teacherGroupName || '', 
    studentGroupName: studentGroupName || ''  
  });

  const teacher = await User.findById(teacherId);
  const student = await User.findById(studentId);
  
  if (teacher && teacher.whatsappGroupId) {
    const message = `⚠️ *Schedule Update Alert*\n\nالسلام عليكم / Assalamu Alaikum *${teacher.name}*,\n\nThere has been a change to your schedule regarding your class with *${student.name}*.\n\n📌 *Update Type:* 🔔 New Class Added\n🕒 *Class Time:* ${new Date(startTime).toLocaleString()}\n\nPlease check your Teacher Dashboard for full details. \n*Learn With Ayman Admin Team*`;
    
    const codes = await extractGroupCodes(subject);
    let targetPhone = codes.teacher || teacherGroupName || teacher.name;
    if (targetPhone && targetPhone.includes('@g.us')) targetPhone = teacher.name;

    await whatsappClient.sendMessage(targetPhone, message);
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
    
    const codes = await extractGroupCodes(session.subject);
    let targetPhone = codes.teacher || session.teacherGroupName || session.teacher.name;
    if (targetPhone && targetPhone.includes('@g.us')) targetPhone = session.teacher.name;

    await whatsappClient.sendMessage(targetPhone, message);
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
    
    const codes = await extractGroupCodes(session.subject);
    let targetPhone = codes.teacher || session.teacherGroupName || session.teacher.name;
    if (targetPhone && targetPhone.includes('@g.us')) targetPhone = session.teacher.name;

    await whatsappClient.sendMessage(targetPhone, message);
  }

  res.status(200).json(session);
});

// ✨ BULLETPROOF END CLASS INTERCEPTOR ✨
const endClass = async (req, res) => {
  try {
    const { classId, studentName, notes, classroomLink, whatsappGroupId, studentGroupId, durationMinutes, teacherGroupName, studentGroupName, title } = req.body;

    const teacher = await User.findById(req.user._id);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    let session;
    if (mongoose.Types.ObjectId.isValid(classId)) {
      session = await ClassSession.findById(classId);
    } 

    const subjectToSearch = session ? session.subject : (title || studentName);
    const codes = await extractGroupCodes(subjectToSearch);

    let messageText = `🎓 *Class Completed!*\n*Teacher:* ${teacher.name}\n*Student:* ${studentName || 'Student'}\n\n📝 *Class Notes:*\n${notes || 'No notes provided.'}\n\n📚 *Homework:*\nHomework has been assigned! Please check Google Classroom to view the requirements and upload the completed assignment:\n🔗 ${classroomLink || 'https://classroom.google.com'}`;

    try {
      let targetPhone = codes.student || studentGroupName || studentName || 'Student';
      if (targetPhone && targetPhone.includes('@g.us')) {
         targetPhone = studentName || 'Student'; 
      }

      if (targetPhone && targetPhone !== 'Student') {
        await whatsappClient.sendMessage(targetPhone, messageText);
        console.log(`✅ Post-class notes sent to code/name: ${targetPhone}`);
      }
    } catch (waError) {
      console.error('⚠️ WhatsApp failed to send (Connection Closed), but saving class anyway:', waError.message);
    }

    // 🔓 THE FIX: We capture the exact duration sent from your frontend!
    const finalDuration = durationMinutes ? Number(durationMinutes) : 60; 

    if (session) {
      session.status = 'completed';
      session.notes = notes;
      session.durationMinutes = finalDuration; // 🔓 Magic Line: Updates the database with the real time!
      await session.save();
    } else {
      const studentUser = await User.findOne({ whatsappGroupId: studentGroupId || whatsappGroupId });
      
      session = await ClassSession.create({
        teacher: req.user._id,
        student: studentUser ? studentUser._id : null, 
        subject: subjectToSearch || 'Google Calendar Lesson',
        startTime: new Date(),
        durationMinutes: finalDuration, // 🔓 Sets the real time on fallback creation
        status: 'completed',
        notes: notes,
        teacherGroupName: teacherGroupName || '', 
        studentGroupName: studentGroupName || ''  
      });
    }

    // SUBSCRIPTION ENGINE
    if (session && session.student) {
      const studentDoc = await User.findById(session.student);
      if (studentDoc && studentDoc.subscription && studentDoc.subscription.status === 'active') {
        studentDoc.subscription.classesUsed = (studentDoc.subscription.classesUsed || 0) + 1;
        if (studentDoc.subscription.classesUsed >= studentDoc.subscription.totalClassesBought && studentDoc.subscription.totalClassesBought > 0) {
          studentDoc.subscription.status = 'expired';
          console.log(`⚠️ ALERT: Student ${studentDoc.name}'s subscription has just expired!`);
        }
        await studentDoc.save();
      }
    }

    res.status(200).json({ message: 'Class ended successfully!', updatedClass: session });
  } catch (error) {
    console.error('🚨 Error ending class:', error);
    res.status(500).json({ message: 'Server error while ending class.' });
  }
};

// --- AUTOMATED ATTENDANCE FUNCTION (NOW WITH PAYROLL SUPPORT) ---
const markAttendance = async (req, res) => {
  try {
    const { classId, attendanceStatus, studentGroupId, studentGroupName, title, startTime, zoomLink, durationMinutes, teacherGroupName } = req.body;
    let session;
    let targetGroup = studentGroupName; 

    if (mongoose.Types.ObjectId.isValid(classId)) {
      session = await ClassSession.findById(classId)
        .populate('student', 'name whatsappGroupId') 
        .populate('teacher', 'name');
      if (!session) return res.status(404).json({ message: 'Class not found' });
      
      if (!targetGroup) targetGroup = session.studentGroupName || session.student?.name;
    } else {
      const studentUser = await User.findOne({ whatsappGroupId: studentGroupId });
      const teacherUser = await User.findById(req.user._id);
      session = {
        student: { name: studentUser ? studentUser.name : (title || 'Student'), _id: studentUser?._id },
        teacher: { name: teacherUser ? teacherUser.name : 'Teacher', _id: teacherUser?._id },
        meetingLink: zoomLink || '',
        subject: title || 'Google Calendar Lesson'
      };
      if (!targetGroup) targetGroup = session.student.name;
    }

    const subjectToSearch = session ? session.subject : title;
    const codes = await extractGroupCodes(subjectToSearch);

    targetGroup = codes.student || targetGroup;

    if (targetGroup && targetGroup.includes('@g.us')) {
        targetGroup = session.student?.name || title || 'Student';
    }

    if (targetGroup && targetGroup !== 'Student') {
      let message = '';
      if (attendanceStatus === 'Late') {
        message = `السلام عليكم / Assalamu Alaikum *${session.student.name}*, ✨\n\nJust a gentle reminder that our class is scheduled to begin right now. Your teacher, *${session.teacher.name}*, has opened the room and is waiting for you!\n\n🔗 *Join the class here:*\n${session.meetingLink || 'No link provided'}\n\nWe hope you have a wonderful class! 📚\n\nWarm regards,\n*Learn With Ayman Support Team*`;
      } else if (attendanceStatus === 'Absent') {
        message = `السلام عليكم / Assalamu Alaikum *${session.student.name}*,\n\nWe hope everything is proceeding smoothly on your end and that you are safe and well. 🌿\n\nWe noticed that you haven't joined the meeting today. Since the 15-minute waiting period has passed, the teacher has now closed the meeting room. \n\n⚠️ *Please note: As per our attendance policy, this session is marked as absent and is not eligible for a makeup class.*\n\nWe look forward to seeing you at your next scheduled time, Insha'Allah! \n\nWarm regards,\n*Learn With Ayman Support Team*`;
      }
      
      await whatsappClient.sendMessage(targetGroup, message);
    }

    // SUBSCRIPTION & PAYROLL ENGINE (Unchanged)
    if (attendanceStatus === 'Absent' && session.student && session.student._id) {
      const studentDoc = await User.findById(session.student._id);
      if (studentDoc && studentDoc.subscription && studentDoc.subscription.status === 'active') {
        studentDoc.subscription.classesUsed = (studentDoc.subscription.classesUsed || 0) + 1;
        if (studentDoc.subscription.classesUsed >= studentDoc.subscription.totalClassesBought && studentDoc.subscription.totalClassesBought > 0) {
          studentDoc.subscription.status = 'expired';
          console.log(`⚠️ ALERT: Student ${studentDoc.name}'s subscription has just expired due to absence!`);
        }
        await studentDoc.save();
      }
    }

    if (attendanceStatus === 'Absent') {
      const finalDuration = durationMinutes ? Number(durationMinutes) : 60;
      if (mongoose.Types.ObjectId.isValid(classId) && session.save) {
        session.status = 'completed'; 
        session.notes = 'Student marked Absent. Class fully counted for teacher payroll.';
        if (!session.durationMinutes) session.durationMinutes = finalDuration;
        await session.save();
      } else {
        await ClassSession.create({
          teacher: req.user._id,
          student: session.student?._id || null,
          subject: session.subject,
          startTime: startTime || new Date(),
          durationMinutes: finalDuration,
          status: 'completed', 
          notes: 'Student marked Absent. Class fully counted for teacher payroll.',
          teacherGroupName: teacherGroupName || '',
          studentGroupName: studentGroupName || ''
        });
      }
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

    const teachers = await User.find({ role: { $regex: /teacher/i } });

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

const getTeacherSchedule = async (req, res) => {
  try {
    const targetUserId = req.user?.id || req.user?._id;
    const databaseUser = await User.findById(targetUserId);
    
    if (!databaseUser) return res.status(404).json({ message: 'Teacher profile not found' });

    const teacherGroupId = databaseUser.whatsappGroupId || databaseUser.teacherGroupId || databaseUser.groupId || databaseUser.whatsappGroup;

    if (!teacherGroupId) return res.status(200).json([]); 

    const myCalendarId = 'admin@learnwithayman.com'; 
    const now = new Date();
    const tenHoursAgo = new Date(now.getTime() - (10 * 60 * 60 * 1000));
    const nextWeek = new Date();
    nextWeek.setDate(now.getDate() + 7);

    const response = await calendar.events.list({
      calendarId: myCalendarId,
      timeMin: tenHoursAgo.toISOString(), 
      timeMax: nextWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    let processedClasses = events.map(event => {
      const start = event.start.dateTime || event.start.date;
      const end = event.end?.dateTime || event.end?.date; 
      const description = event.description || "";
      
      const teacherMatch = description.match(/TeacherGroupID[\s*:-]*([0-9]+@g\.us)/i) || description.match(/(?:teachergroup|teacher id|group id|id)[\s*:-]*([0-9]+@g\.us)/i) || description.match(/TeacherGroup[^\d]*([0-9]+@g\.us)/i);
      const extractedTeacherId = teacherMatch ? teacherMatch[1] : null;

      const studentMatch = description.match(/StudentGroupID[\s*:-]*([0-9]+@g\.us)/i) || description.match(/(?:studentgroup|student id|id)[\s*:-]*([0-9]+@g\.us)/i) || description.match(/StudentGroup[^\d]*([0-9]+@g\.us)/i);
      const studentGroupId = studentMatch ? studentMatch[1] : null;

      const studentNameMatch = description.match(/StudentGroupName[\s*:-]*([^\n<]+)/i);
      const studentGroupName = studentNameMatch ? studentNameMatch[1].trim() : null;

      const zoomMatch = description.match(/(https:\/\/[^\s<"]*zoom\.us[^\s<"]*)/i);
      const zoomLink = zoomMatch ? zoomMatch[1] : null;

      const classroomMatch = description.match(/(?:classroom|link|classwork)[\s*:-]*(https?:\/\/[^\s<"]+)/i) || description.match(/(https:\/\/classroom\.google\.com[^\s<"]*)/i);
      const classroomLink = classroomMatch ? (classroomMatch[1] || classroomMatch[2]) : null;

      return {
        id: event.id,
        title: event.summary,
        startTime: new Date(start),
        endTime: new Date(end), 
        teacherGroupId: extractedTeacherId,
        studentGroupId: studentGroupId,
        studentGroupName: studentGroupName, 
        zoomLink: zoomLink,
        classroomLink: classroomLink 
      };
    });

    const teacherSpecificClasses = processedClasses.filter(
      (cls) => cls.teacherGroupId === teacherGroupId
    );

    const twelveHoursAgo = new Date(now.getTime() - (12 * 60 * 60 * 1000));
    const recentlyCompletedDB = await ClassSession.find({
      teacher: databaseUser._id,
      status: 'completed',
      startTime: { $gte: twelveHoursAgo } 
    });

    const finalSchedule = teacherSpecificClasses.filter(gcalClass => {
      if (gcalClass.startTime > now) return true;

      const alreadyDone = recentlyCompletedDB.some(dbClass => {
        return (
          (dbClass.studentGroupName && gcalClass.studentGroupName && dbClass.studentGroupName === gcalClass.studentGroupName) || 
          (dbClass.subject && dbClass.subject === gcalClass.title)
        );
      });

      return !alreadyDone; 
    });

    res.status(200).json(finalSchedule);
  } catch (error) {
    console.error('❌ Error fetching Teacher Schedule:', error.message);
    res.status(500).json({ message: 'Server error while fetching schedule' });
  }
};

// ==========================================
// 📡 ADMIN COMMAND CENTER LOGIC
// ==========================================

const getAdminLiveMonitor = async (req, res) => {
  try {
    const teachers = await User.find({ role: { $regex: /teacher/i } });
    const now = new Date();
    const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    const tomorrow = new Date(now.getTime() + (24 * 60 * 60 * 1000));

    const response = await calendar.events.list({
      calendarId: 'admin@learnwithayman.com',
      timeMin: yesterday.toISOString(),
      timeMax: tomorrow.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    const events = response.data.items || [];
    const processedClasses = events.map(event => {
      const description = event.description || "";
      const teacherMatch = description.match(/TeacherGroupID[\s*:-]*([0-9]+@g\.us)/i) || description.match(/(?:teachergroup|teacher id|group id|id)[\s*:-]*([0-9]+@g\.us)/i) || description.match(/TeacherGroup[^\d]*([0-9]+@g\.us)/i);
      const studentNameMatch = description.match(/StudentGroupName[\s*:-]*([^\n<]+)/i);
      const zoomMatch = description.match(/(https:\/\/[^\s<"]*zoom\.us[^\s<"]*)/i);
      
      return {
        id: event.id,
        title: event.summary,
        startTime: new Date(event.start.dateTime || event.start.date),
        teacherGroupId: teacherMatch ? teacherMatch[1] : null,
        studentGroupName: studentNameMatch ? studentNameMatch[1].trim() : null,
        zoomLink: zoomMatch ? zoomMatch[1] : null,
      };
    });

    const dbClasses = await ClassSession.find({
      status: { $in: ['completed', 'started', 'in-progress', 'cancelled'] }, 
      startTime: { $gte: yesterday }
    }).populate('teacher', 'name');

    const liveMonitorData = teachers.map(teacher => {
      const teacherId = teacher.whatsappGroupId || teacher.teacherGroupId || teacher.groupId;
      const teacherGcal = processedClasses.filter(cls => cls.teacherGroupId === teacherId);
      const teacherDbClasses = dbClasses.filter(dbCls => dbCls.teacher && dbCls.teacher._id.toString() === teacher._id.toString());

      const teacherCompleted = teacherDbClasses.filter(cls => cls.status === 'completed');
      const teacherLive = teacherDbClasses.filter(cls => cls.status === 'started' || cls.status === 'in-progress');

      const upcoming = teacherGcal.filter(gcalClass => {
        const isInDb = teacherDbClasses.some(dbClass => 
          (dbClass.studentGroupName && gcalClass.studentGroupName && dbClass.studentGroupName === gcalClass.studentGroupName) || 
          (dbClass.subject === gcalClass.title)
        );
        return !isInDb;
      });

      return {
        teacherName: teacher.name,
        upcoming: upcoming,
        live: teacherLive, 
        completed: teacherCompleted
      };
    }).filter(group => group.upcoming.length > 0 || group.completed.length > 0 || group.live.length > 0); 

    res.status(200).json(liveMonitorData);
  } catch (error) {
    console.error('Error fetching Live Monitor:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// 2. Resend 1-Hour Reminder
const resendReminder = async (req, res) => {
  try {
    const { classData } = req.body;
    const timeString = new Date(classData.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: "Africa/Cairo" });

    // ✨ MACRODROID LINK ENGINE
    const codes = await extractGroupCodes(classData.title);
    
    let teacherSearchTerm = codes.teacher || (classData.teacherGroupId ? classData.teacherGroupId.trim() : null);
    let studentSearchTerm = codes.student || (classData.studentGroupName ? classData.studentGroupName.trim() : null);

    if (teacherSearchTerm && teacherSearchTerm.includes('@g.us')) teacherSearchTerm = null;
    if (studentSearchTerm && studentSearchTerm.includes('@g.us')) studentSearchTerm = null;

    if (teacherSearchTerm) {
      const teacherMessage = `🔔 *Manual Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour class *${classData.title}* is coming up!\n\n🕒 *Time:* ${timeString}\n\n🔗 *Teacher Dashboard:*\nhttps://lms.learnwithayman.com\n\n*Learn With Ayman Admin Team*`;
      await whatsappClient.sendMessage(teacherSearchTerm, teacherMessage);
      
      await delay(15000); 
    }

    if (studentSearchTerm) {
      const studentMessage = `🔔 *Manual Reminder*\n\nالسلام عليكم / Assalamu Alaikum,\n\nGet ready! Your class *${classData.title}* is coming up!\n\n🔗 *Join Here:*\n${classData.zoomLink || 'No link provided'}\n\n*Learn With Ayman Admin Team*`;
      await whatsappClient.sendMessage(studentSearchTerm, studentMessage);
    }

    res.status(200).json({ message: 'Reminders resent successfully!' });
  } catch (error) {
    console.error('Error resending reminder:', error);
    res.status(500).json({ message: 'Failed to resend reminder' });
  }
};

// 3. Resend Post-Class Notes
const resendNotes = async (req, res) => {
  try {
    const { classId } = req.body;
    // ✨ FIX: Added .populate('student', 'name') here so we can grab the real name!
    const session = await ClassSession.findById(classId).populate('teacher', 'name').populate('student', 'name');
    
    if (!session) return res.status(404).json({ message: 'Class not found' });

    // ✨ MACRODROID LINK EXTRACTION ENGINE ✨
    const codes = await extractGroupCodes(session.subject);
    
    let targetPhone = codes.student || session.studentGroupName || session.subject || 'Student';
    
    if (targetPhone && targetPhone.includes('@g.us')) {
        targetPhone = session.subject || 'Student';
    }

    // ✨ FIX: Separate the display name from the invite code!
    const displayStudentName = session.student?.name || session.studentGroupName || session.subject || 'Student';

    let messageText = `🎓 *Class Completed! (Resent)*\n*Teacher:* ${session.teacher?.name || 'Teacher'}\n*Student:* ${displayStudentName}\n\n📝 *Class Notes:*\n${session.notes || 'No notes provided.'}\n\n📚 *Homework:*\nHomework has been assigned! Please check Google Classroom to view the requirements and upload the completed assignment:\n🔗 https://classroom.google.com`;

    if (targetPhone && targetPhone !== 'Student') {
      console.log(`📡 Triggering MacroDroid to resend notes to code/name: ${targetPhone}`);
      await whatsappClient.sendMessage(targetPhone, messageText);
    } else {
      console.log(`⚠️ Skipped resending notes: Could not find a valid student link for this class.`);
    }

    res.status(200).json({ message: 'Notes resent successfully!' });
  } catch (error) {
    console.error('Error resending notes:', error);
    res.status(500).json({ message: 'Failed to resend notes' });
  }
};

const joinClass = async (req, res) => {
  try {
    const { title, studentGroupName, startTime } = req.body;
    
    await ClassSession.create({
      teacher: req.user._id,
      subject: title,
      studentGroupName: studentGroupName,
      startTime: startTime || new Date(),
      status: 'started' 
    });

    res.status(200).json({ message: 'Class marked as started!' });
  } catch (error) {
    console.error('Error marking class as joined:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const grantMakeupCredit = async (req, res) => {
  try {
    const { studentId, reason, originalDate } = req.body;
    const student = await User.findById(studentId);
    
    if (!student) return res.status(404).json({ message: 'Student not found' });
    
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 90);
    
    student.makeupBank.push({
      originalClassDate: originalDate || new Date(),
      expirationDate: expDate,
      reason: reason || 'Admin Granted Makeup Credit',
      isUsed: false
    });
    
    await student.save();
    res.status(200).json({ message: 'Makeup credit granted successfully! Valid for 90 days.', student });
  } catch (error) {
    console.error('Error granting makeup credit:', error);
    res.status(500).json({ message: 'Server error granting makeup credit' });
  }
};

const cancelUpcomingClass = async (req, res) => {
  try {
    const { title, studentGroupName, teacherGroupName, startTime, canceledBy } = req.body;

    // 1. Log the canceled class
    await ClassSession.create({
      subject: title || 'Google Calendar Lesson',
      studentGroupName: studentGroupName || '',
      teacherGroupName: teacherGroupName || '',
      startTime: startTime || new Date(),
      status: 'cancelled' 
    });

    // ✨ 2. THE NEW 90-DAY MAKEUP ENGINE AUTO-TRIGGER
    // If the Teacher or Admin cancels, automatically find the student and issue a 90-day credit
    if (canceledBy === 'teacher' || canceledBy === 'admin') {
      // Find student by their group ID (since that's what frontend sends)
      const student = await User.findOne({ 
        $or: [
          { whatsappGroupId: studentGroupName }, 
          { studentGroupId: studentGroupName }
        ] 
      });

      if (student) {
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 90); // Exact 90-day expiration
        
        student.makeupBank.push({
          originalClassDate: startTime || new Date(),
          expirationDate: expDate,
          reason: `Auto-Credit: Canceled by ${canceledBy}`,
          isUsed: false
        });
        await student.save();
        console.log(`✅ 90-Day Makeup Credit automatically issued to ${student.name}`);
      }
    }

    // 3. MACRODROID LINK ENGINE (Notifications)
    const codes = await extractGroupCodes(title);

    let teacherSearchTerm = codes.teacher || (teacherGroupName ? teacherGroupName.trim() : null);
    if (teacherSearchTerm && teacherSearchTerm.includes('@g.us')) teacherSearchTerm = null;
    
    if (teacherSearchTerm) {
      const teacherMessage = `⚠️ *Class Canceled Alert*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour upcoming class *${title}* has been canceled by the Admin.\n\nPlease check your dashboard for updates. \n*Learn With Ayman Admin Team*`;
      await whatsappClient.sendMessage(teacherSearchTerm, teacherMessage);
    }

    let studentSearchTerm = codes.student || (studentGroupName ? studentGroupName.trim() : null);
    if (studentSearchTerm && studentSearchTerm.includes('@g.us')) studentSearchTerm = null;
    
    if (studentSearchTerm) {
      const studentMessage = `⚠️ *Class Canceled Alert*\n\nالسلام عليكم / Assalamu Alaikum,\n\nYour upcoming class *${title}* has been canceled. A makeup credit has been applied to your account if applicable.\n\n*Learn With Ayman Admin Team*`;
      await whatsappClient.sendMessage(studentSearchTerm, studentMessage);
    }

    res.status(200).json({ message: 'Class officially canceled, notifications sent, and makeup logic applied!' });
  } catch (error) {
    console.error('Error canceling class:', error);
    res.status(500).json({ message: 'Server error while canceling class.' });
  }
};

const getMessageLogs = async (req, res) => {
  try {
    const yesterday = new Date(new Date().getTime() - (24 * 60 * 60 * 1000));
    const logs = await MessageLog.find({ createdAt: { $gte: yesterday } })
      .sort({ createdAt: -1 }); 
    res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching message logs:', error);
    res.status(500).json({ message: 'Server error while fetching logs.' });
  }
};

// 🛑 FORCE END CLASS (Admin Superpower)
const adminForceEndClass = async (req, res) => {
  try {
    const { classId } = req.body;
    const session = await ClassSession.findById(classId);
    
    if (!session) {
      return res.status(404).json({ message: 'Class session not found.' });
    }

    session.status = 'completed';
    session.notes = 'System Note: Class forcefully ended by Admin to clear dashboard.';
    
    // Fallback duration if it somehow missed it
    if (!session.durationMinutes) {
      session.durationMinutes = 60;
    }

    await session.save();
    res.status(200).json({ message: 'Class forcefully ended by Admin.' });
  } catch (error) {
    console.error('Error force ending class:', error);
    res.status(500).json({ message: 'Server error while force ending class.' });
  }
};

module.exports = {
  scheduleClass, getMyClasses, deleteClass, getAllClasses, updateClass,
  endClass, markAttendance, getCompletedClasses, getTeacherEarnings,
  getAdminPayrollReport, addTeacherAdjustment, getTeacherSchedule,
  getAdminLiveMonitor, resendReminder, resendNotes, joinClass,
  grantMakeupCredit, cancelUpcomingClass, getMessageLogs, adminForceEndClass
};