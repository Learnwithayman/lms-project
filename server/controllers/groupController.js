// 👥 STEP 13 (24 Nov): GROUP COURSES
// - The admin creates a group (teacher, weekly day/time, course WhatsApp group, Classroom, Zoom) and
//   adds / removes members at any time. The weekly class lives in Google Calendar as ONE repeating event
//   that is created and updated from the group (description carries "LMSGroupID" so it is never treated
//   as a personal class: never counted, paused or credited for a member).
// - Reminders reach the course WhatsApp group automatically (it is the class's StudentGroupLink).
// - Members: Gift (free), New student (own PayPal seat subscription), or Enrolled (+$ on the MAIN
//   invoice). The LMS only REMINDS the admin on WhatsApp; it never changes PayPal.
// - Cancel by teacher/admin: MOVE the whole group to a new time, or SKIP the week (the admin is reminded
//   to take one class off each paying member's next invoice).
const mongoose = require('mongoose');
const Group = require('../models/Group');
const User = require('../models/User');
const ClassSession = require('../models/ClassSession');
const { sendMessage } = require('../utils/whatsappBot');
const A = require('../utils/availability');

const ADMIN_GROUP = process.env.ADMIN_WHATSAPP_NUMBER || 'https://chat.whatsapp.com/BYFE1IPRs2KGJNhGaxvpJd';
const SIGN = '*Learn With Ayman Admin Team*';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const BILLING = ['gift', 'new_paypal', 'main_invoice'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
    console.error('👥 Groups error:', error);
    res.status(500).json({ message: 'Server error in groups. Please try again.' });
  }
};

// ---------- small helpers ----------
const isHm = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const validTz = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; } };
const addDaysStr = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekdayOfDay = (day) => new Date(`${day}T12:00:00Z`).getUTCDay();
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';
const activeMembers = (group, at = new Date()) => (group.members || []).filter((m) => !m.leftAt || new Date(m.leftAt) > at);
const payingMembers = (group, at) => activeMembers(group, at).filter((m) => m.billing !== 'gift');
const hoursOf = (group) => (Number(group.durationMinutes) || 60) / 60;
const money = (n) => `$${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '')}`;
const fourWeekPrice = (group) => (Number(group.seatPrice) || 0) * hoursOf(group) * 4;
const classPrice = (group) => (Number(group.seatPrice) || 0) * hoursOf(group);
const whenText = (group) => `every ${DAYS[group.weekday]} at ${group.time} (${group.timeZone})`;
const BILLING_LABEL = { gift: '🎁 Gift (free)', new_paypal: '🆕 New student, own PayPal seat subscription', main_invoice: '🧾 Enrolled, added to the main invoice' };

const send = async (target, text) => {
  if (!target || !String(target).trim()) return false;
  try { await sendMessage(String(target).trim(), text); return true; } catch (e) { console.error('👥 Groups: message failed:', e.message); return false; }
};
const toAdmin = (text) => send(ADMIN_GROUP, `السلام عليكم / Assalamu Alaikum 🌿\n\n${text}\n\n${SIGN}`);
const toCourse = (group, text) => send(group.whatsappLink, `السلام عليكم / Assalamu Alaikum 🌿\n\n${text}\n\n${SIGN}`);
const toTeacher = (teacher, text) => send(teacher && teacher.teacherGroupId, `السلام عليكم / Assalamu Alaikum 🌿\n\n${text}\n\n${SIGN}`);

// ---------- Google Calendar ----------
// The class description (same labels the reminders / dashboards already read)
const describe = (group, teacher) => [
  group.classroomLink ? `classroom: ${group.classroomLink}` : null, // first: the dashboards take the first link after a 'classroom/link' label
  `TeacherGroupLink: ${(teacher && teacher.teacherGroupId) || ''}`,
  `StudentGroupLink: ${group.whatsappLink || ''}`,
  `StudentGroupName: 👥 Group: ${group.name}`,
  `LMSGroupID: ${group._id}`,
  group.course ? `Course: ${group.course}` : null,
  group.zoomLink ? `Zoom Link: ${group.zoomLink}` : null
].filter(Boolean).join('\n');
const summaryOf = (group) => `👥 ${group.name}`;

