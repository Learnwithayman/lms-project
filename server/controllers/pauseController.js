const User = require('../models/User');
const { calendar } = require('./scheduleController');
const { groupCode, parseEventStudent, classBelongsToStudent } = require('../utils/classMatch');

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

// @desc    Start (or update the return date of) a pause
// @route   POST /api/users/:id/pause   body: { kind: 'full' | 'away', returnDate: 'YYYY-MM-DD' }
// @access  Admin
const setPause = async (req, res) => {
  try {
    const { kind, returnDate } = req.body;
    if (!['full', 'away'].includes(kind)) return res.status(400).json({ message: 'Choose Full pause or Away.' });
    const ret = returnDate ? new Date(returnDate) : null;
    if (!ret || isNaN(ret)) return res.status(400).json({ message: 'Please choose a return date.' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Student not found' });

    // Already paused: only the return date can change (to switch kind, reactivate first)
    if (user.pause && user.pause.kind) {
      if (user.pause.kind !== kind) {
        return res.status(400).json({ message: 'This student is already paused with a different kind. Reactivate first, then pause again.' });
      }
      user.pause.returnDate = ret;
      user.pause.adminAlertSentAt = undefined;
      user.pause.studentWelcomeSentAt = undefined;
      await user.save();
      return res.status(200).json({ message: `Return date updated to ${fmtDay(ret)}.`, user });
    }

    const now = new Date();
    const pause = { kind, startedAt: now, returnDate: ret };

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
    res.status(200).json({
      message: kind === 'full'
        ? `⏸️ Full pause saved until ${fmtDay(ret)}. Cycle saved: ${pause.savedClassesUsed}/${pause.savedTotalClasses} classes used, ${pause.savedDaysLeft} days left.`
        : `🧳 Away saved until ${fmtDay(ret)}. All reminders for this student are muted.`,
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
  return (response.data.items || [])
    .filter((event) => classBelongsToStudent(parseEventStudent(event), user))
    .map((event) => ({ id: event.id, title: event.summary, startTime: event.start.dateTime || event.start.date }));
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
    const allowed = new Set((await findFutureClasses(user)).map((c) => c.id));
    let removed = 0;
    const failed = [];
    for (const id of eventIds) {
      if (!allowed.has(id)) { failed.push(id); continue; }
      try {
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: id });
        removed++;
      } catch (err) {
        console.error(`Pause: could not delete event ${id}:`, err.message);
        failed.push(id);
      }
    }

    user.pause.classesRemovedAt = new Date();
    user.pause.classesRemovedCount = (user.pause.classesRemovedCount || 0) + removed;
    await user.save();
    res.status(200).json({ message: `🗑️ Removed ${removed} class(es) from Google Calendar.${failed.length ? ` ${failed.length} could not be removed.` : ''}`, removed, failed, user });
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
    const users = await User.find({ 'pause.kind': { $in: ['full', 'away'] } }, 'name studentGroupId pause');
    res.status(200).json(users.map((u) => ({
      name: u.name,
      code: groupCode(u.studentGroupId),
      kind: u.pause.kind,
      returnDate: u.pause.returnDate
    })));
  } catch (error) {
    console.error('Error loading away students:', error);
    res.status(500).json({ message: 'Server error while loading away students.' });
  }
};

module.exports = { setPause, getPauseClasses, removePauseClasses, reactivateStudent, getAwayStudents };
