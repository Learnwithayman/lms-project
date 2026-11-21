const User = require('../models/User');
const ClassSession = require('../models/ClassSession');
const ClassChange = require('../models/ClassChange');
const { sendMessage } = require('../utils/whatsappBot');
const A = require('../utils/availability');
const M = require('../utils/rescheduleMessages');
const { parseEventStudent, eventTeacherCodes, eventGroupLinks, classBelongsToStudent, classBelongsToTeacher } = require('../utils/classMatch');

// ==========================================
// 🔁 STEP 7: POSTPONE, MAKEUP BOOKING, ADMIN POSTPONE / CANCEL, TEACHER "MY SCHEDULE"
// ==========================================

const ADMIN_GROUP_TARGET = process.env.ADMIN_WHATSAPP_NUMBER || 'https://chat.whatsapp.com/BYFE1IPRs2KGJNhGaxvpJd';
const CREDIT_DAYS = 90;

// Errors always come back as JSON { message } so the pages can show them
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (res.headersSent) return;
    if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
    console.error('🔁 Reschedule error:', error);
    res.status(500).json({ message: 'Server error. Please try again or contact the admin.' });
  }
};

const send = async (target, text) => {
  const to = (target || '').trim();
  if (!to) return false;
  try {
    await sendMessage(to, text);
    return true;
  } catch (error) {
    console.error('WhatsApp send failed:', error.message);
    return false;
  }
};
// 🔗 Group fix: send to the invite link written in the Google Calendar class first (like the older messages),
// then to the link saved in the LMS
const toStudent = (student, text, ev) => {
  const fromClass = ev && ev.description ? eventGroupLinks(ev).student : null;
  return send(fromClass || (student && student.studentGroupId), text);
};
const toTeacher = (teacher, text, ev) => {
  const fromClass = ev && ev.description && classBelongsToTeacher(eventTeacherCodes(ev), teacher) ? eventGroupLinks(ev).teacher : null;
  return send(fromClass || (teacher && teacher.teacherGroupId), text);
};

const studentTz = (ev) => (ev && ev.start && ev.start.timeZone) || A.STUDENT_TZ;
const cairo = (date) => A.fmtTime(date, A.CAIRO_TZ);

const activeCredits = (student, now = new Date()) =>
  (student.makeupBank || []).filter((c) => !c.isUsed && new Date(c.expirationDate) > now);

const addCredit = (student, { source, teacher, ev, reason, waiting = false }) => {
  const expirationDate = new Date(Date.now() + CREDIT_DAYS * A.DAY);
  student.makeupBank.push({
    originalClassDate: ev ? A.eventStart(ev) : new Date(),
    expirationDate,
    reason,
    isUsed: false,
    source,
    teacher: teacher ? teacher._id : undefined,
    teacherName: teacher ? teacher.name : undefined,
    durationMinutes: ev ? A.eventMinutes(ev) : 60,
    template: ev ? A.templateOf(ev) : undefined,
    waitingTeacherUpdate: waiting
  });
  return student.makeupBank[student.makeupBank.length - 1];
};

const logChange = (data) => ClassChange.create(data).catch((e) => console.error('Could not save class change:', e.message));

// Loads a class from Google Calendar (404 when gone)
const loadEvent = async (eventId, res) => {
  if (!eventId) {
    throw new HttpError(400, 'Missing class id.');
  }
  try {
    const ev = await A.getEvent(eventId);
    if (!ev || ev.status === 'cancelled' || !ev.start || !ev.start.dateTime) throw new Error('gone');
    return ev;
  } catch (error) {
    throw new HttpError(404, 'This class was not found on Google Calendar (it may have been moved or removed already).');
  }
};

// After a teacher confirms their hours: tell students who were waiting (message 2)
const notifyWaitingStudents = async (teacher) => {
  const students = await User.find({ role: 'student' });
  const notified = [];
  for (const s of students) {
    const waiting = (s.makeupBank || []).filter((c) => !c.isUsed && c.waitingTeacherUpdate && String(c.teacher) === String(teacher._id));
    if (!waiting.length) continue;
    waiting.forEach((c) => { c.waitingTeacherUpdate = false; });
    await s.save();
    await toStudent(s, M.studentScheduleUpdated(s), waiting[0].template);
    notified.push(s.name);
  }
  return notified;
};

