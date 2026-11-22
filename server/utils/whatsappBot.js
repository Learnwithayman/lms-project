
const axios = require('axios');
const MessageLog = require('../models/MessageLog');
const QueuedMessage = require('../models/QueuedMessage'); // 📨 Step 14: durable copy of the queue (survives a restart)

// ✅ UPDATED: New MacroDroid Webhook URL
const MACRODROID_URL = 'https://trigger.macrodroid.com/a742c6db-981b-496a-a198-15aa0fcce4ea/send_msg';

// ⏱️ Minimum gap between two phone triggers (milliseconds)
const SEND_GAP_MS = 20000;

// 📨 Step 14: how old a "left waiting" message can be and still be resumed after a restart.
// Older than this → reported to the admin instead of being sent out of context.
const RESUME_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours
const ADMIN_GROUP_TARGET = process.env.ADMIN_WHATSAPP_NUMBER || 'https://chat.whatsapp.com/BYFE1IPRs2KGJNhGaxvpJd';

// 🚦 THE UNIVERSAL MESSAGE QUEUE SYSTEM
const messageQueue = [];
let isProcessing = false;
let lastSendAt = 0; // ✨ NEW: remembers WHEN the phone was last triggered

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 📨 Step 14: mark the durable copy as handled (an attempt was made; MessageLog has the sent/failed detail)
const markQueuedDone = async (logId) => {
    if (!logId) return;
    try {
        await QueuedMessage.findByIdAndUpdate(logId, { status: 'done' });
    } catch (dbError) {}
};

const processQueue = async () => {
    if (isProcessing) return;
    isProcessing = true;

    while (messageQueue.length > 0) {

        // ✨ THE FIX: Always respect the gap since the LAST send, even if the queue was empty.
        // We wait BEFORE picking the next message, so an urgent message that arrives
        // during the wait can still jump to the front.
        const waitMs = lastSendAt + SEND_GAP_MS - Date.now();
        if (waitMs > 0) {
            console.log(`⏳ Queue pause: Waiting ${Math.ceil(waitMs / 1000)}s for MacroDroid to finish UI automation...`);
            await sleep(waitMs);
        }

        const { remoteJid, text, resolve, logId } = messageQueue.shift();

        let cleanTarget = remoteJid ? remoteJid.replace(/@s\.whatsapp\.net/gi, '').replace(/@g\.us/gi, '').trim() : '';

        // ✨ SMART URL BUILDER: Ensure MacroDroid always gets a full HTTP link
        if (cleanTarget && !cleanTarget.startsWith('http')) {
            if (/^[a-zA-Z0-9_-]{10,30}$/.test(cleanTarget)) {
                cleanTarget = `https://chat.whatsapp.com/${cleanTarget}`;
            } else if (/^\d+$/.test(cleanTarget)) {
                cleanTarget = `https://wa.me/${cleanTarget}`;
            }
        }

        // 🛑 SAFETY CHECK: Prevent Android intent crashes
        if (!cleanTarget.startsWith('http') || cleanTarget.includes(' ') || cleanTarget === '') {
            console.log(`⚠️ Aborted: Invalid URL target (${cleanTarget}).`);
            try {
                await MessageLog.create({
                    recipient: cleanTarget || 'Unknown',
                    messageBody: text || 'No text provided',
                    status: 'failed',
                    errorMessage: `Aborted by System: '${cleanTarget}' is not a valid web link.`
                });
            } catch (dbError) {}
            await markQueuedDone(logId);
            resolve(false);
            continue; // Nothing was sent to the phone, so no gap is needed
        }

        try {
            console.log(`📱 Routing message through phone to: ${cleanTarget}`);

            const response = await axios.get(MACRODROID_URL, {
                params: {
                    phone: cleanTarget,
                    message: text
                }
            });

            lastSendAt = Date.now(); // ✨ NEW: phone was triggered, start the gap clock

            console.log(`🚀 Phone trigger response:`, response.data);

            try {
                await MessageLog.create({
                    recipient: cleanTarget,
                    messageBody: text,
                    status: 'sent'
                });
            } catch (dbError) {}

            await markQueuedDone(logId);
            resolve(true);

        } catch (error) {
            lastSendAt = Date.now(); // ✨ NEW: be safe, the phone may have been triggered anyway

            console.error('❌ Failed to trigger physical phone automation:', error.message);
            try {
                await MessageLog.create({
                    recipient: cleanTarget,
                    messageBody: text || 'No text provided',
                    status: 'failed',
                    errorMessage: `Phone Error: ${error.message}`
                });
            } catch (dbError) {}
            await markQueuedDone(logId);
            resolve(false);
        }
    }

    isProcessing = false;
};

