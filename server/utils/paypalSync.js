// ==========================================
// 💳 STEP 17: PAYPAL CYCLES SYNC (preview → apply, then daily)
// ==========================================
// Decided with Ayman (21 Nov, option C): every student's cycle comes from PayPal itself.
// - Subscription (I-…): cycle = next billing time minus one plan interval → next billing time.
//   Paid = the last payment is inside this cycle and no failed payments.
// - Recurring invoice series (RI-…): cycle = next send date minus one interval → next send date.
//   Paid = this cycle's invoice (same series, invoice date = cycle start) is PAID / MARKED_AS_PAID.
// Works for any length: 28 days, 84 days, 336 days (48 weeks) or a calendar year.
// Apply keeps a backup of the old values (CycleSyncBackup). PayPal is only READ, never changed.

const User = require('../models/User');
const Setting = require('../models/Setting');
const CycleSyncBackup = require('../models/CycleSyncBackup');
const PP = require('./paypalApi');
const A = require('./availability');
const { shiftInterval } = require('./cycleCalc');

const DAILY_KEY = 'paypalDailySync';
const LAST_KEY = 'paypalLastSync';
const DAY = A.DAY;
const TZ = A.STUDENT_TZ;
const MATCH_DAYS = 3;          // an invoice dated within 3 days of the cycle start belongs to this cycle
const MAX_INVOICE_PAGES = 25;  // 100 invoices per page, newest first
const PAID = ['PAID', 'MARKED_AS_PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'];
const UNPAID = ['SENT', 'UNPAID', 'PARTIALLY_PAID', 'PAYMENT_PENDING'];

const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const sameDayish = (a, b) => Math.abs(new Date(a) - new Date(b)) <= MATCH_DAYS * DAY;

// PayPal interval → the LMS "Billing cycle" setting
const cycleSetting = (unit, count) => {
  const days = unit === 'DAY' ? count : unit === 'WEEK' ? count * 7 : null;
  if (days === 28) return 'monthly';
  if (days === 84) return 'quarterly';
  if (days === 168) return 'semiannual';
  if (days === 336) return 'yearly';
  if ((unit === 'YEAR' && count === 1) || (unit === 'MONTH' && count === 12)) return 'calendar_year';
  return null;
};
const everyLabel = (unit, count) => {
  const days = unit === 'DAY' ? count : unit === 'WEEK' ? count * 7 : null;
  if (days === 28) return '28 days';
  if (days === 84) return '84 days (quarter)';
  if (days === 168) return '168 days (half year)';
  if (days === 336) return '336 days (year of weeks)';
  if (unit === 'YEAR' && count === 1) return 'calendar year';
  return `${count} ${String(unit || '').toLowerCase()}(s)`;
};

// Small pool so we do not hit PayPal with 40 calls at once
const runPool = async (items, size, fn) => {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
};

// ---------- read one PayPal billing ----------
const readSubscription = async (id, planCache) => {
  const r = await PP.getSubscription(id);
  let freq = null;
  if (r.plan_id) {
    planCache[r.plan_id] = planCache[r.plan_id] || PP.getPlan(r.plan_id);
    const plan = await planCache[r.plan_id];
    const regular = (plan.billing_cycles || []).find((c) => c.tenure_type === 'REGULAR') || (plan.billing_cycles || [])[0] || {};
    freq = regular.frequency || null;
  }
  const bi = r.billing_info || {};
  const next = bi.next_billing_time ? new Date(bi.next_billing_time) : null;
  const lastPaid = bi.last_payment && bi.last_payment.time ? new Date(bi.last_payment.time) : null;
  const failed = bi.failed_payments_count || 0;
  if (!freq) return { status: r.status, problem: 'PayPal plan interval not found.' };
  let start = next ? shiftInterval(next, freq.interval_unit, freq.interval_count, -1) : null;
  let end = next;
  if (!next && lastPaid) { start = lastPaid; end = shiftInterval(lastPaid, freq.interval_unit, freq.interval_count, 1); }
  if (!start) return { status: r.status, problem: 'PayPal gave no billing dates.' };
  const paid = lastPaid ? (lastPaid.getTime() >= start.getTime() - 2 * DAY && failed === 0) : null;
  return { status: r.status, unit: freq.interval_unit, count: freq.interval_count, start, end, lastPaid, failed, paid, payLink: null };
};

const readSeries = async (id) => {
  const r = await PP.getSeries(id);
  const pd = r.plan_detail || {};
  const f = pd.frequency || {};
  if (!pd.next_occurrence_date || !f.interval_unit) return { status: r.status, problem: 'PayPal gave no next send date for this series.' };
  const end = A.zonedToUtc(pd.next_occurrence_date, '00:00', TZ);
  const start = shiftInterval(end, f.interval_unit, f.interval_count, -1);
  return { status: r.status, unit: f.interval_unit, count: f.interval_count, start, end, seriesStarted: pd.start_series_date || null };
};

