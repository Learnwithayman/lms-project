const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

let whatsappSocket = null; // Global variable to hold the connection

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('/opt/render/project/src/data/baileys_auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['LMS Bot', 'Chrome', '1.0.0']
    });

    whatsappSocket = sock; // Save the socket globally when it connects

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('🤖 SCAN THIS QR CODE WITH YOUR WHATSAPP:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Bot is fully connected and ready to send messages!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || !msg.key.remoteJid) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const remoteJid = msg.key.remoteJid;

        if (text === '!id') {
            if (remoteJid.endsWith('@g.us')) {
                await sock.sendMessage(remoteJid, { text: `Here is your Group ID:\n${remoteJid}` }, { quoted: msg });
            }
        }
    });

    return sock;
}

// Reusable function for the rest of your backend
async function sendLmsNotification(groupId, messageText) {
    if (!whatsappSocket) {
        console.error('❌ Cannot send message: WhatsApp bot is not initialized yet.');
        return false;
    }
    try {
        await whatsappSocket.sendMessage(groupId, { text: messageText });
        return true;
    } catch (error) {
        console.error('❌ Failed to send WhatsApp notification:', error);
        return false;
    }
}

// Start the bot connection
connectToWhatsApp();

// Export the notification function so other files can use it!
module.exports = { sendLmsNotification };