// 🔄 STEP 8: SWITCH TO NEW GROUP IDS
// New ID = the last part of the WhatsApp invite link (chat.whatsapp.com/<code>). Old IDs (1203…@g.us) are removed.
// Preview → Ayman decides unclear classes → Apply (calendar descriptions + LMS values, with a backup).
// Only the group codes are replaced, inside the teacher part and the student part of a description;
// everything else in the description stays exactly as it is.

const User = require('../models/User');
const Setting = require('../models/Setting');
const GroupIdBackup = require('../models/GroupIdBackup');
const { calendar } = require('../controllers/scheduleController');
const CM = require('./classMatch');

const CAL = 'admin@learnwithayman.com';
const DAY = 24 * 60 * 60 * 1000;
const LINK = (code) => `https://chat.whatsapp.com/${code}`;
const OLD_ID_RE = /(\d{15,22})@g\.us/g;
const INVITE_RE = /chat\.whatsapp\.com\/([A-Za-z0-9]{18,24})/g;
const TEACHER_LABEL = /Teacher\s*Group/i;
const STUDENT_LABEL = /Student\s*Group/i;
const SWITCH_KEY = 'groupIdsSwitchedAt';

const uniq = (list) => [...new Set(list.filter(Boolean))];
const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const oldIdsIn = (text) => uniq([...(text || '').matchAll(OLD_ID_RE)].map((m) => m[1]));
const invitesIn = (text) => uniq([...(text || '').matchAll(INVITE_RE)].map((m) => m[1]));
const titleMatches = (title, name) => {
  const t = norm(title);
  const n = norm(name);
  return !!(t && n && (t === n || t.includes(n) || n.includes(t)));
};

// ---------- the switch flag (old IDs understood until Apply) ----------
const loadSwitchFlag = async () => {
  try {
    const s = await Setting.findOne({ key: SWITCH_KEY });
    CM.setOldIdsEnabled(!(s && s.value));
  } catch (error) {
    console.error('Could not read the group ID switch flag:', error.message);
  }
};

