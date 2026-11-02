const axios = require('axios');
const MessageLog = require('../models/MessageLog'); 

// ✅ UPDATED: New MacroDroid Webhook URL
const MACRODROID_URL = 'https://trigger.macrodroid.com/a742c6db-981b-496a-a198-15aa0fcce4ea/send_msg';

// 🚦 THE UNIVERSAL MESSAGE QUEUE SYSTEM
const messageQueue = [];
let isProcessing = false;

const processQueue = async () => {
    if (isProcessing) return;
    isProcessing = true;

    while (messageQueue.length > 0) {
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
            continue; 
        }

        try {
            console.log(`📱 Routing message through phone to: ${cleanTarget}`);

            const response = await axios.get(MACRODROID_URL, {
                params: {
                    phone: cleanTarget,
                    message: text
                }
            });

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

        // 🛑 DELAY: 25 seconds before the next message to allow UI automation to finish
        if (messageQueue.length > 0) {
            console.log('⏳ Queue pause: Waiting 25 seconds for MacroDroid to finish UI automation...');
            await new Promise(r => setTimeout(r, 25000));
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