// Newest invoices first; stops once we are older than the earliest cycle we need
const loadInvoiceIndex = async (seriesIds, oldestNeeded) => {
  const wanted = new Set(seriesIds);
  const index = {};
  for (let page = 1; page <= MAX_INVOICE_PAGES; page++) {
    const data = await PP.listInvoices(page);
    const items = data.items || [];
    items.forEach((inv) => {
      const sid = inv.recurring_Id || inv.recurring_id;
      if (!sid || !wanted.has(sid)) return;
      (index[sid] = index[sid] || []).push({ id: inv.id, status: inv.status, date: inv.detail && inv.detail.invoice_date });
    });
    const dates = items.map((i) => i.detail && i.detail.invoice_date).filter(Boolean).sort();
    if (!items.length || page >= (data.total_pages || 1) || (dates[0] && new Date(dates[0]) < new Date(oldestNeeded.getTime() - (MATCH_DAYS + 1) * DAY))) break;
  }
  return index;
};

// ---------- preview (reads only) ----------
const buildPreview = async () => {
  if (!PP.hasKeys()) throw new Error('PayPal keys are missing on the server.');
  const students = await User.find({ role: 'student' });
  const planCache = {};
  const subCache = {};
  const seriesCache = {};
  const linkOf = (s) => {
    const p = s.paypal || {};
    if (p.billingType === 'subscription' && (p.subscriptionId || '').trim()) return { kind: 'subscription', id: p.subscriptionId.trim() };
    if (p.billingType === 'recurring_invoice' && (p.recurringSeriesId || '').trim()) return { kind: 'invoice', id: p.recurringSeriesId.trim() };
    return null;
  };

  // 1) one read per PayPal billing (siblings sharing one series / subscription are read once)
  const linked = students.filter(linkOf);
  await runPool(linked, 5, async (s) => {
    const l = linkOf(s);
    const cache = l.kind === 'subscription' ? subCache : seriesCache;
    if (cache[l.id]) return;
    cache[l.id] = (l.kind === 'subscription' ? readSubscription(l.id, planCache) : readSeries(l.id))
      .catch((e) => ({ problem: PP.errorText(e) }));
    await cache[l.id];
  });

  // 2) paid / not paid for invoice series: this cycle's invoice
  const seriesIds = Object.keys(seriesCache);
  const seriesData = {};
  for (const id of seriesIds) seriesData[id] = await seriesCache[id];
  const starts = Object.values(seriesData).filter((d) => d.start).map((d) => d.start.getTime());
  let invoiceIndex = {};
  let invoiceProblem = null;
  if (starts.length) {
    try {
      invoiceIndex = await loadInvoiceIndex(seriesIds, new Date(Math.min(...starts)));
    } catch (e) {
      invoiceProblem = `Could not read invoices: ${PP.errorText(e)}`;
    }
  }
  const linkCache = {};
  for (const id of seriesIds) {
    const d = seriesData[id];
    if (!d.start) continue;
    const inv = (invoiceIndex[id] || []).filter((i) => i.date && sameDayish(i.date, d.start))
      .sort((a, b) => Math.abs(new Date(a.date) - d.start) - Math.abs(new Date(b.date) - d.start))[0];
    d.invoiceStatus = inv ? inv.status : null;
    d.paid = inv ? (PAID.includes(inv.status) ? true : UNPAID.includes(inv.status) ? false : null) : null;
    d.payLink = null;
    if (d.paid === false) {
      try {
        linkCache[inv.id] = linkCache[inv.id] || PP.getInvoice(inv.id);
        const full = await linkCache[inv.id];
        d.payLink = (full.detail && full.detail.metadata && full.detail.metadata.recipient_view_url) || null;
      } catch (e) { /* no link → the card just says payment is due */ }
    }
  }

  // 3) one row per student
  const rows = [];
  for (const s of students) {
    const sub = s.subscription || {};
    const p = s.paypal || {};
    const base = {
      id: String(s._id), name: (s.name || '').trim(), type: p.billingType || 'none',
      lms: { start: day(sub.startDate), end: day(sub.endDate), cycle: p.billingCycle || null },
      paused: !!(s.pause && s.pause.kind === 'full')
    };
    const l = linkOf(s);
    if (!l) { rows.push({ ...base, linked: false, problem: null, note: 'Not linked to PayPal (not changed).' }); continue; }
    const d = await (l.kind === 'subscription' ? subCache[l.id] : seriesCache[l.id]);
    if (d.problem) { rows.push({ ...base, linked: true, problem: d.problem }); continue; }
    const setting = cycleSetting(d.unit, d.count);
    const row = {
      ...base, linked: true, problem: null,
      paypalStatus: d.status,
      every: everyLabel(d.unit, d.count), unit: d.unit, count: d.count,
      cycleStart: d.start, cycleEnd: d.end, start: day(d.start), end: day(d.end),
      paid: d.paid === undefined ? null : d.paid, invoiceStatus: d.invoiceStatus || null, payLink: d.payLink || null,
      lastPaid: day(d.lastPaid), failedPayments: d.failed || 0,
      newCycleSetting: setting || p.billingCycle || null
    };
    if (d.status && d.status !== 'ACTIVE') row.problem = `PayPal status is ${d.status} (not changed; please check).`;
    if (base.paused) row.note = 'Fully paused (not changed).';
    row.changes = !row.problem && !base.paused && (row.start !== base.lms.start || row.end !== base.lms.end || row.newCycleSetting !== base.lms.cycle);
    rows.push(row);
  }
  rows.sort((a, b) => Number(!!b.problem) - Number(!!a.problem) || Number(b.linked) - Number(a.linked) || a.name.localeCompare(b.name));
  const counts = {
    students: rows.length,
    linked: rows.filter((r) => r.linked).length,
    willUpdate: rows.filter((r) => r.linked && !r.problem && !r.paused).length,
    unpaid: rows.filter((r) => r.paid === false).length,
    problems: rows.filter((r) => r.problem).length
  };
  return { rows, counts, invoiceProblem, at: new Date() };
};

