const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const A = require('../utils/availability');
const { isOldGroupId, eventTeacherCodes, eventStudentCodes, eventGroupLinks, classBelongsToTeacher, classBelongsToStudent } = require('../utils/classMatch');

// ==========================================
// 🔗 FIX GROUP LINKS (16 Nov)
// ==========================================
// Students / teachers whose saved group value is the OLD WhatsApp group ID (1203…@g.us) or empty
// get the real invite link copied from their Google Calendar classes (StudentGroupLink / TeacherGroupLink).
// The old ID is kept in legacyGroupIds, so classes still match. Preview first, then Apply.

const buildPlan = async () => {
  const now = Date.now();
  const events = await A.listEvents(now - 60 * A.DAY, now + 30 * A.DAY);
  const people = await User.find({ role: { $in: ['student', 'teacher'] } });
  const fixable = [];
  const notFound = [];

  for (const person of people) {
    const role = person.role;
    const field = role === 'teacher' ? 'teacherGroupId' : 'studentGroupId';
    const current = (person[field] || '').trim();
    if (current && !isOldGroupId(current)) continue; // already a link / code: nothing to fix

    // Classes of this person, by group code only (names can match brothers and sisters)
    const mine = current ? events.filter((ev) => (role === 'teacher'
      ? classBelongsToTeacher(eventTeacherCodes(ev), person)
      : classBelongsToStudent({ codes: eventStudentCodes(ev), name: null }, person))) : [];

    const counts = {};
    mine.forEach((ev) => {
      const link = eventGroupLinks(ev)[role];
      if (link) counts[link] = (counts[link] || 0) + 1;
    });
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const row = {
      id: String(person._id),
      name: person.name,
      role,
      status: role === 'student' ? ((person.subscription && person.subscription.status) || 'none') : '',
      oldValue: current,
      classesFound: mine.length,
      newLink: ranked.length ? ranked[0][0] : null,
      otherLinks: ranked.slice(1).map(([link]) => link)
    };
    if (row.newLink) fixable.push(row); else notFound.push(row);
  }

  const byName = (a, b) => a.role.localeCompare(b.role) || (a.name || '').localeCompare(b.name || '');
  return { fixable: fixable.sort(byName), notFound: notFound.sort(byName) };
};

// @route GET /api/users/group-links/preview (Admin) — nothing is saved
const previewGroupLinks = asyncHandler(async (req, res) => {
  res.status(200).json(await buildPlan());
});

// @route POST /api/users/group-links/apply { ids? } (Admin) — saves the invite links (all fixable, or only the ids sent)
const applyGroupLinks = asyncHandler(async (req, res) => {
  const { fixable } = await buildPlan(); // worked out again on the server, never trusted from the page
  const only = Array.isArray(req.body && req.body.ids) ? new Set(req.body.ids.map(String)) : null;
  const changed = [];
  for (const row of fixable) {
    if (only && !only.has(row.id)) continue;
    const person = await User.findById(row.id);
    if (!person) continue;
    const field = person.role === 'teacher' ? 'teacherGroupId' : 'studentGroupId';
    const old = (person[field] || '').trim();
    person.legacyGroupIds = person.legacyGroupIds || [];
    if (old && !person.legacyGroupIds.includes(old)) person.legacyGroupIds.push(old);
    person[field] = row.newLink;
    await person.save();
    changed.push({ name: person.name, role: person.role, newLink: row.newLink });
  }
  res.status(200).json({ message: `Group links fixed for ${changed.length} ${changed.length === 1 ? 'person' : 'people'}.`, changed });
});

module.exports = { previewGroupLinks, applyGroupLinks, buildPlan };
