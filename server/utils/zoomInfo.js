// 🆔 STEP 21 (26 Nov): Zoom Meeting ID + passcode in the reminders
// Each teacher can save their Zoom room in Manage Users (Zoom link, Meeting ID, passcode).
// The Meeting ID is read from the class's Zoom link (…/j/1234567890). The passcode can NOT be read from the
// link ("pwd=" is Zoom's coded version), so it comes from the teacher whose saved room has the same Meeting ID.
// A class with no Zoom link uses its teacher's saved Zoom link.
const User = require('../models/User');
const { cleanCode } = require('./classMatch');

const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, rooms: null, byTeacher: null };

const digits = (s) => String(s || '').replace(/\D/g, '');
const meetingIdOf = (link) => (String(link || '').match(/zoom\.us\/(?:j|w|s|wc\/join)\/(\d{9,11})/i) || [])[1] || null;
const fmtMeetingId = (id) => {
  const d = digits(id);
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  if (d.length === 11) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  return d;
};

// meetingId → { passcode, link } and teacher group code → saved Zoom link (refreshed every 5 minutes)
const loadRooms = async () => {
  if (cache.rooms && Date.now() - cache.at < CACHE_MS) return cache;
  const teachers = await User.find({ role: 'teacher' }, 'teacherGroupId zoomLink zoomMeetingId zoomPasscode');
  const rooms = {};
  const byTeacher = {};
  for (const t of teachers) {
    const link = String(t.zoomLink || '').trim();
    const id = digits(t.zoomMeetingId) || meetingIdOf(link);
    if (id && !(rooms[id] && rooms[id].passcode)) rooms[id] = { passcode: String(t.zoomPasscode || '').trim(), link };
    const code = cleanCode(t.teacherGroupId);
    if (code && link) byTeacher[code] = link;
  }
  cache = { at: Date.now(), rooms, byTeacher };
  return cache;
};
const clearZoomCache = () => { cache = { at: 0, rooms: null, byTeacher: null }; };

// The join link for a class: its own Zoom link, else its teacher's saved one
const joinLinkFor = async (classLink, teacherCode) => {
  if (classLink) return classLink;
  if (!teacherCode) return '';
  try { return (await loadRooms()).byTeacher[cleanCode(teacherCode)] || ''; } catch (e) { return ''; }
};

// Text lines to add right under the join link ('' when there is no Meeting ID)
const zoomLines = async (link) => {
  const id = meetingIdOf(link);
  if (!id) return '';
  let room = null;
  try { room = (await loadRooms()).rooms[id] || null; } catch (e) { room = null; }
  return `\n🆔 *Meeting ID:* ${fmtMeetingId(id)}${room && room.passcode ? `\n🔑 *Passcode:* ${room.passcode}` : ''}`;
};

module.exports = { meetingIdOf, fmtMeetingId, joinLinkFor, zoomLines, clearZoomCache, _loadRooms: loadRooms };
