const asyncHandler = require('express-async-handler');
const Lead = require('../models/Lead');
const { sendMessage } = require('../utils/whatsappBot'); // Your existing MacroDroid bot!

// @desc    Capture new lead from WordPress Fluent Forms
// @route   POST /api/leads/trial
// @access  Public (WordPress will hit this securely)
const captureTrialLead = asyncHandler(async (req, res) => {
  // 1. Extract the data sent by WordPress
  const { fullName, email, whatsappNumber, studentAge, preferredSubjects } = req.body;

  if (!fullName || !whatsappNumber) {
    res.status(400);
    throw new Error('Name and WhatsApp number are required.');
  }

  // 2. Save the lead to your MongoDB database
  const newLead = await Lead.create({
    fullName,
    email,
    whatsappNumber,
    studentAge,
    preferredSubjects
  });

  // 3. ✨ AUTOMATION: Send the immediate WhatsApp Welcome Message
  const welcomeDraft = `السلام عليكم / Assalamu Alaikum ${fullName}! ✨\n\nWelcome to Learn With Ayman! We have successfully received your request for a Free Trial class.\n\nOur admin team is currently reviewing your preferred subjects and will reach out shortly to schedule your session.\n\nIf you have any immediate questions, feel free to reply to this message! 📚\n\nWarm regards,\n*Learn With Ayman Support Team*`;
  
  // Fire the MacroDroid webhook
  await sendMessage(whatsappNumber, welcomeDraft);

  // 4. Alert the Admin (You)
  const adminAlert = `🚨 *New Trial Request!*\n\n*Name:* ${fullName}\n*Phone:* ${whatsappNumber}\n*Subjects:* ${preferredSubjects.join(', ')}\n\nPlease check the dashboard to schedule them.`;
  // Assuming your admin number is saved in a variable or you can hardcode your personal number here temporarily
  await sendMessage('+201064067519', adminAlert); 

  res.status(201).json({ message: 'Lead captured and welcome message sent!', lead: newLead });
});

module.exports = { captureTrialLead };