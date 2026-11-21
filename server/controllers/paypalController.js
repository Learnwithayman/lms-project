const User = require('../models/User');
const PaypalEvent = require('../models/PaypalEvent');
const whatsappClient = require('../utils/whatsappBot');

// ==========================================
// 💳 PAYPAL ENGINE (Step 1)
// ==========================================
// How it works:
// - INVOICING.INVOICE.SENT  → a new cycle starts (from the invoice sent date), Phase 1 resets to 0,
//                             and the student group gets the "new cycle started" message + the invoice's payment link.
// - INVOICING.INVOICE.PAID  → only records the payment date. If the SENT notice for that invoice never arrived,
//                             the cycle is renewed here instead and the "payment received" message is sent.
// - PAYMENT.SALE.COMPLETED  → PayPal subscription (I-...) payment: renew + "payment received" message.
// - Late payment never stops a subscription.
// - Matching: 1) Recurring Series ID (RI-...), 2) saved Invoice ID (INV2-...), 3) invoice email
//             (recurring-invoice students only), 4) nothing → WhatsApp alert to the admin group.
// - Siblings: EVERY student with the same series / subscription ID is renewed. Each student group gets
//             the message once (siblings sharing one group get one message with all their names).
// - Cycle length: each student's "Billing cycle" (monthly 28 / quarterly 84 / half-year 168 / yearly 336 days).

const CYCLE_DAYS = { monthly: 28, quarterly: 84, semiannual: 168, yearly: 336 };
const MAX_SAVED_EVENT_IDS = 30;
const ADMIN_GROUP_TARGET = process.env.ADMIN_WHATSAPP_NUMBER || 'https://chat.whatsapp.com/BYFE1IPRs2KGJNhGaxvpJd';

// ---------- Small helpers ----------

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-US', { timeZone: 'Africa/Cairo', dateStyle: 'medium' });

// Looks through the whole notice for the first value matching a test (PayPal's field names can vary)
const deepFind = (obj, test, depth = 0) => {
  if (!obj || typeof obj !== 'object' || depth > 8) return null;
  for (const [key, value] of Object.entries(obj)) {
    if (test(key, value)) return value;
    if (value && typeof value === 'object') {
      const found = deepFind(value, test, depth + 1);
      if (found) return found;
    }
  }
  return null;
};

