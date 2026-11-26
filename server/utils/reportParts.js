// 🧩 STEP 28 (26 Nov): ONE SUBJECT, SEVERAL TEACHERS
// Each teacher fills only THEIR part of a subject (e.g. Islamic Studies: "Fiqh" by Ayman, "Hadith" by another
// teacher). The subject's own fields (plan, completed, comment, score) are rebuilt from the parts, so every screen
// that already shows a subject keeps working:
// - one part  → the subject is exactly that part (same as before);
// - two parts → plan / notes list each part with its name and teacher; completed only when every part is;
//               score = average of the parts that were graded in the report phase (still out of the subject's max).
// Old reports have no parts yet: their subject data is treated as the part of the teacher who saved it (the only
// teacher in savedBy; if nobody is recorded, the teacher saving now).
const SUBJECTS = ['quran', 'arabic', 'islamicStudies'];

const plain = (x) => (x && x.toObject ? x.toObject() : x) || null;
const ownerOf = (report, fallbackTeacher) => {
  const savers = ((report && report.savedBy) || []).filter((e) => e && e.teacher);
  if (savers.length === 1) return { teacher: String(savers[0].teacher), teacherName: savers[0].teacherName || '' };
  if (savers.length === 0 && fallbackTeacher) return fallbackTeacher;
  return { teacher: null, teacherName: '' };
};

// The parts of one subject (old reports: one part made from the subject itself)
const partsOf = (report, key, fallbackTeacher) => {
  const sub = plain(report && report[key]);
  if (!sub) return [];
  if (Array.isArray(sub.parts) && sub.parts.length) return sub.parts.map((p) => ({ ...plain(p), teacher: p.teacher ? String(p.teacher) : null }));
  if (!sub.enrolled) return [];
  const owner = ownerOf(plain(report), fallbackTeacher);
  return [{ teacher: owner.teacher, teacherName: owner.teacherName, part: '', plan: sub.plan || '', completed: !!sub.completed, comment: sub.comment || '', score: sub.score == null ? null : Number(sub.score), final: !!(report && report.isFinalized), enrolled: true }];
};

const label = (p) => `${p.part ? p.part : 'Part'}${p.teacherName ? ` (${p.teacherName})` : ''}`;
const round1 = (n) => Math.round(n * 10) / 10;

// Subject fields rebuilt from its parts
const summarize = (parts, maxPossible) => {
  if (!parts.length) return { enrolled: false, plan: '', score: null, maxPossible: maxPossible || 0, completed: false, comment: '', parts: [] };
  if (parts.length === 1) {
    const p = parts[0];
    return { enrolled: true, plan: p.plan || '', score: p.score == null ? 0 : p.score, maxPossible: maxPossible || 0, completed: !!p.completed, comment: p.comment || '', parts };
  }
  const graded = parts.filter((p) => p.final && p.score != null && !Number.isNaN(Number(p.score)));
  const pool = graded.length ? graded : parts.filter((p) => p.score != null && !Number.isNaN(Number(p.score)));
  const score = pool.length ? round1(pool.reduce((s, p) => s + Number(p.score), 0) / pool.length) : 0;
  return {
    enrolled: true,
    plan: parts.map((p) => `${label(p)}: ${p.plan || ''}`.trim()).join('\n'),
    score,
    maxPossible: maxPossible || 0,
    completed: parts.every((p) => !!p.completed),
    comment: parts.filter((p) => (p.comment || '').trim()).map((p) => `${label(p)}: ${p.comment.trim()}`).join('\n'),
    parts
  };
};

// Put the saving teacher's part into each subject they filled; other teachers' parts are never touched.
// incoming[key] = { enrolled, plan, score, maxPossible, completed, comment }; partNames[key] = 'Fiqh'
const mergeSubjects = ({ existing, incoming, partNames = {}, teacher, isFinalized, now = new Date() }) => {
  const me = String(teacher._id);
  const fallback = { teacher: me, teacherName: teacher.name || '' };
  const out = {};
  for (const key of SUBJECTS) {
    const inc = incoming[key] || {};
    const parts = partsOf(existing, key, fallback);
    const i = parts.findIndex((p) => p.teacher === me);
    if (inc.enrolled) {
      const mine = {
        teacher: me,
        teacherName: teacher.name || '',
        part: String(partNames[key] || (i >= 0 ? parts[i].part : '') || '').trim().slice(0, 40),
        plan: inc.plan || '',
        completed: !!inc.completed,
        comment: inc.comment || '',
        score: inc.score === '' || inc.score == null || Number.isNaN(Number(inc.score)) ? null : Number(inc.score),
        final: !!isFinalized,
        enrolled: true,
        updatedAt: now
      };
      if (i >= 0) parts[i] = mine; else parts.push(mine);
    } // not ticked by this teacher: their part (if any) and everyone else's stay as they are
    const prevMax = existing && existing[key] ? plain(existing[key]).maxPossible : 0;
    out[key] = summarize(parts, Number(inc.maxPossible) || prevMax || 0);
  }
  return out;
};

// What the teacher's form needs: my part and the other teachers' parts, per subject
const viewFor = (report, teacher) => {
  const me = String(teacher._id);
  const fallback = { teacher: me, teacherName: teacher.name || '' };
  const view = {};
  for (const key of SUBJECTS) {
    const parts = partsOf(report, key, fallback);
    view[key] = { mine: parts.find((p) => p.teacher === me) || null, others: parts.filter((p) => p.teacher !== me) };
  }
  return view;
};

module.exports = { SUBJECTS, partsOf, summarize, mergeSubjects, viewFor, label };
