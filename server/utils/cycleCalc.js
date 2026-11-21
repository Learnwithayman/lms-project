// ==========================================
// 🔄 STEP 17: CLASSES DONE / REMAINING (calculated, not a +1 counter)
// ==========================================
// Decided with Ayman (21 Nov):
// 1) Cycle start = PayPal date saved on the student (invoice SENT date / subscription payment date).
//    The cycle ALWAYS renews on its date (28 days, or the student's billing cycle), paid or not.
// 2) Not paid yet → "Payment due" (with the invoice's pay link when we have it).
// 3) Weekly pattern = the student's 5 classes before today + 5 after on Google Calendar;
//    a day + time seen at least twice is part of the pattern (one-off makeups are ignored).
// 4) The pattern is laid over the cycle → expected class dates.
// 5) A date before now = done (Absent included). Postponed = not counted (makeup credit).
//    Cancelled with credit = not counted; cancelled without credit = counted. Moved = counted at the new time.
// 6) TOTAL = the package number saved on the student (Q = A); if the pattern gives a different
//    number, the admin sees a flag.

const ClassChange = require('../models/ClassChange');
const A = require('./availability');
const { parseEventStudent, classBelongsToStudent } = require('./classMatch');

const CYCLE_DAYS = { monthly: 28, quarterly: 84, semiannual: 168, yearly: 336 };
const TZ = A.STUDENT_TZ;          // student classes are anchored to New York time
const DAY = A.DAY;
const SAMPLE = 5;                 // 5 classes before today + 5 after
const MIN_REPEAT = 2;             // a day + time must repeat to count as the pattern
const PAY_GRACE_DAYS = 2;         // a payment up to 2 days before the cycle start counts for it
const LOOK_BACK_DAYS = 70;        // calendar window used to find the pattern
const LOOK_AHEAD_DAYS = 45;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const cycleDaysOf = (s) => CYCLE_DAYS[s.paypal && s.paypal.billingCycle] || CYCLE_DAYS.monthly;

// Moves a date by one PayPal interval (DAY / WEEK / MONTH / YEAR × count); calendar-aware for months and years
const shiftInterval = (date, unit, count, dir = 1) => {
  const d = new Date(date);
  const n = (Number(count) || 1) * dir;
  if (unit === 'DAY') return new Date(d.getTime() + n * DAY);
  if (unit === 'WEEK') return new Date(d.getTime() + n * 7 * DAY);
  if (unit === 'MONTH') { d.setUTCMonth(d.getUTCMonth() + n); return d; }
  if (unit === 'YEAR') { d.setUTCFullYear(d.getUTCFullYear() + n); return d; }
  return null;
};

// One cycle step for this student: PayPal's own interval when synced, else the saved billing cycle
const stepOf = (s) => {
  const p = s.paypal || {};
  if (p.cycleUnit && p.cycleCount) return (d, dir = 1) => shiftInterval(d, p.cycleUnit, p.cycleCount, dir);
  if (p.billingCycle === 'calendar_year') return (d, dir = 1) => shiftInterval(d, 'YEAR', 1, dir);
  return (d, dir = 1) => new Date(new Date(d).getTime() + dir * cycleDaysOf(s) * DAY);
};

// The cycle we are in now: saved start → saved end (PayPal's next billing date), then moved forward
// one cycle at a time if PayPal has not been read since (the cycle always renews on its date)
const currentCycle = (s, now) => {
  const saved = s.subscription && s.subscription.startDate;
  if (!saved) return null;
  const step = stepOf(s);
  let start = new Date(saved);
  const savedEnd = s.subscription.endDate ? new Date(s.subscription.endDate) : null;
  let end = savedEnd && savedEnd > start ? savedEnd : step(start, 1);
  let rolled = 0;
  while (end <= now && rolled < 500) { start = end; end = step(end, 1); rolled++; }
  return { start, end, rolled };
};

const lower = (t) => (t || '').toLowerCase().trim();
const nameIn = (text, name) => {
  const full = lower(name);
  const first = full.split(/\s+/)[0] || '';
  const hay = lower(text);
  return !!full && (hay.includes(full) || (first.length >= 3 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay)));
};

// Is this class this student's? Siblings sharing one group link: the class must name the student.
const belongsTo = (ev, student, students) => {
  const parsed = parseEventStudent(ev);
  if (!classBelongsToStudent(parsed, student)) return false;
  const others = students.filter((o) => String(o._id) !== String(student._id) && classBelongsToStudent(parsed, o));
  if (!others.length) return true;
  return nameIn(`${parsed.name || ''} ${ev.summary || ''}`, student.name);
};

