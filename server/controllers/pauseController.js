const User = require('../models/User');
const { calendar } = require('./scheduleController');
const { groupCode, userGroupCodes, classIsStudents, codesMatch, eventTeacherCodes, classBelongsToTeacher } = require('../utils/classMatch'); // 👪 22 Nov: sibling-safe match
const { sendMessage } = require('../utils/whatsappBot'); // ⏸️ Step 30: tell the teachers + the student group

// ==========================================
// ⏸️ STUDENT PAUSE (Step 3)
// ==========================================
// Full pause: status → 'paused', cycle saved (classes used / total / days left) to resume on return.
//             Future classes are removed ONLY when the admin presses the confirm button.
// Away:       status stays 'active'; all reminders for the student's classes are muted (cronJobs.js).
// Reactivate: admin only (never automatic). Full pause resumes the saved cycle from today.

const CALENDAR_ID = 'admin@learnwithayman.com';
const DAY_MS = 24 * 60 * 60 * 1000;

const fmtDay = (d) => new Date(d).toLocaleDateString('en-US', { timeZone: 'UTC', dateStyle: 'medium' });

// ==========================================
// ⏸️ STEP 30 (28 Nov): flexible return date + messages
// ==========================================
// Return date: an exact day, a month only (stored as the 1st of that month, shown as "December 2026"), or not known.
const untilText = (p) => {
  if (!p || !p.returnDate || p.returnPrecision === 'none') return '';
  return p.returnPrecision === 'month'
    ? new Date(p.returnDate).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
    : fmtDay(p.returnDate);
};
const readReturn = (body) => {
  const mode = body.returnMode || (body.returnDate ? 'date' : 'none');
  if (mode === 'none') return { ret: null, precision: 'none' };
  if (mode === 'month') {
    if (!/^\d{4}-\d{2}$/.test(String(body.returnMonth || ''))) return { error: 'Please choose the return month.' };
    return { ret: new Date(`${body.returnMonth}-01T00:00:00Z`), precision: 'month' };
  }
  const ret = body.returnDate ? new Date(body.returnDate) : null;
  if (!ret || isNaN(ret)) return { error: 'Please choose a return date.' };
  return { ret, precision: 'day' };
};
const cairoDay = (d) => new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Cairo', weekday: 'short', month: 'short', day: 'numeric' });
const SIGN = '*Learn With Ayman Admin Team*';
const teacherPausedMessage = (name, from, until, extended) => extended
  ? `السلام عليكم / Assalamu Alaikum 🌿\n\n⏸️ *Pause extended*\n👤 *Student:* ${name}\n${until ? `🔙 *Now paused until:* ${until}` : '🔙 *Return:* not known yet'}\n\nMore of their classes have been removed from the calendar (from ${from}). We'll let you know when they come back.\n\n${SIGN}`
  : `السلام عليكم / Assalamu Alaikum 🌿\n\n⏸️ *Student paused*\n👤 *Student:* ${name}\n📅 *Classes removed from:* ${from}${until ? `\n🔙 *Expected back:* ${until}` : ''}\n\nTheir classes have been removed from the calendar. We'll let you know when they come back.\n\n${SIGN}`;
const studentPausedMessage = (name, from, until, extended) => `السلام عليكم / Assalamu Alaikum 🌙\n\n⏸️ *${extended ? 'Pause extended' : 'Classes paused'}*\n👤 *Student:* ${name}\n\n${extended
  ? `Your pause is now extended${until ? ` until *${until}*` : ''}.`
  : `As requested, your classes are paused from *${from}*${until ? ` until *${until}*` : ''}.`} We'll be happy to welcome you back, in shā’ Allāh. Contact us anytime to resume.\n\n*Learn With Ayman Admin Team* 💚`;
