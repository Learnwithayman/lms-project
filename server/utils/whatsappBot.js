const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs'); 

// --- THE BULLDOZER: Wipes the corrupted hard drive clean! ---
const dataPath = '/opt/render/project/src/data';
try {
    // This forcefully deletes EVERYTHING inside the corrupted data folder
    fs.rmSync(dataPath, { recursive: true, force: true });
    console.log('🧹 Corrupted hard drive successfully wiped clean!');
} catch (err) {
    console.log('Drive already clean or missing.');
}
// ------------------------------------------------------------

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: dataPath }), 
    puppeteer: {
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', 
            '--single-process',        
            '--no-zygote'              
        ], 
    }
});

client.on('qr', (qr) => {
    console.log('🤖 SCAN THIS QR CODE WITH YOUR WHATSAPP:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp Bot is fully connected and ready to send messages!');
    console.log('🚨 To find your Group ID: Send the message "!id" inside your WhatsApp group right now.');
});

// The Magic ID Finder!
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