const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '/opt/render/project/src/data' }), 
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
    // If someone types !id in a chat
    if (msg.body === '!id') {
        const chat = await msg.getChat();
        // Check if the chat is actually a group
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