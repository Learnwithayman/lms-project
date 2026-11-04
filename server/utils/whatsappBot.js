
const axios = require('axios');
const MessageLog = require('../models/MessageLog'); 
 
// ✅ UPDATED: New MacroDroid Webhook URL
const MACRODROID_URL = 'https://trigger.macrodroid.com/a742c6db-981b-496a-a198-15aa0fcce4ea/send_msg';
 
// ⏱️ Minimum gap between two phone triggers (milliseconds)
const SEND_GAP_MS = 20000;
 
// 🚦 THE UNIVERSAL MESSAGE QUEUE SYSTEM
const messageQueue = [];
let isProcessing = false;
let lastSendAt = 0; // ✨ NEW: remembers WHEN the phone was last triggered
 
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
 
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
 
        const { remoteJid, text, resolve } = messageQueue.shift();
        
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
            resolve(false);
        }
    }
 
    isProcessing = false;
};
 
// ✨ VIP PRIORITY QUEUE SYSTEM (Funnels ALL messages universally)
const sendMessage = (remoteJid, text) => {
    return new Promise((resolve) => {
        // ✅ THE FIX: Add a double newline at the end of the text to isolate links 
        // This prevents the word "message" or other Android clipboard artifacts from corrupting the URL.
        const safeText = (text || '').trim() + '\n\n';
 
        const isUrgent = safeText.includes('Late') || safeText.includes('Absent') || safeText.includes('Reminder') || safeText.includes('Alert');
 
        if (isUrgent) {
            console.log('🚨 URGENT MESSAGE DETECTED: Jumping to the front of the queue.');
            messageQueue.unshift({ remoteJid, text: safeText, resolve });
        } else {
            messageQueue.push({ remoteJid, text: safeText, resolve });
        }
        
        processQueue(); 
    });
};
 
const client = {
    sendMessage: async (jid, payload) => {
        const msgText = typeof payload === 'object' ? payload.text : payload;
        return await sendMessage(jid, msgText);
    }
};
 
module.exports = { client, sendMessage };
 