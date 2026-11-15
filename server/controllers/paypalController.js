const User = require('../models/User');
const PaypalEvent = require('../models/PaypalEvent');
const whatsappClient = require('../utils/whatsappBot');

// ==========================================
// 💳 PAYPAL ENGINE (Step 1)
// ==========================================
// How it works:
// - INVOICING.INVOICE.SENT  → a new 28-day cycle starts (from the invoice sent date), Phase 1 resets to 0,
//                             and the student group gets the "new cycle started" message + the invoice's payment link.
// - INVOICING.INVOICE.PAID  → only records the payment date. If the SENT notice for that invoice never arrived,
//                             the cycle is renewed here instead and the "payment received" message is sent.
// - PAYMENT.SALE.COMPLETED  → PayPal subscription (I-...) payment: renew + "payment received" message.
// - Late payment never stops a subscription.
// - Matching: 1) Recurring Series ID (RI-...), 2) saved Invoice ID (INV2-...), 3) invoice email
//             (recurring-invoice students only), 4) nothing → WhatsApp alert to the admin group.

const CYCLE_DAYS = 28;
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

// Finds the student an invoice belongs to
const findStudentForInvoice = async ({ seriesId, invoiceId, email }) => {
  if (seriesId) {
    const user = await User.findOne({ 'paypal.recurringSeriesId': seriesId });
    if (user) return { user, matchedBy: 'seriesId' };
  }
  if (invoiceId) {
    const user = await User.findOne({ 'paypal.invoiceId': invoiceId });
    if (user) return { user, matchedBy: 'invoiceId' };
  }
  if (email) {
    const user = await User.findOne({
      role: 'student',
      'paypal.billingType': 'recurring_invoice',
      email: new RegExp(`^${escapeRegex(email.trim())}$`, 'i')
    });
    if (user) return { user, matchedBy: 'email' };
  }
  return { user: null, matchedBy: 'none' };
};

// Starts a fresh 28-day cycle and resets Phase 1 (classes completed) to 0
const startNewCycle = (user, startDate) => {
  const start = new Date(startDate);
  const end = new Date(start.getTime() + CYCLE_DAYS * 24 * 60 * 60 * 1000);

  if (!user.subscription) user.subscription = {};
  user.subscription.startDate = start;
  user.subscription.endDate = end;
  user.subscription.classesUsed = 0;

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

// Student messages go to the group link only. No group link → tell the admin instead.
const sendToStudentGroup = async (user, text) => {
  if (!user.studentGroupId || !user.studentGroupId.trim()) {
    await sendToAdmin(`⚠️ ${user.name} renewed but has no group link, so no message was sent.`);
    return;
  }
  try {
    await whatsappClient.sendMessage(user.studentGroupId.trim(), text);
  } catch (err) {
    console.log(`PayPal: message to ${user.name}'s group failed:`, err.message);
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

// ---------- Event handlers ----------

const handleInvoiceSent = async (event, details) => {
  const { user, matchedBy } = await findStudentForInvoice(details);
  if (!user) {
    await alertUnmatched('invoice', { amount: details.amount, email: details.email, id: details.seriesId || details.invoiceId });
    return { matchedBy, result: 'No student matched: admin alerted' };
  }
  if (!user.paypal) user.paypal = {};

  if (details.invoiceId && user.paypal.lastInvoiceId === details.invoiceId) {
    return { user, matchedBy, result: 'Invoice already started a cycle: skipped' };
  }

  const sentAt = event.create_time ? new Date(event.create_time) : new Date();
  const { start, end } = startNewCycle(user, sentAt);
  user.paypal.lastInvoiceId = details.invoiceId;
  user.paypal.lastInvoiceSentAt = sentAt;
  rememberEvent(user, event.id);
  await user.save();

  await sendToStudentGroup(user, newCycleMessage(user.name, start, end, details.paymentLink));
  return { user, matchedBy, result: `New cycle started ${formatDate(start)} to ${formatDate(end)}` };
};

const handleInvoicePaid = async (event, details) => {
  const { user, matchedBy } = await findStudentForInvoice(details);
  if (!user) {
    // Only one alert per invoice: skip if this invoice was already reported as unmatched
    const alreadyAlerted = details.invoiceId
      ? await PaypalEvent.exists({ resourceId: details.invoiceId, matchedBy: 'none', eventId: { $ne: event.id } })
      : false;
    if (!alreadyAlerted) {
      await alertUnmatched('payment', { amount: details.amount, email: details.email, id: details.seriesId || details.invoiceId });
    }
    return { matchedBy, result: alreadyAlerted ? 'No student matched (already alerted)' : 'No student matched: admin alerted' };
  }
  if (!user.paypal) user.paypal = {};

  const paidAt = event.create_time ? new Date(event.create_time) : new Date();
  user.paypal.lastPaidAt = paidAt;
  rememberEvent(user, event.id);

  // Normal case: the SENT notice already started the cycle → just record the payment
  if (details.invoiceId && user.paypal.lastInvoiceId === details.invoiceId) {
    await user.save();
    return { user, matchedBy, result: 'Payment date recorded' };
  }

  // Fallback: SENT never arrived for this invoice → renew now
  const { start, end } = startNewCycle(user, paidAt);
  user.paypal.lastInvoiceId = details.invoiceId;
  user.paypal.lastInvoiceSentAt = user.paypal.lastInvoiceSentAt || paidAt;
  await user.save();

  await sendToStudentGroup(user, paymentReceivedMessage(user.name, start, end));
  return { user, matchedBy, result: `Fallback renewal on payment: ${formatDate(start)} to ${formatDate(end)}` };
};

const handleSubscriptionPayment = async (event) => {
  const resource = event.resource || {};
  const subscriptionId = resource.billing_agreement_id;
  const amount = resource.amount?.total
    ? `${resource.amount.total} ${resource.amount.currency || ''}`.trim()
    : 'Unknown';

  const user = subscriptionId ? await User.findOne({ 'paypal.subscriptionId': subscriptionId }) : null;
  if (!user) {
    await alertUnmatched('subscription payment', { amount, email: null, id: subscriptionId || resource.id });
    return { matchedBy: 'none', result: 'No student matched: admin alerted' };
  }
  if (!user.paypal) user.paypal = {};

  const paidAt = event.create_time ? new Date(event.create_time) : new Date();
  const { start, end } = startNewCycle(user, paidAt);
  user.paypal.lastPaidAt = paidAt;
  rememberEvent(user, event.id);
  await user.save();

  await sendToStudentGroup(user, paymentReceivedMessage(user.name, start, end));
  return { user, matchedBy: 'subscriptionId', result: `Subscription renewed ${formatDate(start)} to ${formatDate(end)}` };
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
      record.student = outcome.user ? outcome.user._id : undefined;
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
