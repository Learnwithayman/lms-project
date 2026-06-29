const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');
const fs = require('fs'); // 📂 Added to cleanly auto-detect your persistent cloud disk

let whatsappSocket = null; 
let isConnecting = false;

// Path routing for local vs Render production disks
const isLocal = process.env.NODE_ENV !== 'production';
// 🧹 WE CHANGED THE FOLDER NAME TO _v2 TO FORCE A FRESH QR CODE!
const authFolder = isLocal 
    ? path.join(__dirname, '..', 'baileys_auth_v2') 
    : (fs.existsSync('/baileys_auth_v2') ? '/baileys_auth_v2' : path.join(__dirname, '..', 'baileys_auth_v2'));

async function connectToWhatsApp() {
    if (isConnecting) return;
    isConnecting = true;

    try {
        const { state, saveCreds } = await useMultiFileAuthState(authFolder);

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'error' }), 
            browser: ['LMS Bot', 'Chrome', '1.0.0']
        });

        whatsappSocket = sock; 

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // ✨ THE RENDER CLOUD INTERCEPTOR ✨
            if (qr) {
                console.log('\n==================================================================');
                console.log('🤖 WHATSAPP INSTANT SYNC ENGINE ACTIVE');
                console.log('🔗 CLICK THE LIVE URL BELOW TO VIEW AND SCAN YOUR REFRESHED QR CODE:');
                console.log(`👉 https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)} 👈`);
                console.log('==================================================================\n');
                
                // Fallback text render for local computer setups
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'close') {
                isConnecting = false; 
                
                const statusCode = lastDisconnect?.error?.output?.statusCode || 'Unknown';
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                if (shouldReconnect) {
                    console.log(`⚠️ Bot disconnected. Error Code: ${statusCode}. Reconnecting in 3 seconds...`);
                    setTimeout(connectToWhatsApp, 3000); 
                } else {
                    console.log('❌ Bot was logged out manually. You need to scan the QR code again.');
                }
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

    } catch (error) {
        console.error('❌ Fatal Bot Error:', error);
        isConnecting = false;
    }
}

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

connectToWhatsApp();

module.exports = { sendLmsNotification };