// Local "YYYY-MM-DDTHH:MM:00" end time (may roll past midnight)
const localEnd = (day, hm, minutes) => {
  const [h, m] = hm.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const endDay = addDaysStr(day, Math.floor(total / 1440));
  const rest = total % 1440;
  return `${endDay}T${String(Math.floor(rest / 60)).padStart(2, '0')}:${String(rest % 60).padStart(2, '0')}:00`;
};

// First class day on or after fromDay that is the group's weekday and still in the future
const firstClassDay = (group, fromDay) => {
  let day = fromDay;
  for (let i = 0; i < 7 && weekdayOfDay(day) !== group.weekday; i++) day = addDaysStr(day, 1);
  if (A.zonedToUtc(day, group.time, group.timeZone).getTime() <= Date.now()) day = addDaysStr(day, 7);
  return day;
};

const createSeries = async (group, teacher) => {
  const today = A.dayIn(new Date(), group.timeZone);
  const fromDay = group.startDate && isDay(group.startDate) && group.startDate > today ? group.startDate : today;
  const day = firstClassDay(group, fromDay);
  const minutes = Number(group.durationMinutes) || 60;
  const created = await A.insertEvent({
    summary: summaryOf(group),
    description: describe(group, teacher),
    start: { dateTime: `${day}T${group.time}:00`, timeZone: group.timeZone },
    end: { dateTime: localEnd(day, group.time, minutes), timeZone: group.timeZone },
    recurrence: ['RRULE:FREQ=WEEKLY']
  });
  return { id: created.id, firstDay: day };
};

// Stop a weekly series from now on (past classes stay in the calendar). Not started yet → deleted.
const endSeries = async (eventId) => {
  if (!eventId) return;
  let master;
  try { master = await A.getEvent(eventId); } catch (e) { return; } // already gone
  if (!master || master.status === 'cancelled') return;
  if (new Date(master.start.dateTime).getTime() > Date.now()) { await A.deleteEvent(eventId); return; }
  const until = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20261124T120000Z
  await A.patchEvent(eventId, { recurrence: [`RRULE:FREQ=WEEKLY;UNTIL=${until}`] });
};

// Upcoming classes of the group's current series (from the calendar)
const upcomingOf = async (group, weeks = 8) => {
  if (!group.calendarEventId) return [];
  const events = await A.listEvents(Date.now() - 3 * A.HOUR, Date.now() + weeks * 7 * A.DAY);
  return events.filter((ev) => ev.recurringEventId === group.calendarEventId || ev.id === group.calendarEventId)
    .filter((ev) => ev.status !== 'cancelled' && ev.start && ev.start.dateTime)
    .map((ev) => ({ eventId: ev.id, start: A.eventStart(ev), end: A.eventEnd(ev), moved: !!ev.originalStartTime && new Date(ev.originalStartTime.dateTime).getTime() !== A.eventStart(ev).getTime() }));
};

// ---------- shape for the admin screen ----------
const shape = (g) => ({
  id: String(g._id), name: g.name, course: g.course,
  teacherId: g.teacher ? String(g.teacher._id || g.teacher) : '', teacherName: g.teacher && g.teacher.name ? g.teacher.name : '',
  weekday: g.weekday, time: g.time, timeZone: g.timeZone, durationMinutes: g.durationMinutes, startDate: g.startDate,
  whatsappLink: g.whatsappLink, classroomLink: g.classroomLink, zoomLink: g.zoomLink,
  seatPrice: g.seatPrice, teacherSeatBonus: g.teacherSeatBonus, active: g.active, calendarEventId: g.calendarEventId,
  members: (g.members || []).map((m) => ({ id: String(m._id), studentId: String(m.student && m.student._id ? m.student._id : m.student), name: m.name, billing: m.billing, paypalSubscriptionId: m.paypalSubscriptionId, joinedAt: m.joinedAt, leftAt: m.leftAt }))
});