const waitingStudentNames = async (teacher) => {
  const students = await User.find({ role: 'student' });
  return students
    .filter((s) => (s.makeupBank || []).some((c) => !c.isUsed && c.waitingTeacherUpdate && String(c.teacher) === String(teacher._id)))
    .map((s) => s.name);
};

// ------------------------------------------------------------
// 👨‍🏫 TEACHER: 🗓️ My Schedule
// ------------------------------------------------------------
const availabilityView = async (teacher) => ({
  availability: {
    weekly: (teacher.availability && teacher.availability.weekly) || [],
    blocked: (teacher.availability && teacher.availability.blocked) || [],
    extra: (teacher.availability && teacher.availability.extra) || [],
    confirmedAt: (teacher.availability && teacher.availability.confirmedAt) || null
  },
  fresh: A.isFresh(teacher),
  waitingStudents: await waitingStudentNames(teacher)
});

// @route GET /api/schedule/my-availability (Teacher)
const getMyAvailability = handle(async (req, res) => {
  const teacher = await User.findById(req.user._id);
  res.status(200).json(await availabilityView(teacher));
});

// @route PUT /api/schedule/my-availability (Teacher) — saving also confirms the hours
const saveMyAvailability = handle(async (req, res) => {
  const teacher = await User.findById(req.user._id);
  const clean = A.cleanAvailability(req.body || {});
  teacher.availability = { ...clean, confirmedAt: new Date() };
  await teacher.save();
  const notified = await notifyWaitingStudents(teacher);
  res.status(200).json({ ...(await availabilityView(teacher)), notified });
});

// @route POST /api/schedule/my-availability/confirm (Teacher) — "✅ My hours are correct" / "✅ Schedule updated"
const confirmMyAvailability = handle(async (req, res) => {
  const teacher = await User.findById(req.user._id);
  teacher.availability = teacher.availability || {};
  teacher.availability.confirmedAt = new Date();
  teacher.markModified('availability');
  await teacher.save();
  const notified = await notifyWaitingStudents(teacher);
  res.status(200).json({ ...(await availabilityView(teacher)), notified });
});

// ------------------------------------------------------------
// 👩‍🎓 STUDENT: credits, free times, postpone, book
// ------------------------------------------------------------

// @route GET /api/schedule/makeup-info (Student)
const getMakeupInfo = handle(async (req, res) => {
  const student = await User.findById(req.user._id);
  const { teachers } = await A.loadPeople();
  const credits = activeCredits(student).sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate));

  // Teachers the student can book with: teachers of their credits, else the teachers of their classes
  const ids = new Set(credits.filter((c) => c.teacher).map((c) => String(c.teacher)));
  if (credits.some((c) => !c.teacher) || ids.size === 0) {
    const now = Date.now();
    const events = await A.listEvents(now - 30 * A.DAY, now + 30 * A.DAY);
    events.filter((ev) => classBelongsToStudent(parseEventStudent(ev), student)).forEach((ev) => {
      const t = A.teacherOfEvent(ev, teachers);
      if (t) ids.add(String(t._id));
    });
  }
  const myTeachers = teachers.filter((t) => ids.has(String(t._id))).map((t) => ({ id: String(t._id), name: t.name, fresh: A.isFresh(t) }));

  res.status(200).json({
    credits: credits.map((c) => ({
      id: String(c._id),
      expirationDate: c.expirationDate,
      originalClassDate: c.originalClassDate,
      teacherId: c.teacher ? String(c.teacher) : null,
      teacherName: c.teacherName || '',
      waiting: !!c.waitingTeacherUpdate
    })),
    teachers: myTeachers,
    noticeHours: A.NOTICE_HOURS,
    windowDays: A.BOOK_WINDOW_DAYS
  });
});

