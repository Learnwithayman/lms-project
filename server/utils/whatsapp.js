const axios = require('axios');

const sendWhatsAppMessage = async (to, message) => {
  try {
    // 1. Pull the secret keys from your .env file
    const token = process.env.META_ACCESS_TOKEN;
    const phoneId = process.env.META_PHONE_ID;

    if (!token || !phoneId) {
      console.error("Missing Meta WhatsApp keys in .env!");
      return;
    }

    // 2. The exact URL Meta requires for sending messages
    const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;

    // 3. Package the message exactly how Meta expects it
    const data = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: message },
    };

    // 4. Attach your secret password (Token) to the header
    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    // 5. Fire the message to Meta!
    const response = await axios.post(url, data, config);
    console.log(`✅ WhatsApp message successfully sent to ${to}`);
    return response.data;

  } catch (error) {
    // If Meta rejects the message, this will tell us exactly why
    console.error('❌ Error sending WhatsApp message:', error.response ? error.response.data : error.message);
  }
};

module.exports = { sendWhatsAppMessage };