// Read + check the fields the admin sends (create and edit)
const readFields = async (body, current = {}) => {
  const f = {};
  if (body.name !== undefined) f.name = String(body.name).trim();
  if (body.course !== undefined) f.course = String(body.course).trim();
  if (body.weekday !== undefined) f.weekday = Number(body.weekday);
  if (body.time !== undefined) f.time = String(body.time).trim();
  if (body.timeZone !== undefined) f.timeZone = String(body.timeZone).trim();
  if (body.durationMinutes !== undefined) f.durationMinutes = Number(body.durationMinutes);
  if (body.startDate !== undefined) f.startDate = String(body.startDate || '').trim();
  ['whatsappLink', 'classroomLink', 'zoomLink'].forEach((k) => { if (body[k] !== undefined) f[k] = String(body[k] || '').trim(); });
  if (body.seatPrice !== undefined) f.seatPrice = Number(body.seatPrice);
  if (body.teacherSeatBonus !== undefined) f.teacherSeatBonus = Number(body.teacherSeatBonus);
  if (body.active !== undefined) f.active = !!body.active;
  if (body.teacherId !== undefined) f.teacher = body.teacherId;

  const v = { ...current, ...f };
  if (!v.name) throw new HttpError(400, 'Please give the group a name.');
  if (!(v.weekday >= 0 && v.weekday <= 6)) throw new HttpError(400, 'Please choose the day of the week.');
  if (!isHm(v.time)) throw new HttpError(400, 'Please choose the class time (HH:MM).');
  if (!validTz(v.timeZone || '')) throw new HttpError(400, 'That time zone is not valid.');
  if (!(v.durationMinutes >= 15 && v.durationMinutes <= 240)) throw new HttpError(400, 'Class length must be 15 to 240 minutes.');
  if (v.startDate && !isDay(v.startDate)) throw new HttpError(400, 'Start date must look like 2026-11-28.');
  if (!(v.seatPrice >= 0)) throw new HttpError(400, 'Seat price must be 0 or more.');
  if (!(v.teacherSeatBonus >= 0)) throw new HttpError(400, 'Teacher extra per seat must be 0 or more.');
  if (v.whatsappLink && !/chat\.whatsapp\.com\//i.test(v.whatsappLink)) throw new HttpError(400, 'The course WhatsApp link must be a full group invite link (https://chat.whatsapp.com/...).');
  if (!v.teacher || !mongoose.Types.ObjectId.isValid(String(v.teacher))) throw new HttpError(400, 'Please choose a teacher.');
  const teacher = await User.findById(v.teacher);
  if (!teacher || teacher.role !== 'teacher') throw new HttpError(400, 'Please choose a teacher.');
  if (!(teacher.teacherGroupId || '').trim()) throw new HttpError(400, `${teacher.name} has no group link saved. Add it in Manage Users first.`);
  return { fields: f, teacher };
};

// ---------- billing reminders to the admin ----------
const joinReminder = (group, m, studentName) => {
  if (m.billing === 'main_invoice') return `➕ *Group course: add to the main invoice*\n👤 *Student:* ${studentName}\n👥 *Group:* ${group.name} (${whenText(group)})\n\nPlease add *${money(fourWeekPrice(group))}* (every 4 weeks) to ${firstName(studentName)}'s main PayPal invoice / subscription from now on.`;
  if (m.billing === 'new_paypal') return `🆕 *Group course: new student*\n👤 *Student:* ${studentName}\n👥 *Group:* ${group.name} (${whenText(group)})\n\nPlease send ${firstName(studentName)} the group seat PayPal subscription: *${money(fourWeekPrice(group))} every 4 weeks*.`;
  return null; // gift: nothing to bill
};
const leaveReminder = (group, m, studentName) => {
  if (m.billing === 'main_invoice') return `➖ *Group course: remove from the main invoice*\n👤 *Student:* ${studentName}\n👥 *Group:* ${group.name}\n\nPlease remove the *${money(fourWeekPrice(group))}* group course amount from ${firstName(studentName)}'s main PayPal invoice / subscription.`;
  if (m.billing === 'new_paypal') return `➖ *Group course: cancel the seat subscription*\n👤 *Student:* ${studentName}\n👥 *Group:* ${group.name}\n\nPlease cancel ${firstName(studentName)}'s group seat PayPal subscription (${money(fourWeekPrice(group))} every 4 weeks).`;
  return null;
};

// ========================= ADMIN =========================

// @route GET /api/groups (Admin)
const listGroups = handle(async (req, res) => {
  const groups = await Group.find({}).populate('teacher', 'name').sort({ active: -1, name: 1 });
  res.status(200).json(groups.map(shape));
});

// @route POST /api/groups (Admin) — creates the weekly class in Google Calendar
const createGroup = handle(async (req, res) => {
  const defaults = { timeZone: 'America/New_York', durationMinutes: 60, seatPrice: 5, teacherSeatBonus: 2, active: true };
  const { fields, teacher } = await readFields(req.body, defaults);
  const group = new Group({ ...defaults, ...fields });
  let note = '';
  if (group.active) {
    const series = await createSeries(group, teacher);
    group.calendarEventId = series.id;
    note = ` First class: ${A.fmtTime(A.zonedToUtc(series.firstDay, group.time, group.timeZone), group.timeZone)} (${group.timeZone}).`;
  }
  await group.save();
  await group.populate('teacher', 'name');
  res.status(201).json({ message: `Group "${group.name}" created.${note}${group.whatsappLink ? '' : ' Add the course WhatsApp link so reminders can be sent.'}`, group: shape(group) });
});

// @route PUT /api/groups/:id (Admin) — a new time / day / teacher starts a new weekly series from now on
const updateGroup = handle(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) throw new HttpError(404, 'Group not found.');
  const before = group.toObject();
  const { fields, teacher } = await readFields(req.body, before);
  Object.assign(group, fields);

  const scheduleChanged = ['weekday', 'time', 'timeZone', 'durationMinutes', 'startDate'].some((k) => String(before[k]) !== String(group[k])) ||
    String(before.teacher) !== String(group.teacher);
  const textChanged = ['name', 'course', 'whatsappLink', 'classroomLink', 'zoomLink'].some((k) => String(before[k] || '') !== String(group[k] || ''));
  let note = '';

  if (!group.active) {
    if (group.calendarEventId) { await endSeries(group.calendarEventId); group.pastEventIds.push(group.calendarEventId); group.calendarEventId = ''; note = ' The weekly class was stopped in Google Calendar.'; }
  } else if (!group.calendarEventId || scheduleChanged) {
    if (group.calendarEventId) { await endSeries(group.calendarEventId); group.pastEventIds.push(group.calendarEventId); }
    const series = await createSeries(group, teacher);
    group.calendarEventId = series.id;
    note = ` Google Calendar updated: next class ${A.fmtTime(A.zonedToUtc(series.firstDay, group.time, group.timeZone), group.timeZone)} (${group.timeZone}).`;
    if (before.active && scheduleChanged) {
      const msg = `📅 *Group class time update*\n👥 *Group:* ${group.name}\n\nFrom now on the class is *${whenText(group)}*${String(before.teacher) !== String(group.teacher) ? ` with *${teacher.name}*` : ''}.`;
      await toCourse(group, msg);
      await toTeacher(teacher, msg);
    }
  } else if (textChanged) {
    await A.patchEvent(group.calendarEventId, { summary: summaryOf(group), description: describe(group, teacher) });
    note = ' Google Calendar updated.';
  }
  await group.save();
  await group.populate('teacher', 'name');
  res.status(200).json({ message: `Group "${group.name}" saved.${note}`, group: shape(group) });
});

