// 🔎 Works out which student / teacher a Google Calendar class belongs to
// (same rules the dashboards use in getTeacherSchedule).
// Group fix (16 Nov): a class can carry BOTH the old WhatsApp group ID (1203…@g.us) and the
// invite link (chat.whatsapp.com/…). A person matches when ANY of their saved values
// (current link, old IDs kept in legacyGroupIds) matches ANY of the codes in the class.

const groupCode = (link) => (link || '').replace('https://chat.whatsapp.com/', '').trim();
// Code without the link part or the "@g.us" ending
const cleanCode = (value) => groupCode(value).replace(/@g\.us$/i, '').trim();
const isOldGroupId = (value) => /^\d{10,}$/.test(cleanCode(value));
const cleanDescription = (event) => (event.description || '').replace(/<[^>]*>?/gm, ' ').replace(/&nbsp;/g, ' ');
const uniq = (list) => [...new Set(list.filter(Boolean))];

// 🔄 Step 8: old IDs are understood only until "Switch to new IDs" is applied (then invite codes only)
let oldIdsEnabled = true;
const setOldIdsEnabled = (value) => { oldIdsEnabled = !!value; };
const allowed = (c) => oldIdsEnabled || !isOldGroupId(c);

// All saved codes of a person (current value + WhatsApp group + old IDs)
const userGroupCodes = (user, field) => uniq([user[field], user.whatsappGroupId, ...(oldIdsEnabled ? (user.legacyGroupIds || []) : [])].map(cleanCode)).filter((c) => c.length > 5 && allowed(c));

const codesMatch = (classCodes, myCodes) => classCodes.some((c) => myCodes.some((m) => c.includes(m) || m.includes(c)));

// Every student code in a class (old ID, invite link code, other ID text, second link)
const eventStudentCodes = (event) => {
  const description = event.description || '';
  const cleanDesc = cleanDescription(event);
  const codes = [];
  const idMatch = description.match(/StudentGroupID[\s*:-]*([0-9]+@g\.us)/i) || description.match(/StudentGroup[^\d]*([0-9]+@g\.us)/i);
  if (idMatch) codes.push(idMatch[1].trim());
  const sLink = cleanDesc.match(/Student\s*Group\s*Link[\s\S]*?chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);
  if (sLink && sLink[1] !== 'null') codes.push(sLink[1].trim());
  const sAlpha = cleanDesc.match(/(?:StudentGroupID|StudentGroup|Student ID)[\s*:-]*([a-zA-Z0-9_-]{10,})/i);
  if (sAlpha && sAlpha[1] !== 'null') codes.push(sAlpha[1].trim());
  if (!codes.length) {
    const allLinks = [...cleanDesc.matchAll(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/gi)];
    if (allLinks.length > 1) codes.push(allLinks[1][1].trim());
  }
  return uniq(codes.map(cleanCode)).filter((c) => c.length > 5 && allowed(c));
};

// Every teacher code in a class (old ID, invite link code, other ID text, first link)
const eventTeacherCodes = (event) => {
  const description = event.description || '';
  const cleanDesc = cleanDescription(event);
  const codes = [];
  const idMatch = description.match(/TeacherGroupID[\s*:-]*([0-9]+@g\.us)/i) || description.match(/TeacherGroup[^\d]*([0-9]+@g\.us)/i);
  if (idMatch) codes.push(idMatch[1].trim());
  const tLink = cleanDesc.match(/Teacher\s*Group\s*Link[\s\S]*?chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i);
  if (tLink && tLink[1] !== 'null') codes.push(tLink[1].trim());
  const tAlpha = cleanDesc.match(/(?:TeacherGroupID|TeacherGroup|Teacher ID)[\s*:-]*([a-zA-Z0-9_-]{10,})/i);
  if (tAlpha && tAlpha[1] !== 'null') codes.push(tAlpha[1].trim());
  if (!codes.length) {
    const allLinks = [...cleanDesc.matchAll(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/gi)];
    if (allLinks.length > 0) codes.push(allLinks[0][1].trim());
  }
  return uniq(codes.map(cleanCode)).filter((c) => c.length > 5 && allowed(c));
};

// The real invite links written in a class (used to send messages)
const eventGroupLinks = (event) => {
  const cleanDesc = cleanDescription(event);
  const link = (re) => {
    const m = cleanDesc.match(re);
    return m && m[1] !== 'null' && !/^\d+$/.test(m[1]) ? `https://chat.whatsapp.com/${m[1].trim()}` : null;
  };
  return {
    teacher: link(/Teacher\s*Group\s*Link[\s\S]*?chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i),
    student: link(/Student\s*Group\s*Link[\s\S]*?chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/i)
  };
};

// Reads the student group code(s) and student name out of a calendar event description
const parseEventStudent = (event) => {
  const description = event.description || '';
  const codes = eventStudentCodes(event);
  const nameMatch = description.match(/StudentGroupName[\s*:-]*([^\n<]+)/i);
  const name = nameMatch ? nameMatch[1].trim() : null;
  return { code: codes[0] || null, codes, name };
};

// True when the class (codes / name) belongs to this student
const classBelongsToStudent = ({ code, codes, name }, user) => {
  const classCodes = (codes && codes.length ? codes : [code]).filter(Boolean).map(cleanCode);
  if (classCodes.length && codesMatch(classCodes, userGroupCodes(user, 'studentGroupId'))) return true;
  const dbName = (user.name || '').toLowerCase().trim();
  const clsName = (name || '').toLowerCase().trim();
  return !!(clsName && dbName && (clsName === dbName || clsName.includes(dbName) || dbName.includes(clsName)));
};

// 📋 Step 5: the main teacher code of a class (same order as getTeacherSchedule)
const parseEventTeacher = (event) => eventTeacherCodes(event)[0] || null;

// True when the class teacher code(s) belong to this teacher (current link or old IDs)
const classBelongsToTeacher = (codeOrCodes, teacher) => {
  const classCodes = (Array.isArray(codeOrCodes) ? codeOrCodes : [codeOrCodes]).filter(Boolean).map(cleanCode);
  if (!classCodes.length) return false;
  return codesMatch(classCodes, userGroupCodes(teacher, 'teacherGroupId'));
};

module.exports = {
  groupCode, cleanCode, isOldGroupId, userGroupCodes, codesMatch, setOldIdsEnabled,
  eventStudentCodes, eventTeacherCodes, eventGroupLinks,
  parseEventStudent, classBelongsToStudent, parseEventTeacher, classBelongsToTeacher
};
