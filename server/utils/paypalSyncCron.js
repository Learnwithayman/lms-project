const cron = require('node-cron');
const { runDaily } = require('./paypalSync');

// 💳 Step 17: daily PayPal cycles sync at 9:00 AM Cairo (before the 10:00 reminders).
// Does nothing until the admin turns "Daily sync" on in the admin panel.
cron.schedule('0 9 * * *', runDaily, { timezone: 'Africa/Cairo' });

module.exports = { runDaily };