// @route POST /api/groups/:id/members { studentId, billing, paypalSubscriptionId? } (Admin)
const addMember = handle(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) throw new HttpError(404, 'Group not found.');
  const student = mongoose.Types.ObjectId.isValid(String(req.body.studentId)) ? await User.findById(req.body.studentId) : null;
  if (!student || student.role !== 'student') throw new HttpError(400, 'Please choose a student.');
  const billing = BILLING.includes(req.body.billing) ? req.body.billing : 'gift';
  if (activeMembers(group).some((m) => String(m.student) === String(student._id))) throw new HttpError(409, `${student.name} is already in this group.`);
  group.members.push({ student: student._id, name: student.name, billing, paypalSubscriptionId: String(req.body.paypalSubscriptionId || '').trim() });
  await group.save();
  const m = group.members[group.members.length - 1];

  const notes = [];
  const reminder = joinReminder(group, m, student.name);
  if (reminder) notes.push((await toAdmin(reminder)) ? 'Billing reminder sent to the admin group.' : 'Billing reminder could not be sent.');
  if (group.active && group.whatsappLink) {
    const ok = await toCourse(group, `👋 *Welcome ${firstName(student.name)}!*\n👥 *Group:* ${group.name}\n📅 *Class:* ${whenText(group)}\n\n🎥 Classes are recorded, so anyone who misses a class can watch it later from their account.`);
    notes.push(ok ? 'Welcome message sent to the course group.' : 'Welcome message could not be sent.');
  }
  await group.populate('teacher', 'name');
  res.status(200).json({ message: `${student.name} added (${BILLING_LABEL[billing]}). ${notes.join(' ')}`.trim(), group: shape(group) });
});

