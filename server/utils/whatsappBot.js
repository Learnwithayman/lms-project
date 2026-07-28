const axios = require('axios');
const MessageLog = require('../models/MessageLog'); 

const MACRODROID_URL = 'https://trigger.macrodroid.com/d46f0039-8cc1-4836-b82b-5461a745d0d5/send_msg';

const sendMessage = async (remoteJid, text) => {
    let cleanTarget = remoteJid;
    
    try {
        if (!remoteJid) {
            console.log(`⚠️ Aborted: No name or number provided to MacroDroid.`);
            return false;
        }

        cleanTarget = remoteJid.replace(/@s\.whatsapp\.net/gi, '').replace(/@g\.us/gi, '').trim();
        console.log(`📱 Routing message through phone to: ${cleanTarget}`);

        const response = await axios.get(MACRODROID_URL, {
            params: {
                phone: cleanTarget,
                message: text
            }
        });

        console.log(`🚀 Phone trigger response:`, response.data);

        // ✨ 3. NEW: SAVE TO DATABASE (SUCCESS)
        try {
            await MessageLog.create({
                recipient: cleanTarget,
                messageBody: text,
                status: 'sent'
            });
            console.log(`✅ SUCCESS: Message log securely saved to the database!`); // 👈 Added this!
        } catch (dbError) {
            console.error('⚠️ Could not save message log to database:', dbError.message);
        }

        return true;
    } catch (error) {
        console.error('❌ Failed to trigger physical phone automation:', error.message);
        
        // ✨ 3. NEW: SAVE TO DATABASE (FAILED)
        try {
            await MessageLog.create({
                recipient: cleanTarget || 'Unknown',
                messageBody: text || 'No text provided',
                status: 'failed',
                errorMessage: error.message
            });
            console.log(`✅ LOGGED FAILED MESSAGE TO DATABASE`); // 👈 Added this!
        } catch (dbError) {
            console.error('⚠️ Could not save failed message log to database:', dbError.message);
        }

        return false;
    }
};

const client = {
    sendMessage: async (jid, payload) => {
        const msgText = typeof payload === 'object' ? payload.text : payload;
        return await sendMessage(jid, msgText);
    }
};

module.exports = { client, sendMessage };