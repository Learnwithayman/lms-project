const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// Initialize the WhatsApp Client
// We use "LocalAuth" so it remembers your phone and you don't have to scan the QR code every single time you restart the server.
const client = new Client({
    // Tells the bot to save your login permanently to the new Render disk!
    authStrategy: new LocalAuth({ dataPath: '/data' }), 
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'], // This prevents crashes when we upload to Render
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

    // Fetch all chats and filter out only the groups
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

// Start the bot!
client.initialize();

module.exports = client;