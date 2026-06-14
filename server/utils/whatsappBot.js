const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// --- SMART LOCK-BUSTER ---
// Finds and deletes ONLY the locked padlocks without deleting your saved login!
const dataDir = '/opt/render/project/src/data';
function removeLocks(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            removeLocks(fullPath);
        } else if (file === 'SingletonLock') {
            try {
                fs.unlinkSync(fullPath);
                console.log('🔓 Unlocked Chromium Profile successfully!');
            } catch (err) {
                console.error('Failed to unlock:', err);
            }
        }
    }
}
removeLocks(dataDir);
// -------------------------

const client = new Client({
    authStrategy: new LocalAuth({ 
        clientId: 'v7-session', // KEEPING v7 SO WE DO NOT LOSE YOUR LOGIN!
        dataPath: dataDir 
    }), 
    puppeteer: {
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', 
            '--no-first-run',
            '--no-zygote',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        ], 
    }
});

client.on('qr', (qr) => {
    console.log('🤖 SCAN THIS QR CODE WITH YOUR WHATSAPP:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Bot is fully connected and ready to send messages!');
});

client.on('message', async (msg) => {
    if (msg.body === '!id') {
        const chat = await msg.getChat();
        if (chat.isGroup) {
            msg.reply(`Here is your Group ID:\n${chat.id._serialized}`);
            console.log(`\n--- 📂 FOUND GROUP ID ---`);
            console.log(`Name: ${chat.name}`);
            console.log(`ID: ${chat.id._serialized}`);
        } else {
            msg.reply('This command only works inside a group!');
        }
    }
});

client.on('auth_failure', (msg) => {
    console.error('❌ WhatsApp Authentication Failure:', msg);
});

client.initialize();

module.exports = client;