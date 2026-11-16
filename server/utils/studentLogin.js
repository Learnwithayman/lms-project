// 🔐 Shared student login details for WhatsApp messages (one place for the shared password)
const STUDENT_PASSWORD = "Lwa@123#";

// Login block used at the end of every message to a student
const loginBlock = (user) => `🔗 https://lms.learnwithayman.com 

🔐 *Your Login Details:*
*Email:* ${user.email}
*Password:* ${STUDENT_PASSWORD}
`;

module.exports = { STUDENT_PASSWORD, loginBlock };