// Pulls the useful details out of an invoice notice
const readInvoice = (resource) => {
  const invoice = (resource && resource.invoice) || resource || {};
  const seriesId = deepFind(invoice, (k, v) => typeof v === 'string' && /^RI-[A-Z0-9]+$/.test(v));
  const paymentLink =
    invoice.detail?.metadata?.recipient_view_url ||
    deepFind(invoice, (k, v) => k === 'recipient_view_url' && typeof v === 'string');
  const email =
    invoice.primary_recipients?.[0]?.billing_info?.email_address ||
    deepFind(invoice.primary_recipients || {}, (k, v) => k === 'email_address' && typeof v === 'string');
  const amount = invoice.amount?.value
    ? `${invoice.amount.value} ${invoice.amount.currency_code || ''}`.trim()
    : 'Unknown';
  return { invoiceId: invoice.id, seriesId, paymentLink, email, amount };
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Finds ALL students an invoice belongs to (siblings share one series)
const findStudentsForInvoice = async ({ seriesId, invoiceId, email }) => {
  if (seriesId) {
    const users = await User.find({ 'paypal.recurringSeriesId': seriesId });
    if (users.length) return { users, matchedBy: 'seriesId' };
  }
  if (invoiceId) {
    const users = await User.find({ 'paypal.invoiceId': invoiceId });
    if (users.length) return { users, matchedBy: 'invoiceId' };
  }
  if (email) {
    const users = await User.find({
      role: 'student',
      'paypal.billingType': 'recurring_invoice',
      email: new RegExp(`^${escapeRegex(email.trim())}$`, 'i')
    });
    if (users.length) return { users, matchedBy: 'email' };
  }
  return { users: [], matchedBy: 'none' };
};

const cycleDaysFor = (user) => CYCLE_DAYS[user.paypal?.billingCycle] || CYCLE_DAYS.monthly;

// Starts a fresh cycle (length from the student's billing cycle) and resets Phase 1 (classes completed) to 0
const startNewCycle = (user, startDate) => {
  const start = new Date(startDate);
  const end = new Date(start.getTime() + cycleDaysFor(user) * 24 * 60 * 60 * 1000);

  if (!user.subscription) user.subscription = {};
  user.subscription.startDate = start;
  user.subscription.endDate = end;
  user.subscription.classesUsed = 0;
  user.subscription.status = 'active'; // 🔄 Step 17: a new cycle is always active (payment due is shown separately)

  if (!user.paypal) user.paypal = {};
  user.paypal.cycleStartDate = start;
  user.paypal.cycleEndDate = end;
  user.paypal.status = 'active';

  return { start, end };
};

const rememberEvent = (user, eventId) => {
  if (!eventId) return;
  const ids = (user.paypal.processedEventIds || []).filter((id) => id !== eventId);
  ids.push(eventId);
  user.paypal.processedEventIds = ids.slice(-MAX_SAVED_EVENT_IDS);
};

// ---------- WhatsApp messages (approved wording) ----------

const newCycleMessage = (name, start, end, paymentLink) =>
  `السلام عليكم / Assalamu Alaikum ${name}, 🌿\n\n` +
  `📅 Your new monthly cycle has started: *${formatDate(start)}* to *${formatDate(end)}*.\n` +
  `🧾 Your PayPal invoice for this cycle has been sent to your email.\n` +
  (paymentLink ? `💳 You can pay here: ${paymentLink}\n` : '') +
  `\nThank you for learning with us! 📚\nWarm regards,\nLearn With Ayman Support Team`;

const paymentReceivedMessage = (name, start, end) =>
  `السلام عليكم / Assalamu Alaikum ${name}, 🌿\n\n` +
  `✅ We've received your payment, thank you!\n` +
  `📅 Your new monthly cycle has started: *${formatDate(start)}* to *${formatDate(end)}*.\n\n` +
  `We look forward to your classes! 📚\nWarm regards,\nLearn With Ayman Support Team`;

const sendToAdmin = async (text) => {
  try {
    await whatsappClient.sendMessage(ADMIN_GROUP_TARGET, text);
  } catch (err) {
    console.log('PayPal: admin alert failed:', err.message);
  }
};

const joinNames = (names) =>
  names.length <= 1 ? (names[0] || '') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;

// Sends one message per student group. Siblings sharing a group get ONE message with all their names.
// Students without a group link → admin alert instead.
// renewed = [{ user, start, end }], buildText(name, start, end) → message text
const notifyGroups = async (renewed, buildText) => {
  const byGroup = new Map();
  for (const item of renewed) {
    const group = (item.user.studentGroupId || '').trim();
    if (!group) {
      await sendToAdmin(`⚠️ ${item.user.name} renewed but has no group link, so no message was sent.`);
      continue;
    }
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(item);
  }
  for (const [group, items] of byGroup) {
    const names = joinNames(items.map((i) => (i.user.name || '').trim()));
    try {
      await whatsappClient.sendMessage(group, buildText(names, items[0].start, items[0].end));
    } catch (err) {
      console.log(`PayPal: message to ${names}'s group failed:`, err.message);
    }
  }
};

const alertUnmatched = async (kind, details) => {
  await sendToAdmin(
    `⚠️ *PayPal ${kind} not matched*\n\n` +
    `💵 Amount: ${details.amount || 'Unknown'}\n` +
    `📧 Payer: ${details.email || 'Unknown'}\n` +
    `🧾 PayPal ID: ${details.id || 'Unknown'}\n\n` +
    `Please link this to the right student (series ID RI-... or subscription ID I-... in the student's 💳 billing box).`
  );
};

// ⏸️ Step 3: a PayPal bill for a FULLY paused student never starts a cycle → alert the admin instead
const isFullyPaused = (user) => user.pause?.kind === 'full';
const alertPaused = async (pausedUsers, kind, amount, id) => {
  if (!pausedUsers.length) return;
  await sendToAdmin(
    `⚠️ *PayPal ${kind} for a paused student*\n\n` +
    `👤 Student: ${joinNames(pausedUsers.map((u) => (u.name || '').trim()))}\n` +
    `💵 Amount: ${amount || 'Unknown'}\n` +
    `🧾 PayPal ID: ${id || 'Unknown'}\n\n` +
    `The cycle was NOT renewed because the student is paused. Please check the PayPal billing for this student.`
  );
};

const summary = (renewed, label) =>
  renewed.length
    ? `${label}: ${renewed.map((r) => `${(r.user.name || '').trim()} ${formatDate(r.start)} to ${formatDate(r.end)}`).join('; ')}`
    : null;

// ---------- Event handlers ----------

const handleInvoiceSent = async (event, details) => {
  const { users, matchedBy } = await findStudentsForInvoice(details);
  if (!users.length) {
    await alertUnmatched('invoice', { amount: details.amount, email: details.email, id: details.seriesId || details.invoiceId });
    return { users, matchedBy, result: 'No student matched: admin alerted' };
  }

  const sentAt = event.create_time ? new Date(event.create_time) : new Date();
  const renewed = [];
  const paused = [];
  for (const user of users) {
    if (!user.paypal) user.paypal = {};
    if (details.invoiceId && user.paypal.lastInvoiceId === details.invoiceId) continue; // already started this cycle
    if (isFullyPaused(user)) { paused.push(user); continue; } // ⏸️ no new cycle while paused
    const { start, end } = startNewCycle(user, sentAt);
    user.paypal.lastInvoiceId = details.invoiceId;
    user.paypal.lastInvoiceSentAt = sentAt;
    user.paypal.lastInvoiceUrl = details.paymentLink || ''; // 🔄 Step 17: "Pay here" button
    rememberEvent(user, event.id);
    await user.save();
    renewed.push({ user, start, end });
  }

  await notifyGroups(renewed, (name, start, end) => newCycleMessage(name, start, end, details.paymentLink));
  await alertPaused(paused, 'invoice', details.amount, details.seriesId || details.invoiceId);
  return { users, matchedBy, result: [summary(renewed, 'New cycle started'), paused.length ? `Paused (not renewed): ${paused.map((u) => u.name).join(', ')}` : null].filter(Boolean).join(' | ') || 'Invoice already started a cycle: skipped' };
};

const handleInvoicePaid = async (event, details) => {
  const { users, matchedBy } = await findStudentsForInvoice(details);
  if (!users.length) {
    // Only one alert per invoice: skip if this invoice was already reported as unmatched
    const alreadyAlerted = details.invoiceId
      ? await PaypalEvent.exists({ resourceId: details.invoiceId, matchedBy: 'none', eventId: { $ne: event.id } })
      : false;
    if (!alreadyAlerted) {
      await alertUnmatched('payment', { amount: details.amount, email: details.email, id: details.seriesId || details.invoiceId });
    }
    return { users, matchedBy, result: alreadyAlerted ? 'No student matched (already alerted)' : 'No student matched: admin alerted' };
  }

  const paidAt = event.create_time ? new Date(event.create_time) : new Date();
  const renewed = [];
  const paused = [];
  for (const user of users) {
    if (!user.paypal) user.paypal = {};
    user.paypal.lastPaidAt = paidAt;
    rememberEvent(user, event.id);

    // Normal case: the SENT notice already started the cycle → just record the payment
    if (details.invoiceId && user.paypal.lastInvoiceId === details.invoiceId) {
      await user.save();
      continue;
    }

    // ⏸️ Paused: record the payment, but no new cycle (admin is alerted below)
    if (isFullyPaused(user)) {
      await user.save();
      paused.push(user);
      continue;
    }

    // Fallback: SENT never arrived for this invoice → renew now
    const { start, end } = startNewCycle(user, paidAt);
    user.paypal.lastInvoiceId = details.invoiceId;
    user.paypal.lastInvoiceSentAt = user.paypal.lastInvoiceSentAt || paidAt;
    await user.save();
    renewed.push({ user, start, end });
  }

  await notifyGroups(renewed, paymentReceivedMessage);
  await alertPaused(paused, 'payment', details.amount, details.seriesId || details.invoiceId);
  return { users, matchedBy, result: [summary(renewed, 'Fallback renewal on payment'), paused.length ? `Paused (not renewed): ${paused.map((u) => u.name).join(', ')}` : null].filter(Boolean).join(' | ') || 'Payment date recorded' };
};

const handleSubscriptionPayment = async (event) => {
  const resource = event.resource || {};
  const subscriptionId = resource.billing_agreement_id;
  const amount = resource.amount?.total
    ? `${resource.amount.total} ${resource.amount.currency || ''}`.trim()
    : 'Unknown';

  const users = subscriptionId ? await User.find({ 'paypal.subscriptionId': subscriptionId }) : [];
  if (!users.length) {
    await alertUnmatched('subscription payment', { amount, email: null, id: subscriptionId || resource.id });
    return { users, matchedBy: 'none', result: 'No student matched: admin alerted' };
  }

  const paidAt = event.create_time ? new Date(event.create_time) : new Date();
  const renewed = [];
  const paused = [];
  for (const user of users) {
    if (!user.paypal) user.paypal = {};
    user.paypal.lastPaidAt = paidAt;
    rememberEvent(user, event.id);
    if (isFullyPaused(user)) { await user.save(); paused.push(user); continue; } // ⏸️ no new cycle while paused
    const { start, end } = startNewCycle(user, paidAt);
    await user.save();
    renewed.push({ user, start, end });
  }

  await notifyGroups(renewed, paymentReceivedMessage);
  await alertPaused(paused, 'subscription payment', amount, subscriptionId);
  return { users, matchedBy: 'subscriptionId', result: [summary(renewed, 'Subscription renewed'), paused.length ? `Paused (not renewed): ${paused.map((u) => u.name).join(', ')}` : null].filter(Boolean).join(' | ') };
};

// @desc    Handle incoming PayPal webhooks
// @route   POST /api/paypal/webhook
// @access  Public (called by PayPal)
const paypalWebhook = async (req, res) => {
  // Answer PayPal right away so it doesn't retry
  res.status(200).send('Webhook received');

  const event = req.body || {};
  if (!event.id || !event.event_type) return;

  const resource = event.resource || {};
  const resourceId = resource.invoice?.id || resource.billing_agreement_id || resource.id;

  // 🛡️ Save every notice. A duplicate event id means PayPal resent it → ignore.
  let record;
  try {
    record = await PaypalEvent.create({ eventId: event.id, eventType: event.event_type, resourceId, raw: event });
  } catch (err) {
    if (err.code === 11000) {
      console.log(`PayPal: duplicate notice ${event.id} ignored`);
      return;
    }
    console.error('PayPal: could not save notice:', err.message);
  }

  let outcome = { matchedBy: 'n/a', result: 'Recorded only' };
  try {
    switch (event.event_type) {
      case 'INVOICING.INVOICE.SENT':
        outcome = await handleInvoiceSent(event, readInvoice(resource));
        break;
      case 'INVOICING.INVOICE.PAID':
        outcome = await handleInvoicePaid(event, readInvoice(resource));
        break;
      case 'PAYMENT.SALE.COMPLETED':
        outcome = await handleSubscriptionPayment(event);
        break;
      default:
        // Everything else (unpaid, cancelled, reminders, subscription activated...) is only recorded.
        // Late payment never stops a subscription.
        break;
    }
  } catch (err) {
    console.error('PayPal webhook processing error:', err);
    outcome = { matchedBy: 'error', result: `Error: ${err.message}` };
  }

  if (record) {
    try {
      const matched = outcome.users || [];
      record.student = matched[0] ? matched[0]._id : undefined;
      record.students = matched.map((u) => u._id);
      record.matchedBy = outcome.matchedBy;
      record.result = outcome.result;
      await record.save();
    } catch (err) {
      console.error('PayPal: could not update notice record:', err.message);
    }
  }
  console.log(`PayPal ${event.event_type} (${resourceId}): ${outcome.result}`);
};

// @desc    Admin: mark a manual-payment student as paid and start a new cycle
// @route   POST /api/paypal/manual-renew/:id
// @access  Admin
const manualRenew = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Student not found' });

    const now = new Date();
    const { start, end } = startNewCycle(user, now);
    user.paypal.lastPaidAt = now;
    await user.save();

    res.status(200).json({
      message: `Marked as paid. New cycle: ${formatDate(start)} to ${formatDate(end)}`,
      subscription: user.subscription
    });
  } catch (error) {
    console.error('Manual renew error:', error);
    res.status(500).json({ message: 'Server error while renewing' });
  }
};

module.exports = { paypalWebhook, manualRenew };
