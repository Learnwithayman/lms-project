const axios = require('axios');
const MessageLog = require('../models/MessageLog'); 

const MACRODROID_URL = 'https://trigger.macrodroid.com/d46f0039-8cc1-4836-b82b-5461a745d0d5/send_msg';

const sendMessage = async (remoteJid, text) => {
    // Clean the target immediately for logging
    let cleanTarget = remoteJid ? remoteJid.replace(/@s\.whatsapp\.net/gi, '').replace(/@g\.us/gi, '').trim() : 'Unknown/Blank';
    
    // ✨ SCENARIO 1: MISSING RECIPIENT (Force Log it anyway!)
    if (!remoteJid || cleanTarget === '') {
        console.log(`⚠️ Aborted: No valid name or number provided to MacroDroid.`);
        try {
            await MessageLog.create({
                recipient: 'No Name/Number',
                messageBody: text || 'No text provided',
                status: 'failed',
                errorMessage: 'Aborted by System: Missing or invalid recipient.'
            });
            console.log(`✅ DB LOG: Saved 'Aborted' attempt to database.`);
        } catch (dbError) {
            console.error('⚠️ Could not save aborted log to database:', dbError.message);
        }
        return false;
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

        // ✨ SCENARIO 2: SUCCESSFUL SEND (Log it!)
        try {
            await MessageLog.create({
                recipient: cleanTarget,
                messageBody: text,
                status: 'sent'
            });
            console.log(`✅ DB LOG: Saved 'Successful' message to database!`);
        } catch (dbError) {
            console.error('⚠️ Could not save success log to database:', dbError.message);
        }

        return true;

    } catch (error) {
        console.error('❌ Failed to trigger physical phone automation:', error.message);
        
        // ✨ SCENARIO 3: MACRODROID CRASH/ERROR (Log it!)
        try {
            await MessageLog.create({
                recipient: cleanTarget,
                messageBody: text || 'No text provided',
                status: 'failed',
                errorMessage: `Phone Error: ${error.message}`
            });
            console.log(`✅ DB LOG: Saved 'Failed' message to database!`);
        } catch (dbError) {
            console.error('⚠️ Could not save failed log to database:', dbError.message);
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