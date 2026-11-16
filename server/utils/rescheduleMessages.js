// 🔁 STEP 7 messages (approved 16 Nov). Every student message ends with the login details.
const { loginBlock } = require('./studentLogin');

const SIGN = '*Learn With Ayman Admin Team* 💚';
const hi = (student) => `السلام عليكم / Assalamu Alaikum *${student.name}* 🌿`;

// 1. Postponed → choose a new time
const studentPostponed = (student, oldTime) =>
  `${hi(student)}\n\nYour class on *${oldTime}* has been postponed.\n📅 Please log in and choose a new time that suits you:\n${loginBlock(student)}\n${SIGN}`;

// 2. Teacher schedule updated → choose a time
const studentScheduleUpdated = (student) =>
  `${hi(student)}\n\nYour teacher's schedule is now updated ✅\n📅 Please log in to your dashboard and choose the best time for your class:\n${loginBlock(student)}\n${SIGN}`;

// 3. Makeup booked
const studentMakeupBooked = (student, newTime, teacherName) =>
  `${hi(student)}\n\n✅ Your makeup class is booked!\n🗓️ *${newTime}* with *${teacherName}*\n\nSee you then, Insha'Allah! 📚\n\n${loginBlock(student)}\n${SIGN}`;

// 4. Class moved by the admin (new time and / or new teacher)
const studentMoved = (student, oldTime, newTime, newTeacherName) =>
  `${hi(student)}\n\n🔁 Your class on *${oldTime}* has been moved to *${newTime}*${newTeacherName ? ` with *${newTeacherName}*` : ''}.\n\n${loginBlock(student)}\n${SIGN}`;

// 5. Class cancelled (with or without a makeup credit)
const studentCancelled = (student, time, withCredit) =>
  `${hi(student)}\n\n⚠️ Your class on *${time}* has been cancelled.\n${withCredit
    ? '🎒 A makeup credit has been added. You can book your makeup class from your dashboard.'
    : 'As per our policy, this class is counted from your package.'}\n\n${loginBlock(student)}\n${SIGN}`;

// 6. Credit expires in 7 days
const studentCreditExpiring = (student, date) =>
  `${hi(student)}\n\n⏳ Your makeup credit expires on *${date}*.\nPlease book your makeup class from your dashboard before then:\n${loginBlock(student)}\n${SIGN}`;

// 7. Teacher: please update your schedule now
const teacherUpdateNow = (teacher, studentName, oldTime) =>
  `السلام عليكم ${teacher.name},\n\n🔁 *${studentName}* postponed the class on *${oldTime}*.\nPlease update your free hours now in *🗓️ My Schedule* and press *✅ Schedule updated*, so the student can book a new time.`;

// 8. Teacher: a new class was booked (or assigned by the admin)
const teacherBooked = (teacher, studentName, newTime, { makeup = false, oldTime = null, byAdmin = false } = {}) =>
  `السلام عليكم ${teacher.name},\n\n✅ *${studentName}* ${byAdmin ? 'has a class assigned to you by the admin' : `booked a${makeup ? ' makeup' : ''} class`}:\n🗓️ *${newTime} Cairo*${oldTime ? `\n(Postponed from *${oldTime} Cairo*)` : ''}`;

// 9. Teacher: class moved / moved to another teacher / cancelled / postponed by the admin
const teacherChanged = (teacher, studentName, oldTime, change) =>
  `السلام عليكم ${teacher.name},\n\n🔁 Your class with *${studentName}* on *${oldTime} Cairo* has been ${change}.`;

// 10. Monday schedule check
const teacherMondayCheck = (teacher) =>
  `السلام عليكم ${teacher.name},\n\n🗓️ *Weekly schedule check*\nPlease review your free hours for this week in *🗓️ My Schedule* and press *✅ My hours are correct*.\n\nJazakum Allahu khairan 🌿`;

// 11. Admin: no free times in the next 14 days
const adminNoFreeTimes = (studentName, teacherName) =>
  `السلام عليكم\n\n⚠️ *No free times for a makeup*\n👤 *${studentName}* needs a new time with *${teacherName}*, but there are no free times in the next 14 days.`;

module.exports = {
  studentPostponed, studentScheduleUpdated, studentMakeupBooked, studentMoved, studentCancelled, studentCreditExpiring,
  teacherUpdateNow, teacherBooked, teacherChanged, teacherMondayCheck, adminNoFreeTimes
};