// Credit used for a booking with this teacher: same teacher first, then credits with no teacher, then the oldest
const pickCredit = (student, teacherId) => {
  const credits = activeCredits(student).sort((a, b) => new Date(a.expirationDate) - new Date(b.expirationDate));
  return credits.find((c) => String(c.teacher) === String(teacherId)) || credits.find((c) => !c.teacher) || credits[0] || null;
};

// @route GET /api/schedule/free-slots?teacherId= (Student)
const getStudentFreeSlots = handle(async (req, res) => {
  const student = await User.findById(req.user._id);
  const teacher = await User.findById(req.query.teacherId);
  if (!teacher || teacher.role !== 'teacher') {
    throw new HttpError(404, 'Teacher not found.');
  }
  const credit = pickCredit(student, teacher._id);
  if (!credit) return res.status(200).json({ fresh: A.isFresh(teacher), slots: [], noCredit: true });
  if (!A.isFresh(teacher)) return res.status(200).json({ fresh: false, slots: [] });

  const slots = await A.bookableSlots({ teacher, student, durationMin: credit.durationMinutes || 60 });
  if (!slots.length && !credit.noSlotsAlertAt) {
    credit.noSlotsAlertAt = new Date();
    await student.save();
    await send(ADMIN_GROUP_TARGET, M.adminNoFreeTimes(student.name, teacher.name));
  }
  res.status(200).json({ fresh: true, slots, durationMinutes: credit.durationMinutes || 60, noSlots: slots.length === 0 });
});

// @route POST /api/schedule/postpone { eventId } (Student) — 5+ hours before the class
const studentPostpone = handle(async (req, res) => {
  const ev = await loadEvent(req.body.eventId, res);
  if (!classBelongsToStudent(parseEventStudent(ev), req.user)) {
    throw new HttpError(403, 'This class is not yours.');
  }
  const start = A.eventStart(ev);
  if (start.getTime() - Date.now() < A.NOTICE_HOURS * A.HOUR) {
    throw new HttpError(400, `It is too late to postpone this class online (less than ${A.NOTICE_HOURS} hours before). The class follows our attendance policy. For an emergency, please contact the admin.`);
  }

  const { teachers } = await A.loadPeople();
  const teacher = A.teacherOfEvent(ev, teachers);
  const fresh = !!teacher && A.isFresh(teacher);

  await A.deleteEvent(ev.id);
  const student = await User.findById(req.user._id);
  addCredit(student, { source: 'postpone', teacher, ev, reason: 'Postponed by student', waiting: !!teacher && !fresh });
  await student.save();

  logChange({ action: 'postpone', by: 'student', byUser: student._id, student: student._id, studentName: student.name, teacher: teacher && teacher._id, teacherName: teacher && teacher.name, eventId: ev.id, title: ev.summary, oldStart: start, reason: 'Postponed by student', credit: true });

  await toStudent(student, M.studentPostponed(student, A.fmtTime(start, studentTz(ev))), ev);
  if (teacher) {
    if (fresh) await toTeacher(teacher, M.teacherChanged(teacher, student.name, cairo(start), 'postponed by the student. They will book a new time from your free hours'), ev);
    else await toTeacher(teacher, M.teacherUpdateNow(teacher, student.name, cairo(start)), ev);
  } else {
    await send(ADMIN_GROUP_TARGET, M.adminNoFreeTimes(student.name, 'their teacher (no teacher found for this class)'));
  }

  res.status(200).json({ message: 'Class postponed.', fresh, teacherId: teacher ? String(teacher._id) : null });
});

