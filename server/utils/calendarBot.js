const { google } = require('googleapis');
const path = require('path');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');

const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS_PATH,
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});

const calendar = google.calendar({ version: 'v3', auth });

async function getUpcomingClasses() {
  try {
    const myCalendarId = 'admin@learnwithayman.com'; 

    const response = await calendar.events.list({
      calendarId: myCalendarId,
      timeMin: (new Date(Date.now() - 10 * 60 * 1000)).toISOString(), 
      maxResults: 50, 
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    const processedClasses = events.map(event => {
      const start = event.start.dateTime || event.start.date;
      const description = event.description || "";
      
      // NEW SMARTER REGEX: Ignores extra colons, spaces, and formatting!
      const teacherMatch = description.match(/TeacherGroup[^\d]*([0-9]+@g\.us)/i);
      const teacherGroupId = teacherMatch ? teacherMatch[1] : null;

      const studentMatch = description.match(/StudentGroup[^\d]*([0-9]+@g\.us)/i);
      const studentGroupId = studentMatch ? studentMatch[1] : null;

      // Catches raw Zoom links even if they aren't wrapped in HTML tags
      const zoomMatch = description.match(/(https:\/\/[^\s<"]*zoom\.us[^\s<"]*)/i);
      const zoomLink = zoomMatch ? zoomMatch[1] : null;

      return {
        title: event.summary,
        startTime: new Date(start),
        teacherGroupId: teacherGroupId,
        studentGroupId: studentGroupId,
        zoomLink: zoomLink
      };
    });

    return processedClasses;

  } catch (error) {
    console.error('❌ Error fetching from Calendar:', error.message);
    return []; 
  }
}

module.exports = { getUpcomingClasses };