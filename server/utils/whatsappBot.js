const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Initialize the WhatsApp Client
const client = new Client({
    // We point this EXACTLY to the permanent disk you created in Render
    authStrategy: new LocalAuth({ dataPath: '/opt/render/project/src/data' }), 
    puppeteer: {
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // <--- This fixes the silent freeze on Render!
            '--single-process',        // <--- Uses less RAM
            '--no-zygote'              // <--- Helps it start faster
        ], 
    }
});

// 1. Generate the QR Code in the terminal
client.on('qr', (qr) => {
    console.log('🤖 SCAN THIS QR CODE WITH YOUR WHATSAPP:');
    qrcode.generate(qr, { small: true });
});

// 2. Tell us when it successfully connects and list all groups
client.on('ready', async () => {
    console.log('✅ WhatsApp Bot is fully connected and ready to send messages!');

    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup);

    console.log('\n--- 📂 YOUR WHATSAPP GROUPS ---');
    groups.forEach(group => {
        console.log(`Group Name: ${group.name}`);
        console.log(`Group ID: ${group.id._serialized}`);
        console.log('------------------------------');
    });
});

// 3. Catch any authentication errors
client.on('auth_failure', (msg) => {
    console.error('❌ WhatsApp Authentication Failure:', msg);
});

client.initialize();

module.exports = client;