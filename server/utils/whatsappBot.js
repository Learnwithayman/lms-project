const axios = require('axios');

// The MacroDroid custom webhook link we built together
const MACRODROID_URL = 'https://trigger.macrodroid.com/d46f0039-8cc1-4836-b82b-5461a745d0d5/send_msg';

/**
 * Sends a WhatsApp message by physically taking over the connected Android phone screen.
 * @param {string} remoteJid - The recipient's phone number OR Group Name
 * @param {string} text - The message body to send
 */
const sendMessage = async (remoteJid, text) => {
    try {
        if (!remoteJid) {
            console.log(`⚠️ Aborted: No name or number provided to MacroDroid.`);
            return false;
        }

        // 1. Clean the target (Removes backend tags like @g.us, but KEEPS all English letters and names!)
        const cleanTarget = remoteJid.replace(/@s\.whatsapp\.net/gi, '').replace(/@g\.us/gi, '').trim();
        
        console.log(`📱 Routing message through phone to: ${cleanTarget}`);

        // 2. Fire the webhook to MacroDroid passing parameters in the URL query strings
        const response = await axios.get(MACRODROID_URL, {
            params: {
                phone: cleanTarget,
                message: text
            }
        });

        console.log(`🚀 Phone trigger response:`, response.data);
        return true;
    } catch (error) {
        console.error('❌ Failed to trigger physical phone automation:', error.message);
        return false;
    }
};

// Exporting a fake client object to match your existing code structure 
// so you don't have to rewrite any other files in your system!
const client = {
    sendMessage: async (jid, payload) => {
        // If your system passes an object like { text: "hello" }, unwrap it
        const msgText = typeof payload === 'object' ? payload.text : payload;
        return await sendMessage(jid, msgText);
    }
};

module.exports = { client, sendMessage };