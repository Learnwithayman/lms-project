// 🔎 Works out which student a Google Calendar class belongs to
// (same rules the dashboards use in getTeacherSchedule).

const groupCode = (link) => (link || '').replace('https://chat.whatsapp.com/', '').trim();

// Reads the student group code and student name out of a calendar event description
const parseEventStudent = (event) => {
  const description = event.description || '';
  const cleanDesc = description.replace(/<[^>]*>?/gm, ' ').replace(/&nbsp;/g, ' ');

  let code = null;
  const idMatch = description.match(/StudentGroupID[\s*:-]*([0-9]+@g\.us)/i) || description.match(/StudentGroup[^\d]*([0-9]+@g\.us)/i);
  if (idMatch) code = idMatch[1].trim();
  if (!code) {
    const sLink = cleanDesc.match(/StudentGroupLink[\s\S]*?chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);
    const sAlpha = cleanDesc.match(/(?:StudentGroupID|StudentGroup|Student ID)[\s*:-]*([a-zA-Z0-9_-]{10,})/i);
    if (sLink && sLink[1] !== 'null') code = sLink[1].trim();
    else if (sAlpha && sAlpha[1] !== 'null') code = sAlpha[1].trim();
  }
  if (!code) {
    const allLinks = [...cleanDesc.matchAll(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/gi)];
    if (allLinks.length > 1) code = allLinks[1][1].trim();
  }

  const nameMatch = description.match(/StudentGroupName[\s*:-]*([^\n<]+)/i);
  const name = nameMatch ? nameMatch[1].trim() : null;
  return { code, name };
};

// True when the class (code / name) belongs to this student
const classBelongsToStudent = ({ code, name }, user) => {
  const myCode = groupCode(user.studentGroupId);
  if (code && myCode.length > 5 && (code.includes(myCode) || myCode.includes(code))) return true;
  const dbName = (user.name || '').toLowerCase().trim();
  const clsName = (name || '').toLowerCase().trim();
  return !!(clsName && dbName && (clsName === dbName || clsName.includes(dbName) || dbName.includes(clsName)));
};

module.exports = { groupCode, parseEventStudent, classBelongsToStudent };
