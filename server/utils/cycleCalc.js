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

// Day + time of a class in ITS OWN time zone (the one on the calendar event, e.g. Europe/Istanbul).
// Reading everything in New York time broke on clock changes: 14:00 Istanbul is 07:00 New York before
// the US clock change and 06:00 after, which looked like two different weekly classes (Hamza, 21 Nov).
const zoneOf = (ev) => {
  const tz = ev && ev.start && ev.start.timeZone;
  try { if (tz) { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } } catch (e) { /* unknown zone → New York */ }
  return TZ;
};
const slotOf = (date, tz = TZ) => {
  const day = A.dayIn(date, tz);
  const hm = new Date(date).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return { weekday: A.weekdayOf(day), hm };
};
const zoneLabel = (tz) => (tz === TZ ? '' : ` (${String(tz).split('/').pop().replace(/_/g, ' ')})`);

// Weekly pattern from the 5 classes before now and the 5 after
const findPattern = (events, now) => {
  const sorted = [...events].sort((a, b) => A.eventStart(a) - A.eventStart(b));
  const past = sorted.filter((e) => A.eventStart(e) < now).slice(-SAMPLE);
  const future = sorted.filter((e) => A.eventStart(e) >= now).slice(0, SAMPLE);
  const counts = new Map();
  [...past, ...future].forEach((ev) => {
    const tz = zoneOf(ev);
    const { weekday, hm } = slotOf(A.eventStart(ev), tz);
    const key = `${weekday}|${hm}|${tz}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const slots = [...counts]
    .filter(([, n]) => n >= MIN_REPEAT)
    .map(([key]) => { const [w, hm, tz] = key.split('|'); return { weekday: Number(w), hm, tz }; })
    .sort((a, b) => a.weekday - b.weekday || a.hm.localeCompare(b.hm));
  return { slots, sampleSize: past.length + future.length };
};

// Pattern laid over the cycle → expected class times (each slot in its own time zone)
const expectedTimes = (slots, cycle) => {
  const out = [];
  slots.forEach((s) => {
    const tz = s.tz || TZ;
    let day = A.dayIn(cycle.start, tz);
    const lastDay = A.dayIn(new Date(cycle.end.getTime() - 1), tz);
    while (day <= lastDay) {
      if (A.weekdayOf(day) === s.weekday) {
        const at = A.zonedToUtc(day, s.hm, tz);
        if (at >= cycle.start && at < cycle.end) out.push(at);
      }
      day = A.addDays(day, 1);
    }
  });
  return out.sort((a, b) => a - b);
};

// Postpones / cancels / moves logged by the app change the expected list
const MATCH_HOURS = 12; // a change belongs to the expected class within 12 hours of its original time
const applyChanges = (times, changes) => {
  const list = times.map((at) => ({ at, original: at, note: '' }));
  const near = (a, b) => Math.abs(new Date(a) - new Date(b)) <= MATCH_HOURS * 60 * 60 * 1000;
  const sorted = [...changes].sort((a, b) => new Date(a.oldStart) - new Date(b.oldStart));
  for (const ch of sorted) {
    if (!ch.oldStart) continue;
    const old = new Date(ch.oldStart);
    const item = list.filter((c) => !c.removed && near(c.original, old)).sort((a, b) => Math.abs(a.original - old) - Math.abs(b.original - old))[0];
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

// 🧾 Step 18: "Monthly after-pay" (e.g. Joud and Layan): the month runs from the 26th to the 25th (New York time)
const pad2 = (n) => String(n).padStart(2, '0');
const afterPayCycle = (now) => {
  const [y, m, d] = A.dayIn(now, TZ).split('-').map(Number);
  let sy = y; let sm = m;
  if (d < 26) { sm -= 1; if (sm === 0) { sm = 12; sy -= 1; } }
  let ey = sy; let em = sm + 1;
  if (em === 13) { em = 1; ey += 1; }
  return { start: A.zonedToUtc(`${sy}-${pad2(sm)}-26`, '00:00', TZ), end: A.zonedToUtc(`${ey}-${pad2(em)}-26`, '00:00', TZ), rolled: 0 };
};

const PACKAGE_LOOK_AHEAD_DAYS = 120;
const DEFAULT_PACKAGE_SIZE = 4;

// 📦 Step 18: "Package by classes" (e.g. Hamza Hamwi): renews after every N completed classes, paid outside PayPal.
// Classes are counted from the saved start (first class of the first tracked package). "Mark as paid" adds one package.
const packageResult = async (s, { base, flags, slots, now, opts }) => {
  const size = base.savedTotal > 0 ? base.savedTotal : DEFAULT_PACKAGE_SIZE;
  if (!(base.savedTotal > 0)) flags.push(`No package size saved; using ${DEFAULT_PACKAGE_SIZE}.`);
  const paidPackages = Math.max(1, Number(s.paypal && s.paypal.packagesPaid) || 1);
  const start = new Date(s.subscription.startDate);
  const times = expectedTimes(slots, { start, end: new Date(now.getTime() + PACKAGE_LOOK_AHEAD_DAYS * DAY) });
  const changes = opts.changes || await ClassChange.find({ student: s._id, oldStart: { $gte: new Date(start.getTime() - DAY) } });
  const counted = applyChanges(times, changes).filter((c) => !c.removed).sort((a, b) => a.at - b.at);
  const used = counted.filter((c) => c.at < now).length;           // classes done since the start
  const paidUpTo = paidPackages * size;
  const index = Math.min(Math.floor(used / size), paidPackages - 1); // the package we are in now
  const first = index * size;
  const done = Math.min(used - first, size);
  const owed = Math.max(used - paidUpTo, 0);
  if (owed) flags.push(`${owed} class(es) taken after the paid package(s) ended.`);
  const inPackage = counted.slice(first, first + size);
  return {
    ...base,
    mode: 'calculated',
    billing: 'class_package',
    cycleStart: inPackage[0] ? inPackage[0].at : start,
    cycleEnd: inPackage[size - 1] ? inPackage[size - 1].at : null,
    rolled: 0,
    total: size,
    done,
    remaining: Math.max(size - done, 0),
    packagesPaid: paidPackages,
    classesSinceStart: used,
    owed,
    patternCount: size,
    pattern: slots.map((p) => `${WEEKDAYS[p.weekday]} ${p.hm}${zoneLabel(p.tz)}`),
    paymentDue: used >= paidUpTo,
    payLink: null,
    lastClassAt: used ? counted[used - 1].at : null,
    classes: inPackage.map((c) => ({ at: c.at, done: c.at < now, counted: true, note: c.note })),
    flags
  };
};

// Main: works out the student's current cycle. Never throws for calendar problems (falls back).
// Options let callers pass already-loaded events / students (and tests pass fakes).
const buildCycle = async (student, opts = {}) => {
  const now = opts.now || new Date();
  const s = student;
  const sub = s.subscription || {};
  const type = (s.paypal && s.paypal.billingType) || 'none';
  const base = { savedUsed: sub.classesUsed || 0, savedTotal: sub.totalClassesBought || 0, savedStatus: sub.status || 'none', billing: type };

  if (s.pause && s.pause.kind === 'full') return { ...base, mode: 'paused', flags: [] };

  const flags = [];
  let cycle = null;
  let pay = { due: false, known: true, link: null };
  if (type === 'class_package') {
    if (!sub.startDate) return { ...base, mode: 'no-start', flags: ['No package start date saved yet (set the date of the first class of the current package in the wallet).'] };
  } else if (type === 'after_pay_monthly') {
    cycle = afterPayCycle(now); // pays after the month: never "Payment due"
  } else {
    cycle = currentCycle(s, now);
    if (!cycle) return { ...base, mode: 'no-start', flags: ['No cycle start date saved yet (set it in the wallet, or it comes with the next PayPal notice).'] };
    pay = paymentInfo(s, cycle);
    if (cycle.rolled && !pay.known && type !== 'none') {
      flags.push('No PayPal notice received for this cycle yet; please check PayPal.');
    }
  }
  const cycleInfo = cycle ? { cycleStart: cycle.start, cycleEnd: cycle.end } : {};

  let mine = [];
  try {
    const events = opts.events || await A.listEvents(now.getTime() - LOOK_BACK_DAYS * DAY, now.getTime() + LOOK_AHEAD_DAYS * DAY);
    const students = opts.students || (await A.loadPeople()).students;
    mine = events.filter((ev) => belongsTo(ev, s, students));
  } catch (err) {
    console.error('Cycle calculation: calendar error:', err.message);
    return { ...base, mode: 'error', ...cycleInfo, paymentDue: pay.due, payLink: pay.link || null, flags: ['Could not read Google Calendar right now.'] };
  }

  const pattern = findPattern(mine, now);
  if (!pattern.slots.length) {
    return { ...base, mode: 'no-pattern', ...cycleInfo, paymentDue: pay.due, payLink: pay.link || null, flags: [...flags, 'No repeating weekly class found on the calendar (5 before + 5 after today).'] };
  }

  if (type === 'class_package') return packageResult(s, { base, flags, slots: pattern.slots, now, opts });

  const times = expectedTimes(pattern.slots, cycle);
  const changes = opts.changes || await ClassChange.find({ student: s._id, oldStart: { $gte: new Date(cycle.start.getTime() - DAY), $lt: cycle.end } });
  const list = applyChanges(times, changes);
  const counted = list.filter((c) => !c.removed);
  const done = counted.filter((c) => c.at < now).length;
  const patternCount = times.length;
  let total;
  if (type === 'after_pay_monthly') {
    total = counted.length; // they pay for the classes of the month, so the month's classes are the total
  } else {
    total = base.savedTotal > 0 ? base.savedTotal : patternCount;
    if (base.savedTotal > 0 && patternCount !== base.savedTotal) {
      flags.push(`The calendar pattern gives ${patternCount} classes this cycle, but the package is ${base.savedTotal}. Please check.`);
    }
    if (base.savedTotal <= 0) flags.push(`No package number saved; using the calendar pattern (${patternCount}).`);
  }

  return {
    ...base,
    mode: 'calculated',
    cycleStart: cycle.start,
    // after-pay: show the last day (the 25th), not the 26th the next month starts on
    cycleEnd: type === 'after_pay_monthly' ? new Date(cycle.end.getTime() - 60 * 1000) : cycle.end,
    rolled: cycle.rolled,
    total,
    done: Math.min(done, total),
    remaining: Math.max(total - done, 0),
    patternCount,
    pattern: pattern.slots.map((p) => `${WEEKDAYS[p.weekday]} ${p.hm}${zoneLabel(p.tz)}`),
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
  return { ...sub, status: 'active', classesUsed: result.done, totalClassesBought: result.total, startDate: result.cycleStart, endDate: result.cycleEnd || sub.endDate };
};

module.exports = {
  buildCycle, shownSubscription,
  // exported for tests
  currentCycle, findPattern, expectedTimes, applyChanges, paymentInfo, belongsTo, fmtDay, CYCLE_DAYS, shiftInterval, afterPayCycle
};
