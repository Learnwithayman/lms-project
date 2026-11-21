// 🗓️ STEP 7: teacher free hours ("My Schedule") → free times students / admin can book
// Teacher hours are saved in Cairo time. A time is free when it is inside the teacher's hours
// for that day and does not overlap any class of that teacher (or of the student) on Google Calendar.

const User = require('../models/User');
const { calendar } = require('../controllers/scheduleController');
const { parseEventStudent, classBelongsToStudent, eventTeacherCodes, classBelongsToTeacher, cleanCode, isOldGroupId } = require('./classMatch');

const CALENDAR_ID = 'admin@learnwithayman.com';
const CAIRO_TZ = 'Africa/Cairo';
const STUDENT_TZ = 'America/New_York';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const NOTICE_HOURS = 5;        // decision Q3 / Q4: 5 hours
const BOOK_WINDOW_DAYS = 14;   // decision Q4: within the next 14 days
const SLOT_STEP_MIN = 30;      // free times start on the hour and half hour

// ---------- time zones ----------
const tzOffsetMin = (date, timeZone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return Math.round((asUtc - date.getTime()) / MIN);
};

// 'YYYY-MM-DD' + 'HH:MM' in a time zone → Date
const zonedToUtc = (day, hm, timeZone) => {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off1 = tzOffsetMin(new Date(guess), timeZone);
  let t = guess - off1 * MIN;
  const off2 = tzOffsetMin(new Date(t), timeZone);
  if (off2 !== off1) t = guess - off2 * MIN;
  return new Date(t);
};

const dayIn = (date, timeZone) => new Date(date).toLocaleDateString('en-CA', { timeZone });
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekdayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

// e.g. "Mon, Nov 20, 6:00 PM"
const fmtTime = (date, timeZone) => new Date(date).toLocaleString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Start of the most recent Monday (Cairo)
const lastMondayStart = (now = new Date()) => {
  const today = dayIn(now, CAIRO_TZ);
  const back = (weekdayOf(today) + 6) % 7; // Monday → 0, Sunday → 6
  return zonedToUtc(addDays(today, -back), '00:00', CAIRO_TZ);
};

// Hours count as up to date only if confirmed on or after the latest Monday (decision Q2)
const isFresh = (teacher, now = new Date()) => {
  const at = teacher && teacher.availability && teacher.availability.confirmedAt;
  return !!at && new Date(at) >= lastMondayStart(now);
};

// ---------- hours validation ----------
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HM_END = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/; // 🗓️ Step 19: "24:00" = until midnight (overnight hours are saved as day 21:00–24:00 + next day 00:00–05:00)
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cleanAvailability = (input = {}) => {
  const weekly = (Array.isArray(input.weekly) ? input.weekly : [])
    .map((w) => ({ day: Number(w.day), start: String(w.start || ''), end: String(w.end || '') }))
    .filter((w) => w.day >= 0 && w.day <= 6 && HM.test(w.start) && HM_END.test(w.end) && w.start < w.end);
  const blocked = [...new Set((Array.isArray(input.blocked) ? input.blocked : []).map(String).filter((d) => DATE.test(d)))].sort();
  const extra = (Array.isArray(input.extra) ? input.extra : [])
    .map((e) => ({ date: String(e.date || ''), start: String(e.start || ''), end: String(e.end || '') }))
    .filter((e) => DATE.test(e.date) && HM.test(e.start) && HM_END.test(e.end) && e.start < e.end);
  return { weekly, blocked, extra };
};