// @route POST /api/schedule/book-makeup { teacherId, start } (Student)
const bookMakeup = handle(async (req, res) => {
  const student = await User.findById(req.user._id);
  const teacher = await User.findById(req.body.teacherId);
  if (!teacher || teacher.role !== 'teacher') {
    throw new HttpError(404, 'Teacher not found.');
  }
  if (!A.isFresh(teacher)) {
    throw new HttpError(400, "Your teacher's schedule is being updated. You will get a WhatsApp message when you can choose a time.");
  }
  const credit = pickCredit(student, teacher._id);
  if (!credit) {
    throw new HttpError(400, 'You have no makeup credit to use.');
  }

  const start = new Date(req.body.start);
  const durationMin = credit.durationMinutes || 60;
  const slots = await A.bookableSlots({ teacher, student, durationMin });
  if (Number.isNaN(start.getTime()) || !slots.some((s) => s.getTime() === start.getTime())) {
    throw new HttpError(409, 'This time is no longer free. Please choose another time.');
  }

  // Build the class from the original one (same links and format)
  let template = credit.template && credit.template.description ? credit.template : null;
  if (!template) {
    const ev = await A.findTemplateEvent(student, teacher);
    if (ev) template = A.templateOf(ev);
  }
  if (!template) {
    throw new HttpError(400, 'We could not prepare your class automatically. Please contact the admin.');
  }
  let description = template.description || '';
  const oldCodes = eventTeacherCodes({ description });
  if (!classBelongsToTeacher(oldCodes, teacher)) description = A.swapTeacherLink(description, oldCodes, teacher);
  const summary = (template.summary || student.name).startsWith('🎒 Makeup') ? template.summary : `🎒 Makeup: ${template.summary || student.name}`;
  const timeZone = template.timeZone || A.STUDENT_TZ;

  const created = await A.insertEvent({
    summary,
    description,
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: new Date(start.getTime() + durationMin * A.MIN).toISOString(), timeZone },
    ...(template.location ? { location: template.location } : {}),
    ...(template.colorId ? { colorId: template.colorId } : {})
  });

  credit.isUsed = true;
  credit.usedAt = new Date();
  credit.usedForEventId = created.id;
  credit.waitingTeacherUpdate = false;
  await student.save();

  logChange({ action: 'book', by: 'student', byUser: student._id, student: student._id, studentName: student.name, teacher: teacher._id, teacherName: teacher.name, eventId: created.id, title: summary, oldStart: credit.originalClassDate, newStart: start, reason: 'Makeup booked by student', credit: true });

  await toStudent(student, M.studentMakeupBooked(student, A.fmtTime(start, timeZone), teacher.name), created);
  await toTeacher(teacher, M.teacherBooked(teacher, student.name, cairo(start), { makeup: true, oldTime: credit.source === 'postpone' || credit.source === 'admin-postpone' ? cairo(credit.originalClassDate) : null }), created);

  res.status(200).json({ message: 'Makeup class booked!', start, eventId: created.id });
});

// ------------------------------------------------------------
// 🛡️ ADMIN: free times, 🔁 Postpone (3 choices), 🚫 Cancel, 📜 history
// ------------------------------------------------------------

// @route GET /api/schedule/admin/free-slots?teacherId=&durationMinutes=&eventId= (Admin) — any time from now, 14 days
const getAdminFreeSlots = handle(async (req, res) => {
  const teacher = await User.findById(req.query.teacherId);
  if (!teacher || teacher.role !== 'teacher') {
    throw new HttpError(404, 'Teacher not found.');
  }
  let student = null;
  if (req.query.eventId) {
    try {
      const ev = await A.getEvent(req.query.eventId);
      const { students } = await A.loadPeople();
      student = A.studentOfEvent(ev, students);
    } catch (e) { /* the class may be gone; free times still work */ }
  }
  const durationMin = Math.max(15, Number(req.query.durationMinutes) || 60);
  const slots = await A.bookableSlots({ teacher, student, durationMin, minNoticeHours: 0 });
  res.status(200).json({ teacher: { id: String(teacher._id), name: teacher.name }, fresh: A.isFresh(teacher), hasHours: !!(teacher.availability && ((teacher.availability.weekly || []).length || (teacher.availability.extra || []).length)), slots });
});

// @route GET /api/schedule/admin/class-info/:eventId (Admin) — teacher, student, length for the Postpone / Cancel boxes
const getAdminClassInfo = handle(async (req, res) => {
  const ev = await loadEvent(req.params.eventId, res);
  const { teachers, students } = await A.loadPeople();
  const teacher = A.teacherOfEvent(ev, teachers);
  const student = A.studentOfEvent(ev, students);
  res.status(200).json({
    eventId: ev.id,
    title: ev.summary,
    start: A.eventStart(ev),
    durationMinutes: A.eventMinutes(ev),
    teacher: teacher ? { id: String(teacher._id), name: teacher.name, fresh: A.isFresh(teacher) } : null,
    student: student ? { id: String(student._id), name: student.name } : null,
    teachers: teachers.filter((t) => (t.teacherGroupId || '').trim()).map((t) => ({ id: String(t._id), name: t.name }))
  });
});