// ---------- Google Calendar ----------
const listAll = async (params) => {
  const items = [];
  let pageToken;
  do {
    const res = await calendar.events.list({ calendarId: CAL, maxResults: 2500, pageToken, ...params });
    items.push(...(res.data.items || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return items.filter((e) => e.status !== 'cancelled');
};

// ---------- description parts ----------
// The teacher part is the text before the first "StudentGroup" label; the student part is from that label on.
const splitParts = (description) => {
  const d = description || '';
  const t = d.search(TEACHER_LABEL);
  const s = d.search(STUDENT_LABEL);
  if (t >= 0 && s >= 0 && t > s) return { unusual: true };
  if (s >= 0) return { teacher: [0, s], student: [s, d.length] };
  if (t >= 0) return { teacher: [0, d.length], student: null };
  return { none: true };
};
const partText = (d, range) => (range ? d.slice(range[0], range[1]) : '');

const sideInfo = (text) => ({ oldIds: oldIdsIn(text), codes: invitesIn(text) });

// ---------- old ID → invite code (from the classes themselves) ----------
// Each class part with exactly one old ID and one invite link is a "vote". For an old ID saved on LMS
// students, votes from classes titled with those students' names win (copy-paste mistakes lose).
const buildIdMap = (events, people) => {
  const votes = {};
  for (const ev of events) {
    const d = ev.description || '';
    const parts = splitParts(d);
    if (parts.unusual || parts.none) continue;
    for (const role of ['teacher', 'student']) {
      const { oldIds, codes } = sideInfo(partText(d, parts[role]));
      if (oldIds.length === 1 && codes.length === 1) {
        votes[oldIds[0]] = votes[oldIds[0]] || [];
        votes[oldIds[0]].push({ code: codes[0], title: ev.summary || '', role });
      }
    }
  }
  const owners = {};
  people.forEach((p) => {
    const field = p.role === 'teacher' ? 'teacherGroupId' : 'studentGroupId';
    const id = CM.cleanCode(p[field]);
    if (CM.isOldGroupId(id)) (owners[id] = owners[id] || []).push(p);
  });
  const pick = (list) => {
    const counts = {};
    list.forEach((v) => { counts[v.code] = (counts[v.code] || 0) + 1; });
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return { top: ranked[0], total: list.length };
  };
  const map = {};
  Object.entries(votes).forEach(([id, list]) => {
    const ownerStudents = (owners[id] || []).filter((p) => p.role === 'student');
    const titled = ownerStudents.length ? list.filter((v) => ownerStudents.some((p) => titleMatches(v.title, p.name))) : [];
    const { top, total } = pick(titled.length ? titled : list);
    if (top && (titled.length || top[1] / total >= 0.6)) map[id] = top[0];
  });
  return map;
};

// Who owns an invite code (for the choice labels)
const buildOwners = (people, idMap) => {
  const owners = {};
  people.forEach((p) => {
    const field = p.role === 'teacher' ? 'teacherGroupId' : 'studentGroupId';
    let code = CM.cleanCode(p[field]);
    if (CM.isOldGroupId(code)) code = idMap[code];
    if (!code) return;
    owners[code] = owners[code] || [];
    owners[code].push({ name: (p.name || '').trim(), role: p.role });
  });
  return owners;
};
const ownerLabel = (code, owners) => {
  const list = owners[code] || [];
  if (!list.length) return `Unknown group (…${code.slice(-6)})`;
  const roles = uniq(list.map((o) => o.role));
  return `${list.map((o) => o.name).join(', ')} (${roles.join(' / ')} group)`;
};

// ---------- one class (series / single / exception) ----------
const decideSide = (text, idMap) => {
  const { oldIds, codes } = sideInfo(text);
  const mapped = oldIds.map((id) => idMap[id]).filter(Boolean);
  const unmapped = oldIds.filter((id) => !idMap[id]);
  const candidates = uniq([...codes, ...mapped]);
  const needsChange = oldIds.length > 0 || codes.length > 1;
  if (!needsChange) return { needsChange: false };
  if (candidates.length === 1 && !unmapped.length) return { needsChange: true, code: candidates[0], hadLink: codes.length > 0 };
  return { needsChange: true, unclear: true, candidates, unmapped, hadLink: codes.length > 0 };
};

const analyseUnit = (ev, kind, idMap, owners) => {
  const d = ev.description || '';
  const parts = splitParts(d);
  const base = { id: ev.id, kind, title: (ev.summary || '').trim(), start: (ev.start && (ev.start.dateTime || ev.start.date)) || null };
  if (parts.none) return oldIdsIn(d).length ? { ...base, status: 'manual', note: 'Group lines have no Teacher/Student labels. Please edit by hand.' } : null;
  if (parts.unusual) return oldIdsIn(d).length ? { ...base, status: 'manual', note: 'The student lines come before the teacher lines. Please edit by hand.' } : null;

  const sides = {};
  let needs = false;
  let unclear = false;
  for (const role of ['teacher', 'student']) {
    if (!parts[role]) continue;
    const s = decideSide(partText(d, parts[role]), idMap);
    if (!s.needsChange) continue;
    needs = true;
    if (s.unclear) {
      unclear = true;
      let options = s.candidates.map((code) => ({ code, label: ownerLabel(code, owners), matchesTitle: (owners[code] || []).some((o) => titleMatches(base.title, o.name)) }));
      if (!options.length) {
        // An old ID nobody can translate: offer the known groups of that role
        options = Object.entries(owners).filter(([, list]) => list.some((o) => o.role === role))
          .map(([code]) => ({ code, label: ownerLabel(code, owners), matchesTitle: (owners[code] || []).some((o) => titleMatches(base.title, o.name)) }))
          .sort((a, b) => (b.matchesTitle - a.matchesTitle) || a.label.localeCompare(b.label));
      }
      sides[role] = { unclear: true, options, reason: s.unmapped.length && !s.candidates.length ? 'Old ID with no known link' : 'The ID and the link point to different groups' };
    } else {
      sides[role] = { code: s.code, label: ownerLabel(s.code, owners), addLink: !s.hadLink };
    }
  }
  if (!needs) return null;
  return { ...base, status: unclear ? 'unclear' : 'ready', sides };
};

// Rewrite one part: every old ID and every other invite code → the chosen code; add a link line if missing
const rewritePart = (text, code, role) => {
  let out = text
    .replace(/<a[^>]*href="mailto:\d{15,22}@g\.us"[^>]*>[\s\S]*?<\/a>/gi, code)
    .replace(OLD_ID_RE, code)
    .replace(INVITE_RE, (m, c) => (c === code ? m : m.replace(c, code)));
  if (!invitesIn(out).length) {
    const label = role === 'teacher' ? 'TeacherGroupLink' : 'StudentGroupLink';
    const line = `<p>${label}: <a href="${LINK(code)}">${LINK(code)}</a></p>`;
    if (role === 'teacher') {
      // right after the last finished paragraph of the teacher part (never inside an open tag)
      const end = out.lastIndexOf('</p>');
      out = end >= 0 ? `${out.slice(0, end + 4)}${line}${out.slice(end + 4)}` : `${line}${out}`;
    } else {
      const end = out.indexOf('</p>');
      out = end >= 0 ? `${out.slice(0, end + 4)}${line}${out.slice(end + 4)}` : `${out}${line}`;
    }
  }
  return out;
};

const rewriteDescription = (description, chosen) => {
  const d = description || '';
  const parts = splitParts(d);
  if (parts.none || parts.unusual) return d;
  const t = parts.teacher ? partText(d, parts.teacher) : '';
  const s = parts.student ? partText(d, parts.student) : '';
  const head = parts.teacher ? d.slice(0, parts.teacher[0]) : (parts.student ? d.slice(0, parts.student[0]) : '');
  const newT = parts.teacher && chosen.teacher ? rewritePart(t, chosen.teacher, 'teacher') : t;
  const newS = parts.student && chosen.student ? rewritePart(s, chosen.student, 'student') : s;
  return `${head}${newT}${newS}`;
};

// ---------- the full preview ----------
const buildPreview = async (now = Date.now()) => {
  const [units, instances, history, people] = await Promise.all([
    listAll({ timeMin: new Date(now).toISOString(), singleEvents: false }),
    listAll({ timeMin: new Date(now).toISOString(), timeMax: new Date(now + 180 * DAY).toISOString(), singleEvents: true }),
    listAll({ timeMin: new Date(now - 120 * DAY).toISOString(), timeMax: new Date(now).toISOString(), singleEvents: true }),
    User.find({ role: { $in: ['student', 'teacher'] } })
  ]);
  const idMap = buildIdMap([...history, ...instances], people);
  const owners = buildOwners(people, idMap);

  // Series, single classes and changed single instances of a series
  const byId = {};
  units.forEach((ev) => { byId[ev.id] = ev; });
  const work = units.map((ev) => ({ ev, kind: ev.recurrence ? 'series' : (ev.recurringEventId ? 'exception' : 'single') }));
  instances.forEach((inst) => {
    if (!inst.recurringEventId || byId[inst.id]) return;
    const master = byId[inst.recurringEventId];
    if (master && (master.description || '') === (inst.description || '')) return; // follows the series
    work.push({ ev: inst, kind: 'exception' });
  });

  const classes = work.map(({ ev, kind }) => analyseUnit(ev, kind, idMap, owners)).filter(Boolean)
    .sort((a, b) => (a.status === b.status ? a.title.localeCompare(b.title) : ({ unclear: 0, manual: 1, ready: 2 }[a.status] - { unclear: 0, manual: 1, ready: 2 }[b.status])));

  // LMS values
  const lmsUpdates = [];
  const people_ = [];
  for (const p of people) {
    const field = p.role === 'teacher' ? 'teacherGroupId' : 'studentGroupId';
    const raw = (p[field] || '').trim();
    const code = CM.cleanCode(raw);
    if (!raw) continue;
    if (!CM.isOldGroupId(code)) {
      if (raw !== LINK(code) && /^[A-Za-z0-9]{18,24}$/.test(code)) lmsUpdates.push({ id: String(p._id), name: p.name, role: p.role, oldValue: raw, newLink: LINK(code) });
      continue;
    }
    // Students: the link of classes titled with their own name wins (avoids wrong IDs saved in the LMS)
    const titled = uniq([...history, ...instances].filter((ev) => titleMatches(ev.summary, p.name)).map((ev) => {
      const parts = splitParts(ev.description || '');
      const part = p.role === 'teacher' ? parts.teacher : parts.student;
      const codes = part ? invitesIn(partText(ev.description || '', part)) : [];
      return codes.length === 1 ? codes[0] : null;
    }));
    if (p.role === 'student' && titled.length === 1) {
      lmsUpdates.push({ id: String(p._id), name: p.name, role: p.role, oldValue: raw, newLink: LINK(titled[0]) });
      continue;
    }
    if (idMap[code]) {
      lmsUpdates.push({ id: String(p._id), name: p.name, role: p.role, oldValue: raw, newLink: LINK(idMap[code]) });
      continue;
    }
    // No class translates this old ID: suggest the link of classes titled with their name
    people_.push({ id: String(p._id), name: p.name, role: p.role, status: p.role === 'student' ? ((p.subscription && p.subscription.status) || 'none') : '', oldValue: raw, suggestion: titled.length === 1 ? LINK(titled[0]) : null });
  }

  const switched = await Setting.findOne({ key: SWITCH_KEY });
  return {
    switchedAt: switched ? switched.value : null,
    counts: { ready: classes.filter((c) => c.status === 'ready').length, unclear: classes.filter((c) => c.status === 'unclear').length, manual: classes.filter((c) => c.status === 'manual').length },
    classes,
    lmsUpdates: lmsUpdates.sort((a, b) => a.role.localeCompare(b.role) || (a.name || '').localeCompare(b.name || '')),
    people: people_.sort((a, b) => a.role.localeCompare(b.role) || (a.name || '').localeCompare(b.name || '')),
    _work: work,
    _idMap: idMap
  };
};

// ---------- apply ----------
// choices: { [classId]: { teacher: code, student: code } } for unclear classes
// people:  { [userId]: 'https://chat.whatsapp.com/…' or '' } for people with no link found
const apply = async ({ choices = {}, people = {} }, adminId) => {
  const preview = await buildPreview();
  const evById = {};
  preview._work.forEach(({ ev }) => { evById[ev.id] = ev; });
  const result = { classesChanged: 0, classesSkipped: [], classErrors: [], lmsChanged: 0, peopleSaved: 0, peopleCleared: 0 };

  for (const c of preview.classes) {
    if (c.status === 'manual') { result.classesSkipped.push(`${c.title} (edit by hand)`); continue; }
    const chosen = {};
    let complete = true;
    for (const role of ['teacher', 'student']) {
      const side = c.sides[role];
      if (!side) continue;
      if (!side.unclear) { chosen[role] = side.code; continue; }
      const pick = choices[c.id] && choices[c.id][role];
      if (pick && side.options.some((o) => o.code === pick)) chosen[role] = pick;
      else complete = false;
    }
    if (!complete) { result.classesSkipped.push(c.title); continue; }
    const ev = evById[c.id];
    const oldDescription = ev.description || '';
    const newDescription = rewriteDescription(oldDescription, chosen);
    if (newDescription === oldDescription) continue;
    try {
      await GroupIdBackup.create({ eventId: c.id, summary: c.title, kind: c.kind, oldDescription, newDescription, appliedBy: adminId });
      await calendar.events.patch({ calendarId: CAL, eventId: c.id, requestBody: { description: newDescription } });
      result.classesChanged += 1;
    } catch (error) {
      result.classErrors.push(`${c.title}: ${error.message}`);
    }
  }

  // LMS values → invite links
  for (const u of preview.lmsUpdates) {
    const person = await User.findById(u.id);
    if (!person) continue;
    person[person.role === 'teacher' ? 'teacherGroupId' : 'studentGroupId'] = u.newLink;
    person.legacyGroupIds = [];
    await person.save();
    result.lmsChanged += 1;
  }
  for (const p of preview.people) {
    const person = await User.findById(p.id);
    if (!person) continue;
    const pasted = String(people[p.id] || '').trim();
    const code = CM.cleanCode(pasted);
    const field = person.role === 'teacher' ? 'teacherGroupId' : 'studentGroupId';
    if (pasted && /^[A-Za-z0-9]{18,24}$/.test(code)) { person[field] = LINK(code); result.peopleSaved += 1; }
    else { person[field] = ''; result.peopleCleared += 1; }
    person.legacyGroupIds = [];
    await person.save();
  }

  // From now on only invite codes are understood
  await Setting.findOneAndUpdate({ key: SWITCH_KEY }, { value: new Date().toISOString() }, { upsert: true });
  CM.setOldIdsEnabled(false);
  return result;
};

// ---------- checker: upcoming classes / people still using old IDs ----------
let checkCache = null;
const check = async (force = false) => {
  if (!force && checkCache && Date.now() - checkCache.at < 10 * 60 * 1000) return checkCache.data;
  const now = Date.now();
  const [instances, people] = await Promise.all([
    listAll({ timeMin: new Date(now).toISOString(), timeMax: new Date(now + 60 * DAY).toISOString(), singleEvents: true }),
    User.find({ role: { $in: ['student', 'teacher'] } })
  ]);
  const classes = instances.filter((ev) => oldIdsIn(ev.description).length);
  const peopleOld = people.filter((p) => CM.isOldGroupId(p[p.role === 'teacher' ? 'teacherGroupId' : 'studentGroupId']));
  const data = { classes: classes.length, classTitles: uniq(classes.map((e) => (e.summary || '').trim())).slice(0, 20), people: peopleOld.length };
  checkCache = { at: Date.now(), data };
  return data;
};

module.exports = { loadSwitchFlag, buildPreview, apply, check, buildIdMap, rewriteDescription, splitParts, analyseUnit, SWITCH_KEY };
