const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth({ 
        clientId: 'v6-session', // Clean slate
        dataPath: '/opt/render/project/src/data' 
    }), 
    // Removed webVersionCache so it uses the newest, official WhatsApp Web
    puppeteer: {
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', 
            '--no-first-run',
            '--no-zygote'
            // Removed the extreme skeleton flags so networking works perfectly during pairing
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