// @route POST /api/schedule/admin-postpone { eventId, mode: 'student'|'time'|'teacher', newStart, newTeacherId, reason } (Admin)
const adminPostpone = handle(async (req, res) => {
  const { mode, newStart, newTeacherId, reason } = req.body;
  if (!['student', 'time', 'teacher'].includes(mode)) {
    throw new HttpError(400, 'Choose how to postpone.');
  }
  const ev = await loadEvent(req.body.eventId, res);
  const { teachers, students } = await A.loadPeople();
  const teacher = A.teacherOfEvent(ev, teachers);
  const studentLite = A.studentOfEvent(ev, students);
  if (!studentLite) {
    throw new HttpError(400, 'Could not find the student of this class in the LMS.');
  }
  const student = await User.findById(studentLite._id);
  const oldStart = A.eventStart(ev);
  const tz = studentTz(ev);
  const base = { by: 'admin', byUser: req.user._id, student: student._id, studentName: student.name, teacher: teacher && teacher._id, teacherName: teacher && teacher.name, eventId: ev.id, title: ev.summary, oldStart, reason: reason || '' };

  // 1) Let the student choose
  if (mode === 'student') {
    const fresh = !!teacher && A.isFresh(teacher);
    await A.deleteEvent(ev.id);
    addCredit(student, { source: 'admin-postpone', teacher, ev, reason: reason || 'Postponed by admin', waiting: !!teacher && !fresh });
    await student.save();
    logChange({ ...base, action: 'postpone', credit: true });
    await toStudent(student, M.studentPostponed(student, A.fmtTime(oldStart, tz)), ev);
    if (teacher) {
      if (fresh) await toTeacher(teacher, M.teacherChanged(teacher, student.name, cairo(oldStart), 'postponed by the admin. The student will book a new time from your free hours'), ev);
      else await toTeacher(teacher, M.teacherUpdateNow(teacher, student.name, cairo(oldStart)), ev);
    }
    return res.status(200).json({ message: fresh ? 'Postponed. The student can choose a new time now.' : "Postponed. The teacher was asked to update their schedule first; the student will be told when they can choose." });
  }

  const durationMin = A.eventMinutes(ev);
  const start = newStart ? new Date(newStart) : oldStart;
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) {
    throw new HttpError(400, 'Please choose a new time in the future.');
  }
  const when = { start: { dateTime: start.toISOString(), timeZone: tz }, end: { dateTime: new Date(start.getTime() + durationMin * A.MIN).toISOString(), timeZone: tz } };

  // 2) Admin picks the new time
  if (mode === 'time') {
    await A.patchEvent(ev.id, when);
    logChange({ ...base, action: 'move', newStart: start });
    await toStudent(student, M.studentMoved(student, A.fmtTime(oldStart, tz), A.fmtTime(start, tz), null), ev);
    if (teacher) await toTeacher(teacher, M.teacherChanged(teacher, student.name, cairo(oldStart), `moved to *${cairo(start)} Cairo*`), ev);
    return res.status(200).json({ message: 'Class moved and both sides notified.' });
  }

  // 3) Move to another teacher (same time unless a new time is chosen)
  const newTeacher = teachers.find((t) => String(t._id) === String(newTeacherId));
  if (!newTeacher || !(newTeacher.teacherGroupId || '').trim()) {
    throw new HttpError(400, 'Choose a teacher who has a group link saved.');
  }
  const description = A.swapTeacherLink(ev.description || '', eventTeacherCodes(ev), newTeacher);
  await A.patchEvent(ev.id, { ...when, description });
  logChange({ ...base, action: 'teacher-change', newStart: start, newTeacher: newTeacher._id, newTeacherName: newTeacher.name });
  await toStudent(student, M.studentMoved(student, A.fmtTime(oldStart, tz), A.fmtTime(start, tz), newTeacher.name), ev);
  if (teacher && String(teacher._id) !== String(newTeacher._id)) await toTeacher(teacher, M.teacherChanged(teacher, student.name, cairo(oldStart), 'moved to another teacher'), ev);
  await toTeacher(newTeacher, M.teacherBooked(newTeacher, student.name, cairo(start), { byAdmin: true }), { description });
  res.status(200).json({ message: `Class moved to ${newTeacher.name}. Please check the meeting link in Google Calendar.` });
});

