// 📋 STEP 5: who owes which monthly plan / report
// A teacher owes a plan and a report for a student only when that student has at least
// one class with that teacher on Google Calendar that month, and is not on a full pause.
// The month of a class is the student's month (America/New_York); deadlines use Cairo days.

const User = require('../models/User');
const { calendar } = require('../controllers/scheduleController');
const { parseEventStudent, classBelongsToStudent, eventTeacherCodes, classBelongsToTeacher, nameInText } = require('./classMatch');

const CALENDAR_ID = 'admin@learnwithayman.com';
const STUDENT_TZ = 'America/New_York';
const CAIRO_TZ = 'Africa/Cairo';
const DAY_MS = 24 * 60 * 60 * 1000;

// First months the new system chases (decision 16 Nov, Q6 = A)
const GO_LIVE = { plans: '2026-12', reports: '2026-11' };

const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

// 'YYYY-MM-DD' of an instant in a time zone
const dayIn = (date, timeZone) => new Date(date).toLocaleDateString('en-CA', { timeZone });
// 'YYYY-MM' of an instant in a time zone
const monthIn = (date, timeZone) => dayIn(date, timeZone).slice(0, 7);

const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

// 'YYYY-MM' → 'November 2026'
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_EN[m - 1].charAt(0).toUpperCase()}${MONTHS_EN[m - 1].slice(1)} ${y}`;
};

// Any saved month text ('November 2026', 'Nov 2026', 'نوفمبر ٢٠٢٦', 'YYYY-MM') → 'YYYY-MM' (or null)
const normMonth = (text) => {
  if (!text) return null;
  const s = String(text).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).toLowerCase().trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`;
  const year = s.match(/(\d{4})/);
  if (!year) return null;
  let idx = MONTHS_EN.findIndex((m) => s.includes(m) || s.split(/[\s,]+/).includes(m.slice(0, 3)));
  if (idx < 0) idx = MONTHS_AR.findIndex((m) => s.includes(m));
  if (idx < 0 && s.includes('ابريل')) idx = 3;
  if (idx < 0 && s.includes('اغسطس')) idx = 7;
  return idx < 0 ? null : `${year[1]}-${String(idx + 1).padStart(2, '0')}`;
};

// ------------------------------------------------------------
// Google Calendar classes of one month (cached for 5 minutes)
// ------------------------------------------------------------
const eventCache = new Map();
const CACHE_MS = 5 * 60 * 1000;