const teacherAwayMessage = (name, until, extended) => `السلام عليكم / Assalamu Alaikum 🌿\n\n🧳 *${extended ? 'Student still away' : 'Student away'}*\n👤 *Student:* ${name}\n📅 *Away until:* ${until || 'further notice'}\n\nNo need to wait for them in class; their reminders are paused. We'll let you know when they're back.\n\n${SIGN}`;

// The teachers of a list of classes (each with teacherCodes): [{ teacher, first }]
const teachersOfClasses = async (classes) => {
  const teachers = await User.find({ role: 'teacher' }, 'name teacherGroupId legacyGroupIds');
  const out = new Map();
  for (const c of classes) {
    const t = teachers.find((x) => classBelongsToTeacher(c.teacherCodes || [], x));
    if (!t) continue;
    const k = String(t._id);
    if (!out.has(k) || new Date(c.startTime) < new Date(out.get(k).first)) out.set(k, { teacher: t, first: c.startTime });
  }
  return [...out.values()];
};
const send = async (target, text) => {
  if (!target || !String(target).trim()) return false;
  try { await sendMessage(String(target).trim(), text); return true; } catch (e) { console.error('Pause message failed:', e.message); return false; }
};
// Away (new or extended): tell the teachers of the student's upcoming classes
const tellAwayTeachers = async (user, extended) => {
  const classes = await findFutureClasses(user);
  const list = await teachersOfClasses(classes);
  const told = [];
  for (const { teacher } of list) if (await send(teacher.teacherGroupId, teacherAwayMessage(user.name, untilText(user.pause), extended))) told.push(teacher.name);
  return told;
};

// @desc    Start (or update the return date of) a pause
// @route   POST /api/users/:id/pause   body: { kind: 'full' | 'away', returnDate: 'YYYY-MM-DD' }
// @access  Admin
const setPause = async (req, res) => {
  try {
    const { kind } = req.body;
    if (!['full', 'away'].includes(kind)) return res.status(400).json({ message: 'Choose Full pause or Away.' });
    const back = readReturn(req.body); // ⏸️ Step 30: exact date / month only / not known
    if (back.error) return res.status(400).json({ message: back.error });
    const ret = back.ret;

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Student not found' });

    // Already paused: only the return date can change (to switch kind, reactivate first)
    if (user.pause && user.pause.kind) {
      if (user.pause.kind !== kind) {
        return res.status(400).json({ message: 'This student is already paused with a different kind. Reactivate first, then pause again.' });
      }
      user.pause.returnDate = ret;
      user.pause.returnPrecision = back.precision;
      user.pause.adminAlertSentAt = undefined;
      user.pause.studentWelcomeSentAt = undefined;
      await user.save();
      const until = untilText(user.pause) || 'not known yet';
      if (kind === 'away') { // ⏸️ Step 30: "still away until …" to the teachers
        const told = await tellAwayTeachers(user, true);
        return res.status(200).json({ message: `Return updated: ${until}. ${told.length ? `Teachers told: ${told.join(', ')}.` : 'No upcoming classes, so no teacher was messaged.'}`, user });
      }
      return res.status(200).json({ message: `Return updated: ${until}. If the pause is longer now, press "Show future classes to remove" to remove the extra classes; the teachers and the student group are told then.`, user });
    }

    const now = new Date();
    const pause = { kind, startedAt: now, returnDate: ret, returnPrecision: back.precision };

    if (kind === 'full') {
      const sub = user.subscription || {};
      pause.savedClassesUsed = sub.classesUsed || 0;
      pause.savedTotalClasses = sub.totalClassesBought || 0;
      pause.savedDaysLeft = sub.endDate ? Math.max(0, Math.ceil((new Date(sub.endDate) - now) / DAY_MS)) : 0;
      if (!user.subscription) user.subscription = {};
      user.subscription.status = 'paused';
    }

    user.pause = pause;
    await user.save();
    const until = untilText(user.pause) || 'not known yet';
    let awayNote = '';
    if (kind === 'away') { // ⏸️ Step 30: tell the teachers of the upcoming classes
      const told = await tellAwayTeachers(user, false);
      user.pause.teachersToldAt = told.length ? new Date() : undefined;
      if (told.length) await user.save();
      awayNote = told.length ? ` Teachers told: ${told.join(', ')}.` : ' No upcoming classes, so no teacher was messaged.';
    }
    res.status(200).json({
      message: kind === 'full'
        ? `⏸️ Full pause saved (return: ${until}). Cycle saved: ${pause.savedClassesUsed}/${pause.savedTotalClasses} classes used, ${pause.savedDaysLeft} days left. Next: remove the future classes; the teachers and the student group are told then.`
        : `🧳 Away saved (return: ${until}). All reminders for this student are muted.${awayNote}`,
      user
    });
  } catch (error) {
    console.error('Error saving pause:', error);
    res.status(500).json({ message: 'Server error while saving the pause.' });
  }
};