// ---------- Google Calendar ----------
const listEvents = async (from, to) => {
  const events = [];
  let pageToken;
  do {
    const res = await calendar.events.list({ calendarId: CALENDAR_ID, timeMin: new Date(from).toISOString(), timeMax: new Date(to).toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 2500, pageToken });
    events.push(...(res.data.items || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return events.filter((e) => e.start && e.start.dateTime && e.status !== 'cancelled');
};

const getEvent = async (eventId) => (await calendar.events.get({ calendarId: CALENDAR_ID, eventId })).data;
const deleteEvent = (eventId) => calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
const patchEvent = (eventId, requestBody) => calendar.events.patch({ calendarId: CALENDAR_ID, eventId, requestBody });
const insertEvent = async (requestBody) => (await calendar.events.insert({ calendarId: CALENDAR_ID, requestBody })).data;

const eventStart = (ev) => new Date(ev.start.dateTime);
const eventEnd = (ev) => new Date((ev.end && ev.end.dateTime) || eventStart(ev).getTime() + HOUR);
const eventMinutes = (ev) => Math.max(15, Math.round((eventEnd(ev) - eventStart(ev)) / MIN));

// Who teaches / who studies in this class
const teacherOfEvent = (ev, teachers) => teachers.find((t) => classBelongsToTeacher(eventTeacherCodes(ev), t)) || null;
const studentOfEvent = (ev, students) => {
  const parsed = parseEventStudent(ev);
  return students.find((s) => classBelongsToStudent({ codes: parsed.codes, name: null }, s)) ||
    students.find((s) => classBelongsToStudent({ codes: [], name: parsed.name }, s)) || null;
};

// Copy of a class, used later to book the makeup in the same format
const templateOf = (ev) => ({
  summary: ev.summary || '',
  description: ev.description || '',
  timeZone: (ev.start && ev.start.timeZone) || STUDENT_TZ,
  location: ev.location || '',
  colorId: ev.colorId || ''
});

// A recent / upcoming class of this student with this teacher (for credits that have no copy)
const findTemplateEvent = async (student, teacher, now = new Date()) => {
  const events = await listEvents(now.getTime() - 45 * DAY, now.getTime() + 30 * DAY);
  const mine = events.filter((ev) => classBelongsToStudent(parseEventStudent(ev), student) && (!teacher || classBelongsToTeacher(eventTeacherCodes(ev), teacher)));
  return mine.length ? mine[mine.length - 1] : null;
};

// ---------- free times ----------
// Free start times for `durationMin` minutes between `from` and `to`
const freeSlots = ({ teacher, student, durationMin = 60, from, to, events }) => {
  const av = teacher.availability || {};
  const weekly = av.weekly || [];
  const extra = av.extra || [];
  const blocked = new Set(av.blocked || []);
  const busy = events
    .filter((ev) => classBelongsToTeacher(eventTeacherCodes(ev), teacher) || (student && classBelongsToStudent(parseEventStudent(ev), student)))
    .map((ev) => [eventStart(ev).getTime(), eventEnd(ev).getTime()]);
  const dur = durationMin * MIN;
  const slots = new Set();

  // All hour windows as real times; windows that touch (e.g. Mon 21:00–24:00 + Tue 00:00–05:00) become one window
  const windows = [];
  for (let day = addDays(dayIn(from, CAIRO_TZ), -1); day <= dayIn(to, CAIRO_TZ); day = addDays(day, 1)) {
    if (blocked.has(day)) continue;
    const ranges = [...weekly.filter((w) => w.day === weekdayOf(day)), ...extra.filter((e) => e.date === day)];
    for (const r of ranges) windows.push([zonedToUtc(day, r.start, CAIRO_TZ).getTime(), zonedToUtc(day, r.end, CAIRO_TZ).getTime()]);
  }
  windows.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else merged.push([...w]);
  }
  for (const [rStart, rEnd] of merged) {
    for (let t = rStart; t + dur <= rEnd; t += SLOT_STEP_MIN * MIN) {
      if (t < new Date(from).getTime() || t > new Date(to).getTime()) continue;
      if (busy.some(([bs, be]) => t < be && t + dur > bs)) continue;
      slots.add(t);
    }
  }
  return [...slots].sort((a, b) => a - b).map((t) => new Date(t));
};

// Free times a student may book now (5+ hours from now, within 14 days)
const bookableSlots = async ({ teacher, student, durationMin, now = new Date(), minNoticeHours = NOTICE_HOURS }) => {
  const from = new Date(now.getTime() + minNoticeHours * HOUR);
  const to = new Date(now.getTime() + BOOK_WINDOW_DAYS * DAY);
  const events = await listEvents(from.getTime() - DAY, to.getTime() + DAY);
  return freeSlots({ teacher, student, durationMin, from, to, events });
};

// Swap the teacher inside a class description (move to another teacher):
// the old teacher's group ID → the new teacher's group ID, the old invite code → the new invite code
const swapTeacherLink = (description, oldCodes, newTeacher) => {
  const mine = [newTeacher.teacherGroupId, ...(newTeacher.legacyGroupIds || [])].map(cleanCode).filter((c) => c.length > 5);
  const newId = mine.find((c) => isOldGroupId(c));
  const newLink = mine.find((c) => !isOldGroupId(c));
  let out = description;
  (Array.isArray(oldCodes) ? oldCodes : [oldCodes]).filter(Boolean).map(cleanCode).forEach((old) => {
    const replacement = isOldGroupId(old) ? (newId || newLink) : (newLink || newId);
    if (old && replacement) out = out.split(old).join(replacement);
  });
  return out;
};

const loadPeople = async () => {
  const [teachers, students] = await Promise.all([User.find({ role: 'teacher' }), User.find({ role: 'student' })]);
  return { teachers, students };
};

module.exports = {
  CAIRO_TZ, STUDENT_TZ, NOTICE_HOURS, BOOK_WINDOW_DAYS, MIN, HOUR, DAY,
  tzOffsetMin, zonedToUtc, dayIn, addDays, weekdayOf, fmtTime, lastMondayStart, isFresh,
  cleanAvailability, listEvents, getEvent, deleteEvent, patchEvent, insertEvent,
  eventStart, eventEnd, eventMinutes, teacherOfEvent, studentOfEvent, templateOf, findTemplateEvent,
  freeSlots, bookableSlots, swapTeacherLink, loadPeople
};