// ---------- apply (writes the LMS only) ----------
const apply = async ({ source = 'button', by = null } = {}) => {
  const preview = await buildPreview();
  const now = new Date();
  let updated = 0;
  for (const row of preview.rows) {
    if (!row.linked || row.problem || row.paused) continue;
    const s = await User.findById(row.id);
    if (!s) continue;
    if (!s.subscription) s.subscription = {};
    if (!s.paypal) s.paypal = {};
    const before = {
      startDate: s.subscription.startDate, endDate: s.subscription.endDate, status: s.subscription.status,
      billingCycle: s.paypal.billingCycle, cycleUnit: s.paypal.cycleUnit, cycleCount: s.paypal.cycleCount,
      currentCyclePaid: s.paypal.currentCyclePaid, lastInvoiceUrl: s.paypal.lastInvoiceUrl, lastPaidAt: s.paypal.lastPaidAt
    };
    s.subscription.startDate = row.cycleStart;
    s.subscription.endDate = row.cycleEnd;
    if (s.subscription.status !== 'paused') s.subscription.status = 'active';
    s.paypal.cycleStartDate = row.cycleStart;
    s.paypal.cycleEndDate = row.cycleEnd;
    s.paypal.nextBillingDate = row.cycleEnd;
    s.paypal.cycleUnit = row.unit;
    s.paypal.cycleCount = row.count;
    if (row.newCycleSetting) s.paypal.billingCycle = row.newCycleSetting;
    s.paypal.currentCyclePaid = row.paid;
    s.paypal.lastInvoiceUrl = row.payLink || '';
    if (row.lastPaid && row.paid) s.paypal.lastPaidAt = new Date(row.lastPaid);
    s.paypal.lastSyncedAt = now;
    const after = {
      startDate: s.subscription.startDate, endDate: s.subscription.endDate, status: s.subscription.status,
      billingCycle: s.paypal.billingCycle, cycleUnit: row.unit, cycleCount: row.count, currentCyclePaid: row.paid, lastInvoiceUrl: s.paypal.lastInvoiceUrl
    };
    await s.save();
    await CycleSyncBackup.create({ student: s._id, studentName: row.name, before, after, source, by });
    updated++;
  }
  const summary = { at: now, source, updated, unpaid: preview.counts.unpaid, problems: preview.rows.filter((r) => r.problem).map((r) => `${r.name}: ${r.problem}`), invoiceProblem: preview.invoiceProblem };
  await Setting.findOneAndUpdate({ key: LAST_KEY }, { value: summary }, { upsert: true });
  return { ...summary, rows: preview.rows };
};

// ---------- daily switch ----------
const getStatus = async () => {
  const [daily, last] = await Promise.all([Setting.findOne({ key: DAILY_KEY }), Setting.findOne({ key: LAST_KEY })]);
  return { dailyOn: !!(daily && daily.value === true), last: last ? last.value : null, keys: PP.hasKeys() };
};
const setDaily = async (on) => {
  await Setting.findOneAndUpdate({ key: DAILY_KEY }, { value: !!on }, { upsert: true });
  return getStatus();
};
const runDaily = async () => {
  try {
    const status = await getStatus();
    if (!status.dailyOn) return;
    const r = await apply({ source: 'daily' });
    console.log(`💳 PayPal daily sync: ${r.updated} students updated, ${r.unpaid} unpaid, ${r.problems.length} problems`);
  } catch (e) {
    console.error('💳 PayPal daily sync failed:', e.message);
  }
};

module.exports = { buildPreview, apply, getStatus, setDaily, runDaily, cycleSetting, everyLabel, DAILY_KEY, LAST_KEY };