// Student's future classes from now until the return date
const findFutureClasses = async (user) => {
  const now = new Date();
  const until = user.pause?.returnDate ? new Date(user.pause.returnDate) : new Date(now.getTime() + 90 * DAY_MS);
  const response = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: now.toISOString(),
    timeMax: until.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250
  });
  const students = await User.find({ role: 'student' }, 'name studentGroupId legacyGroupIds whatsappGroupId'); // 👪 siblings sharing one link
  return (response.data.items || [])
    .filter((event) => classIsStudents(event, user, students))
    .map((event) => ({ id: event.id, title: event.summary, startTime: event.start.dateTime || event.start.date, teacherCodes: eventTeacherCodes(event) }));
};

// @desc    List the student's future classes during a full pause (for the confirm button)
// @route   GET /api/users/:id/pause/classes
// @access  Admin
const getPauseClasses = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Student not found' });
    if (user.pause?.kind !== 'full') return res.status(400).json({ message: 'Classes are only removed for a Full pause.' });
    const classes = await findFutureClasses(user);
    res.status(200).json({ classes });
  } catch (error) {
    console.error('Error listing pause classes:', error);
    res.status(500).json({ message: 'Server error while loading the classes from Google Calendar.' });
  }
};

// @desc    Remove the confirmed future classes from Google Calendar
// @route   POST /api/users/:id/pause/remove-classes   body: { eventIds: [...] }
// @access  Admin
const removePauseClasses = async (req, res) => {
  try {
    const { eventIds } = req.body;
    if (!Array.isArray(eventIds) || !eventIds.length) return res.status(400).json({ message: 'No classes selected.' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Student not found' });
    if (user.pause?.kind !== 'full') return res.status(400).json({ message: 'Classes are only removed for a Full pause.' });

    // Safety: only delete classes that still belong to this student in this pause window
    const future = await findFutureClasses(user);
    const allowed = new Set(future.map((c) => c.id));
    let removed = 0;
    const failed = [];
    const removedClasses = []; // ⏸️ Step 30: to tell their teachers
    for (const id of eventIds) {
      if (!allowed.has(id)) { failed.push(id); continue; }
      try {
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: id });
        removed++;
        removedClasses.push(future.find((c) => c.id === id));
      } catch (err) {
        console.error(`Pause: could not delete event ${id}:`, err.message);
        failed.push(id);
      }
    }

    user.pause.classesRemovedAt = new Date();
    user.pause.classesRemovedCount = (user.pause.classesRemovedCount || 0) + removed;

    // ⏸️ Step 30: tell each teacher whose classes were removed + the student group (once; a later removal = "extended")
    let note = '';
    if (removedClasses.length) {
      const extended = !!user.pause.teachersToldAt;
      const until = untilText(user.pause);
      const first = removedClasses.reduce((a, c) => (new Date(c.startTime) < new Date(a.startTime) ? c : a)).startTime;
      const told = [];
      for (const { teacher, first: tFirst } of await teachersOfClasses(removedClasses)) {
        if (await send(teacher.teacherGroupId, teacherPausedMessage(user.name, cairoDay(tFirst), until, extended))) told.push(teacher.name);
      }
      const studentTold = await send(user.studentGroupId, studentPausedMessage(user.name, cairoDay(first), until, extended));
      if (told.length) user.pause.teachersToldAt = new Date();
      if (studentTold) user.pause.studentToldAt = new Date();
      note = ` Teachers told: ${told.length ? told.join(', ') : 'none (no teacher found for these classes)'}. Student group: ${studentTold ? 'told' : 'NOT told (no group link saved)'}.`;
    }
    await user.save();
    res.status(200).json({ message: `🗑️ Removed ${removed} class(es) from Google Calendar.${failed.length ? ` ${failed.length} could not be removed.` : ''}${note}`, removed, failed, user });
  } catch (error) {
    console.error('Error removing pause classes:', error);
    res.status(500).json({ message: 'Server error while removing the classes.' });
  }
};

