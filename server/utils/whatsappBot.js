const axios = require('axios');
const MessageLog = require('../models/MessageLog'); 

const MACRODROID_URL = 'https://trigger.macrodroid.com/e9592791-c348-4013-81ca-1586b671b80c/send_msg';

// 🚦 THE MESSAGE QUEUE SYSTEM
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

// ✨ VIP PRIORITY QUEUE SYSTEM
const sendMessage = (remoteJid, text) => {
    return new Promise((resolve) => {
        const isUrgent = text.includes('Late') || text.includes('Absent') || text.includes('Reminder') || text.includes('Alert');

        if (isUrgent) {
            console.log('🚨 URGENT MESSAGE DETECTED: Jumping to the front of the queue.');
            messageQueue.unshift({ remoteJid, text, resolve });
        } else {
            messageQueue.push({ remoteJid, text, resolve });
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