// @route PUT /api/groups/:id/members/:memberId { billing, paypalSubscriptionId } (Admin)
const updateMember = handle(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) throw new HttpError(404, 'Group not found.');
  const m = group.members.id(req.params.memberId);
  if (!m || m.leftAt) throw new HttpError(404, 'Member not found.');
  const oldBilling = m.billing;
  if (req.body.billing !== undefined) {
    if (!BILLING.includes(req.body.billing)) throw new HttpError(400, 'Unknown billing type.');
    m.billing = req.body.billing;
  }
  if (req.body.paypalSubscriptionId !== undefined) m.paypalSubscriptionId = String(req.body.paypalSubscriptionId || '').trim();
  await group.save();

  const notes = [];
  if (oldBilling !== m.billing) {
    const off = leaveReminder(group, { billing: oldBilling }, m.name);
    const on = joinReminder(group, m, m.name);
    for (const text of [off, on].filter(Boolean)) notes.push((await toAdmin(text)) ? 'Billing reminder sent.' : 'Billing reminder could not be sent.');
  }
  await group.populate('teacher', 'name');
  res.status(200).json({ message: `${m.name}: ${BILLING_LABEL[m.billing]}. ${[...new Set(notes)].join(' ')}`.trim(), group: shape(group) });
});

// @route DELETE /api/groups/:id/members/:memberId (Admin) — kept in history with a "left" date
const removeMember = handle(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) throw new HttpError(404, 'Group not found.');
  const m = group.members.id(req.params.memberId);
  if (!m || m.leftAt) throw new HttpError(404, 'Member not found.');
  m.leftAt = new Date();
  await group.save();
  const reminder = leaveReminder(group, m, m.name);
  const sent = reminder ? await toAdmin(reminder) : null;
  await group.populate('teacher', 'name');
  res.status(200).json({ message: `${m.name} removed from the group.${sent === true ? ' Billing reminder sent to the admin group.' : sent === false ? ' Billing reminder could not be sent.' : ''}`, group: shape(group) });
});

// @route GET /api/groups/:id/classes (Admin) — upcoming weeks + past classes with attendance
const groupClasses = handle(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) throw new HttpError(404, 'Group not found.');
  const upcoming = group.active ? await upcomingOf(group) : [];
  const past = await ClassSession.find({ group: group._id }).sort({ startTime: -1 }).limit(20).lean();
  res.status(200).json({
    upcoming,
    past: past.map((s) => ({ id: String(s._id), when: s.startTime, minutes: s.durationMinutes, notes: s.notes || '', recordingLink: s.recordingLink || '', seatBonus: s.seatBonus || 0, attendance: (s.attendance || []).map((a) => ({ name: a.name, status: a.status })) }))
  });
});