// @desc    Reactivate a paused / away student (admin only, never automatic)
// @route   POST /api/users/:id/reactivate
// @access  Admin
const reactivateStudent = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Student not found' });
    if (!user.pause?.kind) return res.status(400).json({ message: 'This student is not paused.' });

    let message = '✅ Student is back. Reminders are on again.';
    if (user.pause.kind === 'full') {
      // Resume the cycle where it stopped
      const now = new Date();
      if (!user.subscription) user.subscription = {};
      user.subscription.status = 'active';
      user.subscription.startDate = now;
      user.subscription.endDate = new Date(now.getTime() + (user.pause.savedDaysLeft || 0) * DAY_MS);
      user.subscription.classesUsed = user.pause.savedClassesUsed || 0;
      user.subscription.totalClassesBought = user.pause.savedTotalClasses || 0;
      message = `✅ Reactivated. Cycle resumed: ${user.subscription.classesUsed}/${user.subscription.totalClassesBought} classes used, ends ${fmtDay(user.subscription.endDate)}. Please confirm the schedule in Google Calendar.`;
    }

    user.pause = undefined;
    await user.save();
    res.status(200).json({ message, user });
  } catch (error) {
    console.error('Error reactivating student:', error);
    res.status(500).json({ message: 'Server error while reactivating.' });
  }
};

// @desc    Paused / away students (so teachers see "Student away until…" on their classes)
// @route   GET /api/schedule/away-students
// @access  Teacher
const getAwayStudents = async (req, res) => {
  try {
    const users = await User.find({ 'pause.kind': { $in: ['full', 'away'] } }, 'name studentGroupId legacyGroupIds pause');
    // 👪 25 Nov (Step 24): brothers / sisters on ONE link (Jouri + Oday): the dashboard banner must also find the name
    const students = users.length ? await User.find({ role: 'student' }, 'name studentGroupId legacyGroupIds') : [];
    const sharesLink = (u) => {
      const mine = userGroupCodes(u, 'studentGroupId');
      return mine.length > 0 && students.some((o) => String(o._id) !== String(u._id) && codesMatch(userGroupCodes(o, 'studentGroupId'), mine));
    };
    res.status(200).json(users.map((u) => ({
      name: u.name,
      code: groupCode(u.studentGroupId),
      codes: userGroupCodes(u, 'studentGroupId'), // 🔗 invite link code + old IDs
      kind: u.pause.kind,
      returnDate: u.pause.returnDate,
      returnText: untilText(u.pause), // ⏸️ Step 30: "Dec 15, 2026" / "December 2026" / '' (not known)
      shared: sharesLink(u)// true → the class must also name this student
    })));
  } catch (error) {
    console.error('Error loading away students:', error);
    res.status(500).json({ message: 'Server error while loading away students.' });
  }
};

module.exports = { setPause, getPauseClasses, removePauseClasses, reactivateStudent, getAwayStudents };
