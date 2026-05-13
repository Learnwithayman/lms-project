require('dotenv').config(); 
const { sendWhatsAppMessage } = require('./utils/whatsapp');

// Type your verified number here (Start with 20 for Egypt, NO plus sign!)
const myTestNumber = '+201064067519'; 

const testTheEngine = async () => {
  console.log('Initiating launch sequence...');
  await sendWhatsAppMessage(myTestNumber, 'Hello from the Learn With Ayman LMS! 🚀 The engine is online!');
};

testTheEngine();