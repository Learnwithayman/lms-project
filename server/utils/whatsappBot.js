const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

async function connectToWhatsApp() {
    // This creates a clean, lightweight folder for your login data
    const { state, saveCreds } = await useMultiFileAuthState('/opt/render/project/src/data/baileys_auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }), // Keeps your logs clean and readable
        browser: ['LMS Bot', 'Chrome', '1.0.0']
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('🤖 SCAN THIS QR CODE WITH YOUR WHATSAPP:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Bot is fully connected and ready to send messages! (Zero RAM crashes!)');
        }
    });

    // Save login credentials automatically
    sock.ev.on('creds.update', saveCreds);

    // Listen for messages (including your own!)
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || !msg.key.remoteJid) return;

        // Extract the text safely
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const remoteJid = msg.key.remoteJid;

        if (text === '!id') {
            if (remoteJid.endsWith('@g.us')) {
                await sock.sendMessage(remoteJid, { text: `Here is your Group ID:\n${remoteJid}` }, { quoted: msg });
                console.log(`\n--- 📂 FOUND GROUP ID ---`);
                console.log(`ID: ${remoteJid}`);
            } else {
                await sock.sendMessage(remoteJid, { text: 'This command only works inside a group!' }, { quoted: msg });
            }
        }
    });

    return sock;
}

// Start the bot
connectToWhatsApp();