// Adds one message to the in-memory queue (urgent jumps to the front) and starts the queue.
// `resolve` may be a no-op when resuming a message left over from before a restart (its original
// caller is long gone by then).
const enqueue = ({ remoteJid, text, urgent, logId, resolve = () => {} }) => {
    if (urgent) {
        console.log('🚨 URGENT MESSAGE DETECTED: Jumping to the front of the queue.');
        messageQueue.unshift({ remoteJid, text, resolve, logId });
    } else {
        messageQueue.push({ remoteJid, text, resolve, logId });
    }
    processQueue();
};

// ✨ VIP PRIORITY QUEUE SYSTEM (Funnels ALL messages universally)
const sendMessage = (remoteJid, text) => {
    return new Promise(async (resolve) => {
        // ✅ THE FIX: Add a double newline at the end of the text to isolate links
        // This prevents the word "message" or other Android clipboard artifacts from corrupting the URL.
        const safeText = (text || '').trim() + '\n\n';

        const isUrgent = safeText.includes('Late') || safeText.includes('Absent') || safeText.includes('Reminder') || safeText.includes('Alert');

        // 📨 Step 14: save a durable copy BEFORE anything is attempted, so a restart while this is
        // still waiting in line never loses it silently.
        let logId = null;
        try {
            const saved = await QueuedMessage.create({ recipient: remoteJid || 'Unknown', messageBody: safeText, urgent: isUrgent, status: 'pending' });
            logId = saved._id;
        } catch (dbError) {
            console.error('📨 Could not save the durable queue copy:', dbError.message);
        }

        enqueue({ remoteJid, text: safeText, urgent: isUrgent, logId, resolve });
    });
};

// 📨 Step 14: on startup, pick up anything left "pending" from before a restart.
// Recent ones are resumed in their original order; anything too old to resend sensibly is
// reported to the admin instead (never resent blindly, never silently dropped).
const resumePendingQueue = async () => {
    let pending;
    try {
        pending = await QueuedMessage.find({ status: 'pending' }).sort({ createdAt: 1 });
    } catch (dbError) {
        console.error('📨 Could not check for messages left over from before a restart:', dbError.message);
        return;
    }
    if (!pending.length) return;

    const cutoff = Date.now() - RESUME_MAX_AGE_MS;
    const fresh = pending.filter((m) => m.createdAt.getTime() >= cutoff);
    const stale = pending.filter((m) => m.createdAt.getTime() < cutoff);

    if (fresh.length) {
        console.log(`📨 Resuming ${fresh.length} message(s) left over from before a restart.`);
        fresh.forEach((m) => enqueue({ remoteJid: m.recipient, text: m.messageBody, urgent: m.urgent, logId: m._id }));
    }

    if (stale.length) {
        console.log(`📨 ${stale.length} message(s) are too old to resume safely; reporting to the admin.`);
        const ids = stale.map((m) => m._id);
        try {
            await QueuedMessage.updateMany({ _id: { $in: ids } }, { status: 'lost' });
        } catch (dbError) {}
        const lines = stale.slice(0, 10).map((m) => {
            const when = new Date(m.createdAt).toLocaleString('en-US', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' });
            const preview = (m.messageBody || '').replace(/\s+/g, ' ').trim().slice(0, 70);
            return `• ${when} Cairo → ${m.recipient}: "${preview}${preview.length === 70 ? '…' : ''}"`;
        });
        const more = stale.length > 10 ? `\n…and ${stale.length - 10} more.` : '';
        const report = `⚠️ *Messages lost in a restart*\n\nThe server restarted while ${stale.length} WhatsApp message(s) were still waiting to be sent. They were too old to send automatically once the server came back, so they were NOT sent:\n\n${lines.join('\n')}${more}\n\nPlease check if any of these still need to go out by hand.`;
        enqueue({ remoteJid: ADMIN_GROUP_TARGET, text: report, urgent: false });
    }
};

resumePendingQueue();

const client = {
    sendMessage: async (jid, payload) => {
        const msgText = typeof payload === 'object' ? payload.text : payload;
        return await sendMessage(jid, msgText);
    }
};

module.exports = { client, sendMessage };
