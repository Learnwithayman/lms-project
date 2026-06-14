const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// --- BULLETPROOF LOCK-BUSTER ---
const dataDir = '/opt/render/project/src/data';
function removeLocks(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
            // lstatSync safely handles ghost files without crashing
            const stat = fs.lstatSync(fullPath); 
            if (stat.isDirectory()) {
                removeLocks(fullPath);
            } else if (file === 'SingletonLock') {
                fs.unlinkSync(fullPath);
                console.log('🔓 Unlocked Chromium Profile successfully!');
            }
        } catch (err) {
            // Silently ignore broken ghost files like SingletonCookie
        }
    }
}
removeLocks(dataDir);
// -------------------------

const client = new Client({
    authStrategy: new LocalAuth({ 
        clientId: 'v7-session', // STILL KEEPING v7!
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