// @route POST /api/groups/:id/cancel { eventId, mode: 'move'|'skip', newStart?, reason? } (Admin)
const cancelGroupClass = handle(async (req, res) => {
  const group = await Group.findById(req.params.id).populate('teacher');
  if (!group) throw new HttpError(404, 'Group not found.');
  const { eventId, mode } = req.body;
  if (!['move', 'skip'].includes(mode)) throw new HttpError(400, 'Choose Move or Skip.');
  let ev;
  try { ev = await A.getEvent(eventId); } catch (e) { throw new HttpError(404, 'That class was not found in Google Calendar.'); }
  if (!ev || (ev.recurringEventId !== group.calendarEventId && ev.id !== group.calendarEventId)) throw new HttpError(400, 'That class is not part of this group.');
  const oldStart = A.eventStart(ev);
  const oldText = A.fmtTime(oldStart, group.timeZone);
  const reason = String(req.body.reason || '').trim();

  if (mode === 'move') {
    const newStart = new Date(req.body.newStart);
    if (Number.isNaN(newStart.getTime()) || newStart.getTime() < Date.now()) throw new HttpError(400, 'Please choose a new time in the future.');
    const minutes = Math.round((A.eventEnd(ev) - oldStart) / A.MIN) || Number(group.durationMinutes) || 60;
    const newEnd = new Date(newStart.getTime() + minutes * A.MIN);
    await A.patchEvent(ev.id, { start: { dateTime: newStart.toISOString(), timeZone: group.timeZone }, end: { dateTime: newEnd.toISOString(), timeZone: group.timeZone } });
    const newText = A.fmtTime(newStart, group.timeZone);
    const msg = `🔁 *Group class moved*\n👥 *Group:* ${group.name}\n\n❌ *Was:* ${oldText}\n✅ *New time:* ${newText} (${group.timeZone})${reason ? `\n📝 *Reason:* ${reason}` : ''}`;
    const sentCourse = await toCourse(group, msg);
    const sentTeacher = await toTeacher(group.teacher, `${msg}\n🕒 *Cairo time:* ${A.fmtTime(newStart, A.CAIRO_TZ)}`);
    return res.status(200).json({ message: `Moved to ${newText} (${group.timeZone}). ${sentCourse ? 'Course group notified.' : 'Course group NOT notified (no link).'} ${sentTeacher ? 'Teacher notified.' : 'Teacher NOT notified.'}` });
  }

  // skip this week
  await A.deleteEvent(ev.id);
  const msg = `🚫 *No group class this week*\n👥 *Group:* ${group.name}\n📅 *Class:* ${oldText} (${group.timeZone})${reason ? `\n📝 *Reason:* ${reason}` : ''}\n\nSee you next week, in shā’ Allāh.`;
  const sentCourse = await toCourse(group, msg);
  const sentTeacher = await toTeacher(group.teacher, msg);
  const paying = payingMembers(group, oldStart);
  let billingNote = '';
  if (paying.length) {
    const lines = paying.map((m) => `• ${m.name}: ${m.billing === 'main_invoice' ? 'main invoice' : 'seat subscription'}`).join('\n');
    const ok = await toAdmin(`💸 *Group class skipped: take one class off*\n👥 *Group:* ${group.name}\n📅 *Skipped:* ${oldText} (${group.timeZone})\n\nPlease take *${money(classPrice(group))}* off the next payment for:\n${lines}`);
    billingNote = ok ? ` Reminder sent to take ${money(classPrice(group))} off for ${paying.length} paying member${paying.length === 1 ? '' : 's'}.` : ' The billing reminder could not be sent.';
  }
  res.status(200).json({ message: `Class on ${oldText} skipped. ${sentCourse ? 'Course group notified.' : 'Course group NOT notified (no link).'} ${sentTeacher ? 'Teacher notified.' : 'Teacher NOT notified.'}${billingNote}` });
});

