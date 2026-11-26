const asyncHandler = require('express-async-handler');
const Lead = require('../models/Lead');
const { sendMessage } = require('../utils/whatsappBot'); // Your existing MacroDroid bot!

// 🚨 W2 Phase A: the new-trial alert goes to the ADMIN GROUP, the same target the rest of the LMS
// uses (it used to be one hard-coded personal number, so only one phone saw a new family arrive).
const ADMIN_GROUP_TARGET = process.env.ADMIN_WHATSAPP_NUMBER || 'https://chat.whatsapp.com/BYFE1IPRs2KGJNhGaxvpJd';

// 🛡️ W2 Phase A: one trial per WhatsApp number per day. This one is a DATABASE check, not a
// memory check, so a restart of the server cannot be used to get around it.
const DAY_MS = 24 * 60 * 60 * 1000;
const askedAlreadyToday = async (whatsappNumber) => {
  const since = new Date(Date.now() - DAY_MS);
  const digits = String(whatsappNumber || '').replace(/\D/g, ''); // spaces, dashes and brackets must not get around it
  if (!digits) return false;
  const recent = await Lead.find({ createdAt: { $gte: since } }, 'whatsappNumber');
  return recent.some((l) => String(l.whatsappNumber || '').replace(/\D/g, '') === digits);
};

// @desc    Capture new lead from WordPress Fluent Forms
// @route   POST /api/leads/trial
// @access  Public (WordPress will hit this securely)
const captureTrialLead = asyncHandler(async (req, res) => {
  // 1. Extract the data sent by WordPress
  const { fullName, email, whatsappNumber, studentAge, preferredSubjects, referral } = req.body;

  if (!fullName || !whatsappNumber) {
    res.status(400);
    throw new Error('Name and WhatsApp number are required.');
  }

  // 🛡️ W2 Phase A: the same phone already asked for a trial in the last 24 hours. We answer
  // kindly instead of sending the welcome message twice and alerting the team twice.
  if (await askedAlreadyToday(whatsappNumber)) {
    res.status(429);
    throw new Error('We already have your trial request. Our team will message you on WhatsApp very soon.');
  }

  // 2. Save the lead to your MongoDB database
  const newLead = await Lead.create({
    fullName,
    email,
    whatsappNumber,
    studentAge,
    preferredSubjects,
    referral // 🎁 W5: "Who told you about us?" (optional, empty when they skip it)
  });

  // 3. ✨ AUTOMATION: Send the immediate WhatsApp Welcome Message
  const welcomeDraft = `السلام عليكم / Assalamu Alaikum ${fullName}! ✨\n\nWelcome to Learn With Ayman! We have successfully received your request for a Free Trial class.\n\nOur admin team is currently reviewing your preferred subjects and will reach out shortly to schedule your session.\n\nIf you have any immediate questions, feel free to reply to this message! 📚\n\nWarm regards,\n*Learn With Ayman Support Team*`;
  
  // Fire the MacroDroid webhook
  await sendMessage(whatsappNumber, welcomeDraft);

  // 4. Alert the Admin (You)
  const referralLine = referral && String(referral).trim() ? `\n*Told about us by:* ${String(referral).trim()}` : '';
  const adminAlert = `🚨 *New Trial Request!*\n\n*Name:* ${fullName}\n*Phone:* ${whatsappNumber}\n*Subjects:* ${preferredSubjects.join(', ')}${referralLine}\n\nPlease check the dashboard to schedule them.`;
  await sendMessage(ADMIN_GROUP_TARGET, adminAlert);

  res.status(201).json({ message: 'Lead captured and welcome message sent!', lead: newLead });
});

module.exports = { captureTrialLead };