const slotOf = (date) => {
  const day = A.dayIn(date, TZ);
  const hm = new Date(date).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return { weekday: A.weekdayOf(day), hm };
};

// Weekly pattern from the 5 classes before now and the 5 after
const findPattern = (events, now) => {
  const sorted = [...events].sort((a, b) => A.eventStart(a) - A.eventStart(b));
  const past = sorted.filter((e) => A.eventStart(e) < now).slice(-SAMPLE);
  const future = sorted.filter((e) => A.eventStart(e) >= now).slice(0, SAMPLE);
  const counts = new Map();
  [...past, ...future].forEach((ev) => {
    const { weekday, hm } = slotOf(A.eventStart(ev));
    const key = `${weekday}|${hm}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const slots = [...counts]
    .filter(([, n]) => n >= MIN_REPEAT)
    .map(([key]) => { const [w, hm] = key.split('|'); return { weekday: Number(w), hm }; })
    .sort((a, b) => a.weekday - b.weekday || a.hm.localeCompare(b.hm));
  return { slots, sampleSize: past.length + future.length };
};

// Pattern laid over the cycle → expected class times
const expectedTimes = (slots, cycle) => {
  const out = [];
  let day = A.dayIn(cycle.start, TZ);
  const lastDay = A.dayIn(new Date(cycle.end.getTime() - 1), TZ);
  while (day <= lastDay) {
    const wd = A.weekdayOf(day);
    slots.filter((s) => s.weekday === wd).forEach((s) => {
      const at = A.zonedToUtc(day, s.hm, TZ);
      if (at >= cycle.start && at < cycle.end) out.push(at);
    });
    day = A.addDays(day, 1);
  }
  return out.sort((a, b) => a - b);
};

// Postpones / cancels / moves logged by the app change the expected list
const applyChanges = (times, changes) => {
  const list = times.map((at) => ({ at, original: at, note: '' }));
  const sameDay = (a, b) => A.dayIn(a, TZ) === A.dayIn(b, TZ);
  const sorted = [...changes].sort((a, b) => new Date(a.oldStart) - new Date(b.oldStart));
  for (const ch of sorted) {
    if (!ch.oldStart) continue;
    const old = new Date(ch.oldStart);
    const item = list.find((c) => !c.removed && sameDay(c.original, old));
    if (!item) continue;
    if (ch.action === 'postpone' || (ch.action === 'cancel' && ch.credit)) {
      item.removed = true;
      item.note = ch.action === 'postpone' ? 'Postponed (makeup credit)' : 'Cancelled with credit';
    } else if (ch.action === 'cancel') {
      item.note = 'Cancelled, counted';
    } else if (ch.action === 'move' && ch.newStart) {
      item.at = new Date(ch.newStart);
      item.note = 'Moved';
    }
  }
  return list;
};

// Payment due? Only when the saved PayPal dates prove it (old students without dates are never flagged)
const paymentInfo = (s, cycle) => {
  const p = s.paypal || {};
  const type = p.billingType;
  if (!cycle || !type || type === 'none') return { due: false, known: false };
  // 💳 Read from PayPal by the sync (paid / not paid for THIS cycle); only while that cycle is still current
  if (p.lastSyncedAt && !cycle.rolled && (p.currentCyclePaid === true || p.currentCyclePaid === false)) {
    const due = p.currentCyclePaid === false;
    return { due, known: true, link: due ? (p.lastInvoiceUrl || null) : null };
  }
  const paid = p.lastPaidAt ? new Date(p.lastPaidAt).getTime() : null;
  const sent = p.lastInvoiceSentAt ? new Date(p.lastInvoiceSentAt).getTime() : null;
  const from = cycle.start.getTime() - PAY_GRACE_DAYS * DAY;
  if (type === 'recurring_invoice') {
    if (!sent || sent < from) return { due: false, known: false }; // no invoice notice for this cycle yet
    const due = !paid || paid < sent;
    return { due, known: true, link: due ? (p.lastInvoiceUrl || null) : null };
  }
  if (type === 'subscription') {
    if (!paid) return { due: false, known: false };
    return { due: paid < from, known: true, link: null };
  }
  return { due: false, known: false };
};

const fmtDay = (d) => new Date(d).toLocaleDateString('en-US', { timeZone: TZ, dateStyle: 'medium' });

// Main: works out the student's current cycle. Never throws for calendar problems (falls back).
// Options let callers pass already-loaded events / students (and tests pass fakes).
const buildCycle = async (student, opts = {}) => {
  const now = opts.now || new Date();
  const s = student;
  const sub = s.subscription || {};
  const base = { savedUsed: sub.classesUsed || 0, savedTotal: sub.totalClassesBought || 0, savedStatus: sub.status || 'none' };

  if (s.pause && s.pause.kind === 'full') return { ...base, mode: 'paused', flags: [] };

  const cycle = currentCycle(s, now);
  if (!cycle) return { ...base, mode: 'no-start', flags: ['No cycle start date saved yet (set it in the wallet, or it comes with the next PayPal notice).'] };

  const pay = paymentInfo(s, cycle);
  const flags = [];
  if (cycle.rolled && !pay.known && s.paypal && s.paypal.billingType && s.paypal.billingType !== 'none') {
    flags.push('No PayPal notice received for this cycle yet; please check PayPal.');
  }

  let mine = [];
  try {
    const events = opts.events || await A.listEvents(now.getTime() - LOOK_BACK_DAYS * DAY, now.getTime() + LOOK_AHEAD_DAYS * DAY);
    const students = opts.students || (await A.loadPeople()).students;
    mine = events.filter((ev) => belongsTo(ev, s, students));
  } catch (err) {
    console.error('Cycle calculation: calendar error:', err.message);
    return { ...base, mode: 'error', cycleStart: cycle.start, cycleEnd: cycle.end, paymentDue: pay.due, payLink: pay.link || null, flags: ['Could not read Google Calendar right now.'] };
  }

  const pattern = findPattern(mine, now);
  if (!pattern.slots.length) {
    return { ...base, mode: 'no-pattern', cycleStart: cycle.start, cycleEnd: cycle.end, paymentDue: pay.due, payLink: pay.link || null, flags: [...flags, 'No repeating weekly class found on the calendar (5 before + 5 after today).'] };
  }

  const times = expectedTimes(pattern.slots, cycle);
  const changes = opts.changes || await ClassChange.find({ student: s._id, oldStart: { $gte: new Date(cycle.start.getTime() - DAY), $lt: cycle.end } });
  const list = applyChanges(times, changes);
  const counted = list.filter((c) => !c.removed);
  const done = counted.filter((c) => c.at < now).length;
  const patternCount = times.length;
  const total = base.savedTotal > 0 ? base.savedTotal : patternCount;
  if (base.savedTotal > 0 && patternCount !== base.savedTotal) {
    flags.push(`The calendar pattern gives ${patternCount} classes this cycle, but the package is ${base.savedTotal}. Please check.`);
  }
  if (base.savedTotal <= 0) flags.push(`No package number saved; using the calendar pattern (${patternCount}).`);

  return {
    ...base,
    mode: 'calculated',
    cycleStart: cycle.start,
    cycleEnd: cycle.end,
    rolled: cycle.rolled,
    total,
    done: Math.min(done, total),
    remaining: Math.max(total - done, 0),
    patternCount,
    pattern: pattern.slots.map((p) => `${WEEKDAYS[p.weekday]} ${p.hm}`),
    paymentDue: pay.due,
    payLink: pay.link || null,
    classes: list.map((c) => ({ at: c.at, done: !c.removed && c.at < now, counted: !c.removed, note: c.note })),
    flags
  };
};

// Subscription object shown on the student dashboard (calculated values when we have them)
const shownSubscription = (student, result) => {
  const sub = (student.subscription && (student.subscription.toObject ? student.subscription.toObject() : student.subscription)) || { status: 'none', totalClassesBought: 0, classesUsed: 0 };
  if (result.mode === 'paused') return { ...sub, status: 'paused' };
  if (result.mode !== 'calculated') {
    return result.cycleStart ? { ...sub, status: sub.status === 'expired' ? 'active' : sub.status, startDate: result.cycleStart, endDate: result.cycleEnd } : sub;
  }
  return { ...sub, status: 'active', classesUsed: result.done, totalClassesBought: result.total, startDate: result.cycleStart, endDate: result.cycleEnd };
};

module.exports = {
  buildCycle, shownSubscription,
  // exported for tests
  currentCycle, findPattern, expectedTimes, applyChanges, paymentInfo, belongsTo, fmtDay, CYCLE_DAYS, shiftInterval
};