// @route POST /api/schedule/admin-cancel { eventId, cancelledBy, giveCredit, payTeacher, reason } (Admin)
const adminCancel = handle(async (req, res) => {
  const { cancelledBy, reason } = req.body;
  const giveCredit = req.body.giveCredit === true;
  const payTeacher = req.body.payTeacher === true;
  if (!['student', 'teacher', 'admin'].includes(cancelledBy)) {
    throw new HttpError(400, 'Choose who cancelled the class.');
  }
  const ev = await loadEvent(req.body.eventId, res);
  const { teachers, students } = await A.loadPeople();
  const teacher = A.teacherOfEvent(ev, teachers);
  const studentLite = A.studentOfEvent(ev, students);
  const student = studentLite ? await User.findById(studentLite._id) : null;
  const start = A.eventStart(ev);
  const durationMin = A.eventMinutes(ev);

  await A.deleteEvent(ev.id); // no reminders, the time is free again

  let countedUsed = false;
  if (student) {
    if (giveCredit) {
      addCredit(student, { source: 'cancel', teacher, ev, reason: reason || `Cancelled by ${cancelledBy}` });
    } else if (student.subscription && student.subscription.status === 'active') {
      // No credit → counted from the package, like Absent
      student.subscription.classesUsed = (student.subscription.classesUsed || 0) + 1;
      // 🔄 Step 17: no more "expired" here; the cycle always renews on its PayPal date (classes are calculated)
      countedUsed = true;
    }
    await student.save();
  }

  await ClassSession.create({
    teacher: teacher ? teacher._id : req.user._id,
    student: student ? student._id : null,
    subject: ev.summary || 'Google Calendar Lesson',
    startTime: start,
    durationMinutes: durationMin,
    status: payTeacher && teacher ? 'completed' : 'cancelled',
    notes: payTeacher && teacher ? `Cancelled by ${cancelledBy}. Counted for teacher pay (admin choice).` : `Cancelled by ${cancelledBy}.`,
    studentGroupName: parseEventStudent(ev).name || (student && student.name) || ''
  });

  logChange({ action: 'cancel', by: 'admin', byUser: req.user._id, cancelledBy, student: student && student._id, studentName: student ? student.name : (parseEventStudent(ev).name || ''), teacher: teacher && teacher._id, teacherName: teacher && teacher.name, eventId: ev.id, title: ev.summary, oldStart: start, reason: reason || '', credit: giveCredit && !!student, countedUsed, teacherPaid: payTeacher && !!teacher });

  if (student) await toStudent(student, M.studentCancelled(student, A.fmtTime(start, studentTz(ev)), giveCredit), ev);
  if (teacher) await toTeacher(teacher, M.teacherChanged(teacher, student ? student.name : (parseEventStudent(ev).name || 'the student'), cairo(start), 'cancelled'), ev);

  res.status(200).json({ message: 'Class cancelled and removed from Google Calendar.', credit: giveCredit && !!student, countedUsed, teacherPaid: payTeacher && !!teacher });
});

// @route GET /api/users/:id/class-changes (Admin) — 📜 Class changes in the student profile
const getClassChanges = handle(async (req, res) => {
  const changes = await ClassChange.find({ student: req.params.id }).sort({ createdAt: -1 }).limit(100);
  res.status(200).json(changes);
});

module.exports = {
  getMyAvailability, saveMyAvailability, confirmMyAvailability,
  getMakeupInfo, getStudentFreeSlots, studentPostpone, bookMakeup,
  getAdminFreeSlots, getAdminClassInfo, adminPostpone, adminCancel, getClassChanges,
  notifyWaitingStudents
};
