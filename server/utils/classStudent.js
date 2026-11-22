// 👪 22 Nov: who is this class for? (Late / Absent / End class messages from the teacher dashboard)
// Brothers / sisters can share ONE group link or old group ID (e.g. Yasmin + Deemah Shadid). The old lookup
// took the first exact match, so messages went out with the wrong sister's name. Now:
// - codes are compared cleaned (spaces, "@g.us", link part), like the rest of the app;
// - when several students share the code, the child NAMED in the class (StudentGroupName or title) is used;
// - a class whose name is clearly another student's full name goes to that student;
// - if it is still unclear, no student is picked (the message uses the class name, never a wrong child's name).

const User = require('../models/User');
const { nameInText, cleanCode, codesMatch, userGroupCodes } = require('./classMatch');

const fullNameIn = (text, name) => {
  const full = (name || '').toLowerCase().trim();
  return full.length > 3 && (text || '').toLowerCase().includes(full);
};

const findClassStudent = async ({ studentGroupId, studentGroupName, title }) => {
  const students = await User.find({ role: 'student' });
  const code = cleanCode(studentGroupId || '');
  const text = `${studentGroupName || ''} ${title || ''}`;
  const candidates = code.length > 5 ? students.filter((s) => codesMatch([code], userGroupCodes(s, 'studentGroupId'))) : [];
  const fullNamed = students.filter((s) => fullNameIn(text, s.name));

  if (candidates.length > 1) {
    const named = candidates.filter((s) => nameInText(text, s.name));
    return named.length === 1 ? named[0] : null;
  }
  if (candidates.length === 1) {
    const only = candidates[0];
    // the class names someone else in full (e.g. "Yasmin Shadid" while only Deemah has this exact code saved)
    const other = fullNamed.filter((s) => String(s._id) !== String(only._id));
    if (other.length === 1 && !fullNameIn(text, only.name)) return other[0];
    // same family name but another first name (e.g. "Yasmin Shadid" vs Deemah Shadid) → a sibling's class: do not guess
    const parts = (only.name || '').toLowerCase().trim().split(/\s+/);
    const first = parts[0] || '';
    const family = parts.length > 1 ? parts[parts.length - 1] : '';
    if (family.length >= 3 && nameInText(text, family) && !nameInText(text, first) && !fullNameIn(text, only.name)) return null;
    return only;
  }
  // no code match: one student named in full (StudentGroupName or title)
  return fullNamed.length === 1 ? fullNamed[0] : null;
};

module.exports = { findClassStudent };