// @route PUT /api/groups/sessions/:sessionId/recording { recordingLink } (Admin, or the teacher of that class)
const setRecording = handle(async (req, res) => {
  const session = await ClassSession.findById(req.params.sessionId);
  if (!session || !session.group) throw new HttpError(404, 'Group class not found.');
  const role = String(req.user.role || '').toLowerCase();
  if (role !== 'admin' && String(session.teacher) !== String(req.user._id)) throw new HttpError(403, 'Only the admin or the class teacher can add the recording.');
  const link = String(req.body.recordingLink || '').trim();
  if (link && !/^https?:\/\//i.test(link)) throw new HttpError(400, 'Please paste a full link (https://...).');
  session.recordingLink = link;
  await session.save();
  res.status(200).json({ message: link ? 'Recording link saved.' : 'Recording link removed.' });
});

// ========================= STUDENT =========================

// @route GET /api/groups/mine (Student) — my group courses, Classroom links and recordings
const myGroups = handle(async (req, res) => {
  const groups = await Group.find({ active: true, 'members.student': req.user._id }).populate('teacher', 'name');
  const out = [];
  for (const g of groups) {
    const me = activeMembers(g).find((m) => String(m.student) === String(req.user._id));
    if (!me) continue;
    const sessions = await ClassSession.find({ group: g._id, startTime: { $gte: me.joinedAt || new Date(0) } }).sort({ startTime: -1 }).limit(10).lean();
    let next = null;
    try { next = (await upcomingOf(g, 2))[0] || null; } catch (e) { next = null; }
    out.push({
      id: String(g._id), name: g.name, course: g.course, teacherName: g.teacher ? g.teacher.name : '',
      when: whenText(g), classroomLink: g.classroomLink, zoomLink: g.zoomLink,
      next: next ? next.start : null,
      classes: sessions.map((s) => {
        const mine = (s.attendance || []).find((a) => String(a.student) === String(req.user._id));
        return { id: String(s._id), when: s.startTime, notes: s.notes || '', recordingLink: s.recordingLink || '', status: mine ? mine.status : '' };
      })
    });
  }
  res.status(200).json(out);
});

// ========================= used by End class =========================

// Members of a group for the teacher's End class box
const membersForClass = async (groupId) => {
  if (!mongoose.Types.ObjectId.isValid(String(groupId))) return null;
  const g = await Group.findById(groupId);
  if (!g) return null;
  return { id: String(g._id), name: g.name, classroomLink: g.classroomLink || '', members: activeMembers(g).map((m) => ({ studentId: String(m.student), name: m.name, billing: m.billing })) };
};

// Called by endClass for a group class: attendance, recording and the teacher's paying-seat bonus
const finishGroupClass = async ({ session, groupId, teacher, attendance, recordingLink, minutes }) => {
  const g = mongoose.Types.ObjectId.isValid(String(groupId)) ? await Group.findById(groupId) : null;
  if (!g) return;
  const at = session.startTime || new Date();
  const members = activeMembers(g, at);
  const present = new Map((Array.isArray(attendance) ? attendance : []).map((a) => [String(a.studentId), !!a.present]));
  session.group = g._id;
  session.student = null; // never a personal class
  session.attendance = members.map((m) => ({ student: m.student, name: m.name, status: present.has(String(m.student)) ? (present.get(String(m.student)) ? 'present' : 'absent') : 'present' }));
  if (recordingLink && /^https?:\/\//i.test(String(recordingLink).trim())) session.recordingLink = String(recordingLink).trim();

  const seats = members.filter((m) => m.billing !== 'gift').length;
  const bonus = Math.round((Number(g.teacherSeatBonus) || 0) * seats * ((Number(minutes) || 60) / 60) * 100) / 100;
  if (bonus > 0 && !(session.seatBonus > 0) && teacher) {
    session.seatBonus = bonus;
    teacher.adjustments = teacher.adjustments || [];
    teacher.adjustments.push({ amount: bonus, reason: `👥 Group class: ${g.name} (${seats} paying seat${seats === 1 ? '' : 's'} × $${g.teacherSeatBonus}/hour)`, date: new Date() });
    await teacher.save();
  }
  await session.save();
};

module.exports = {
  listGroups, createGroup, updateGroup, addMember, updateMember, removeMember, groupClasses, cancelGroupClass, setRecording, myGroups,
  membersForClass, finishGroupClass,
  _test: { localEnd, firstClassDay, describe, activeMembers, payingMembers, fourWeekPrice, classPrice, joinReminder, leaveReminder }
};
