const { join } = require('path');

module.exports = {
  // Tells Puppeteer to download Chrome inside the project folder so Render doesn't delete it!
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};