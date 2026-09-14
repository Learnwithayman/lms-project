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
        
        let cleanTarget = remoteJid ? remoteJid.replace(/@s\.whatsapp\.net/gi, '').replace(/@g\.us/gi, '').trim() : 'Unknown/Blank';
        
        if (!remoteJid || cleanTarget === '') {
            console.log(`⚠️ Aborted: No valid name or number provided to MacroDroid.`);
            try {
                await MessageLog.create({
                    recipient: 'No Name/Number',
                    messageBody: text || 'No text provided',
                    status: 'failed',
                    errorMessage: 'Aborted by System: Missing or invalid recipient.'
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

        // 🛑 The strict 20-second delay before releasing the next webhook
        if (messageQueue.length > 0) {
            console.log('⏳ Queue pause: Waiting 20 seconds for MacroDroid to finish UI automation...');
            await new Promise(r => setTimeout(r, 20000));
        }
    }

    isProcessing = false;
};

// Wraps the sendMessage request in a Promise and pushes it to the queue
const sendMessage = (remoteJid, text) => {
    return new Promise((resolve) => {
        messageQueue.push({ remoteJid, text, resolve });
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