const listMonthEvents = async (key) => {
  const hit = eventCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.events;

  const [y, m] = key.split('-').map(Number);
  const timeMin = new Date(Date.UTC(y, m - 1, 1) - DAY_MS).toISOString();
  const timeMax = new Date(Date.UTC(y, m, 1) + DAY_MS).toISOString();
  const events = [];
  let pageToken;
  do {
    const res = await calendar.events.list({ calendarId: CALENDAR_ID, timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 2500, pageToken });
    events.push(...(res.data.items || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  const inMonth = events.filter((e) => e.start && e.start.dateTime && e.status !== 'cancelled' && monthIn(e.start.dateTime, STUDENT_TZ) === key);
  eventCache.set(key, { at: Date.now(), events: inMonth });
  return inMonth;
};

// Prefer a group-code match, then a name match
// 👪 26 Nov (Step 25): brothers / sisters on one link or one old ID (Yasmin + Deemah Shadid): the code alone
// matches all of them, so the class must NAME the child (StudentGroupName or title); never guess a sibling.
// A class naming several children (e.g. "Celia Dahir  Saber Dahir") is a duty for EACH of them.
// Returns a list (empty when nobody can be matched).
const findStudentsFor = ({ codes, name }, students, title = '') => {
  const byName = () => {
    const s = students.find((x) => classBelongsToStudent({ codes: [], name }, x));
    if (s) return [s];
    const inTitle = students.filter((x) => (x.name || '').trim().length > 3 && String(title || '').toLowerCase().includes((x.name || '').trim().toLowerCase())); // full name in the title
    return inTitle.length === 1 ? inTitle : [];
  };
  const byCode = students.filter((s) => classBelongsToStudent({ codes, name: null }, s));
  if (byCode.length === 1) return byCode;
  if (byCode.length > 1) {
    const named = byCode.filter((s) => nameInText(`${name || ''} ${title || ''}`, s.name));
    return named.length ? named : byName(); // none of the link's owners named → the student the class names
  }
  return byName();
};

// ------------------------------------------------------------
// Duties of one month: one row per (student, teacher)
// ------------------------------------------------------------
const buildMonthDuties = async (key, opts = {}) => {
  const [events, teachers, students] = await Promise.all([
    opts.events || listMonthEvents(key),
    opts.teachers || User.find({ role: 'teacher' }),
    opts.students || User.find({ role: 'student' })
  ]);

  const duties = new Map();
  const unmatched = [];
  for (const ev of events) {
    const start = new Date(ev.start.dateTime);
    const teacher = teachers.find((t) => classBelongsToTeacher(eventTeacherCodes(ev), t));
    const classStudents = findStudentsFor(parseEventStudent(ev), students, ev.summary);
    if (!teacher || !classStudents.length) {
      unmatched.push({ title: ev.summary || '(no title)', start, missing: !teacher ? 'teacher' : 'student' });
      continue;
    }
    for (const student of classStudents) {
      if (student.pause && student.pause.kind === 'full') continue; // paused students are skipped

      const id = `${student._id}|${teacher._id}`;
      let d = duties.get(id);
      if (!d) {
        d = { student, teacher, classCount: 0, firstClass: null, lastClass: null };
        duties.set(id, d);
      }
      d.classCount += 1;
      if (!d.firstClass || start < d.firstClass.start) d.firstClass = { id: ev.id, start };
      if (!d.lastClass || start > d.lastClass.start) d.lastClass = { id: ev.id, start };
    }
  }

  const list = [...duties.values()].map((d) => ({ ...d, ...partStatus(findRecord(d.student, key), d.teacher._id, d) }));
  list.sort((a, b) => (a.student.name || '').localeCompare(b.student.name || ''));
  return { key, label: monthLabel(key), duties: list, unmatched, teachers, students };
};

// The student's monthly record for that month
const findRecord = (student, key) => (student.monthlyReports || []).find((r) => normMonth(r.monthYear) === key) || null;

// Did this teacher save their plan / report? (+ on time?)
const partStatus = (record, teacherId, duty) => {
  const out = { record, planDone: false, planAt: null, reportDone: false, reportAt: null, planOnTime: null, reportOnTime: null };
  if (!record) return out;
  const entries = record.savedBy || [];
  if (entries.length === 0) {
    // Saved before Step 5 (no "who saved" yet): counts as done for every teacher, time unknown
    out.planDone = true;
    out.reportDone = !!record.isFinalized;
    return out;
  }
  const mine = entries.find((e) => String(e.teacher) === String(teacherId));
  if (!mine) return out;
  out.planAt = mine.planSavedAt || mine.reportSavedAt || null;
  out.reportAt = mine.reportSavedAt || null;
  out.planDone = !!out.planAt;
  out.reportDone = !!out.reportAt;
  if (duty && out.planAt && duty.firstClass) out.planOnTime = dayIn(out.planAt, CAIRO_TZ) <= dayIn(duty.firstClass.start, CAIRO_TZ);
  if (duty && out.reportAt && duty.lastClass) out.reportOnTime = dayIn(out.reportAt, CAIRO_TZ) <= dayIn(duty.lastClass.start, CAIRO_TZ);
  return out;
};

module.exports = {
  GO_LIVE,
  STUDENT_TZ,
  CAIRO_TZ,
  DAY_MS,
  dayIn,
  monthIn,
  shiftMonth,
  monthLabel,
  normMonth,
  listMonthEvents,
  buildMonthDuties,
  findRecord,
  partStatus
};
