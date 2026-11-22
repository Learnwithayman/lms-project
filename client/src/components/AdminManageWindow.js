import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

// ==========================================
// 🛠️ STEP 11 (23 Nov): ADMIN "MANAGE" WINDOW
// ==========================================
// One window where the admin can do what a student or teacher can do on scheduling:
//   📅 Classes  → postpone (3 ways) or cancel any upcoming class
//   🎒 Credits  → see the student's makeup credits, add a new one
//   ➕ Book     → book a makeup (uses a credit) or an extra class, from the teacher's free times or any time
// Everything changes Google Calendar directly and messages BOTH the student's and the teacher's group.
// Replaces the old separate 🔁 Postpone / 🚫 Cancel boxes and the silent "Grant Makeup Credit" form.
// Open it with a studentId (student profile) or a focusEvent (a class from the live monitor).

const box = { border: '1px solid #e9eef2', borderRadius: '8px', padding: '12px', marginBottom: '10px', backgroundColor: 'white' };
const btn = (bg, color = 'white') => ({ padding: '6px 12px', backgroundColor: bg, color, border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', whiteSpace: 'nowrap' });
const input = { width: '100%', boxSizing: 'border-box', padding: '8px', borderRadius: '6px', border: '1px solid #dfe6e9', marginTop: '4px', fontSize: '14px' };
const when = (d) => new Date(d).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const day = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function SlotPicker({ slots, picked, manual, onPick, onManual }) {
  if (!slots) return <p style={{ fontSize: '13px' }}>Loading free times...</p>;
  if (slots.error) return <p style={{ color: '#d63031', fontSize: '13px' }}>{slots.error}</p>;
  const groups = {};
  (slots.slots || []).forEach((s) => {
    const k = new Date(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    (groups[k] = groups[k] || []).push(s);
  });
  return (
    <div style={{ marginTop: '8px' }}>
      {!slots.hasHours && <p style={{ color: '#d35400', fontSize: '13px', margin: '0 0 6px 0' }}>⚠️ {slots.teacher?.name} has not set their free hours yet. You can still type a time below.</p>}
      {slots.hasHours && !slots.fresh && <p style={{ color: '#d35400', fontSize: '13px', margin: '0 0 6px 0' }}>⚠️ {slots.teacher?.name} has not confirmed their hours since Monday.</p>}
      {Object.keys(groups).length === 0 && <p style={{ fontSize: '13px', color: '#636e72' }}>No free times in the next 14 days.</p>}
      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {Object.entries(groups).map(([label, list]) => (
          <div key={label} style={{ marginBottom: '8px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>{label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {list.map((s) => (
                <button key={s} type="button" onClick={() => onPick(s)} style={{ padding: '4px 8px', borderRadius: '5px', border: picked === s && !manual ? '2px solid #00b894' : '1px solid #dfe6e9', backgroundColor: picked === s && !manual ? '#eafaf1' : 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                  {new Date(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <label style={{ display: 'block', fontSize: '13px', marginTop: '8px' }}>Or type a time (your time):
        <input type="datetime-local" value={manual} onChange={(e) => onManual(e.target.value)} style={{ marginLeft: '6px', padding: '4px', borderRadius: '5px', border: '1px solid #dfe6e9' }} />
      </label>
    </div>
  );
}

function AdminManageWindow({ apiUrl, studentId: initialStudentId, focusEvent, onClose, onChanged }) {
  const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  const [studentId, setStudentId] = useState(initialStudentId || '');
  const [choices, setChoices] = useState([]);          // brothers / sisters to choose from (class opened from the live monitor)
  const [resolveError, setResolveError] = useState('');
  const [data, setData] = useState(null);              // overview: classes, credits, teachers, history
  const [tab, setTab] = useState('classes');
  const [busy, setBusy] = useState(false);

  // class action (postpone / cancel)
  const [act, setAct] = useState(null);                // { cls, type, info, mode, newStart, manualTime, newTeacherId, reason, cancelledBy, giveCredit, payTeacher }
  const [actSlots, setActSlots] = useState(null);
  // grant a credit
  const [grant, setGrant] = useState({ teacherId: '', reason: '', originalDate: '', durationMinutes: 60 });
  // book a class
  const [book, setBook] = useState({ teacherId: '', useCredit: true, creditId: '', durationMinutes: 60, newStart: '', manualTime: '' });
  const [bookSlots, setBookSlots] = useState(null);

  const errText = (e, fallback) => e.response?.data?.message || fallback;

  const loadOverview = useCallback(async (id) => {
    if (!id) return;
    try {
      const res = await axios.get(`${apiUrl}/api/schedule/admin/student/${id}/manage`, auth());
      setData(res.data);
      setGrant((g) => ({ ...g, teacherId: g.teacherId || res.data.mainTeacherId || '' }));
      setBook((b) => ({ ...b, teacherId: b.teacherId || res.data.mainTeacherId || '', useCredit: res.data.credits.length > 0 }));
    } catch (e) {
      setData({ error: errText(e, 'Could not load this student.') });
    }
  }, [apiUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened from a class: find who it is for, then open that class's actions
  useEffect(() => {
    (async () => {
      if (initialStudentId) { loadOverview(initialStudentId); return; }
      if (!focusEvent) return;
      try {
        const res = await axios.get(`${apiUrl}/api/schedule/admin/class-info/${encodeURIComponent(focusEvent.id)}`, auth());
        const info = res.data;
        if (info.student) { setStudentId(info.student.id); loadOverview(info.student.id); }
        else if ((info.studentChoices || []).length > 1) setChoices(info.studentChoices);
        else setResolveError('The student of this class was not found in the LMS. You can still postpone or cancel this class.');
        openAction(focusEvent, null, info);
      } catch (e) {
        setResolveError(errText(e, 'Could not load this class.'));
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = async (message) => {
    alert(`✅ ${message}`);
    setAct(null); setActSlots(null);
    setBook((b) => ({ ...b, newStart: '', manualTime: '' })); setBookSlots(null);
    await loadOverview(studentId);
    if (onChanged) onChanged();
  };

  // ---------- 📅 class actions ----------
  const openAction = async (cls, type, preloaded = null) => {
    const minutesUntil = (new Date(cls.startTime).getTime() - Date.now()) / 60000;
    setActSlots(null);
    setAct({ cls, type, info: preloaded, mode: 'student', newStart: '', manualTime: '', newTeacherId: '', reason: '', cancelledBy: '', giveCredit: null, payTeacher: minutesUntil < 30 });
    if (preloaded) return;
    try {
      const res = await axios.get(`${apiUrl}/api/schedule/admin/class-info/${encodeURIComponent(cls.id)}`, auth());
      setAct((a) => a && a.cls.id === cls.id ? { ...a, info: res.data } : a);
    } catch (e) {
      setAct((a) => a && a.cls.id === cls.id ? { ...a, info: { error: errText(e, 'Could not load this class.') } } : a);
    }
  };
  const loadActSlots = async (teacherId) => {
    setActSlots(null);
    if (!teacherId || !act?.info) return;
    try {
      const res = await axios.get(`${apiUrl}/api/schedule/admin/free-slots?teacherId=${teacherId}&durationMinutes=${act.info.durationMinutes || 60}&eventId=${encodeURIComponent(act.cls.id)}${studentId ? `&studentId=${studentId}` : ''}`, auth());
      setActSlots(res.data);
    } catch (e) { setActSlots({ error: errText(e, 'Could not load free times.') }); }
  };
  const submitAction = async () => {
    const a = act;
    if (!a || !a.type) return;
    setBusy(true);
    try {
      let res;
      if (a.type === 'cancel') {
        if (!a.cancelledBy) return alert('Please choose who cancelled.');
        if (a.giveCredit === null) return alert('Please choose whether to give a makeup credit.');
        res = await axios.post(`${apiUrl}/api/schedule/admin-cancel`, { eventId: a.cls.id, cancelledBy: a.cancelledBy, giveCredit: a.giveCredit, payTeacher: a.payTeacher, reason: a.reason, studentId: studentId || undefined }, auth());
      } else {
        const newStart = a.manualTime ? new Date(a.manualTime).toISOString() : a.newStart;
        if (a.mode === 'time' && !newStart) return alert('Please choose the new time.');
        if (a.mode === 'teacher' && !a.newTeacherId) return alert('Please choose the new teacher.');
        res = await axios.post(`${apiUrl}/api/schedule/admin-postpone`, { eventId: a.cls.id, mode: a.mode, newStart: newStart || undefined, newTeacherId: a.newTeacherId || undefined, reason: a.reason, studentId: studentId || undefined }, auth());
      }
      await changed(res.data.message);
    } catch (e) {
      alert(`❌ ${errText(e, 'Something went wrong.')}`);
    } finally { setBusy(false); }
  };

  // ---------- 🎒 grant a credit ----------
  const submitGrant = async () => {
    if (!window.confirm(`Add a makeup credit for ${data.student.name}?\n\nThe student and the teacher will get a WhatsApp message.`)) return;
    setBusy(true);
    try {
      const res = await axios.post(`${apiUrl}/api/schedule/admin/grant-credit`, { studentId, ...grant }, auth());
      setGrant((g) => ({ ...g, reason: '', originalDate: '' }));
      await changed(res.data.message);
    } catch (e) { alert(`❌ ${errText(e, 'Could not add the credit.')}`); }
    finally { setBusy(false); }
  };

  // ---------- ➕ book a class ----------
  const loadBookSlots = async (teacherId, minutes) => {
    setBookSlots(null);
    if (!teacherId) return;
    try {
      const res = await axios.get(`${apiUrl}/api/schedule/admin/free-slots?teacherId=${teacherId}&durationMinutes=${minutes || 60}&studentId=${studentId}`, auth());
      setBookSlots(res.data);
    } catch (e) { setBookSlots({ error: errText(e, 'Could not load free times.') }); }
  };
  const bookMinutes = () => {
    if (book.useCredit) {
      const c = (data?.credits || []).find((x) => x.id === book.creditId) || (data?.credits || [])[0];
      return c ? c.durationMinutes : 60;
    }
    return Number(book.durationMinutes) || 60;
  };
  useEffect(() => {
    if (tab === 'book' && book.teacherId && studentId) loadBookSlots(book.teacherId, bookMinutes());
  }, [tab, book.teacherId, book.useCredit, book.creditId, book.durationMinutes, studentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const submitBook = async () => {
    const start = book.manualTime ? new Date(book.manualTime).toISOString() : book.newStart;
    if (!book.teacherId) return alert('Please choose the teacher.');
    if (!start) return alert('Please choose a time.');
    const teacher = (data.teachers || []).find((t) => t.id === book.teacherId);
    if (!window.confirm(`Book ${book.useCredit ? 'a makeup (uses a credit)' : 'an extra class (no credit)'} for ${data.student.name} with ${teacher ? teacher.name : 'the teacher'} on ${when(start)}?\n\nIt goes on Google Calendar and both groups get a WhatsApp message.`)) return;
    setBusy(true);
    try {
      const res = await axios.post(`${apiUrl}/api/schedule/admin/book-class`, { studentId, teacherId: book.teacherId, start, useCredit: book.useCredit, creditId: book.creditId || undefined, durationMinutes: book.useCredit ? undefined : book.durationMinutes }, auth());
      await changed(res.data.message);
    } catch (e) {
      alert(`❌ ${errText(e, 'Could not book this class.')}`);
      if (e.response?.status === 409) loadBookSlots(book.teacherId, bookMinutes());
    } finally { setBusy(false); }
  };

  // ---------- render ----------
  const radio = (name, value, label, current, onPick) => (
    <label key={String(value)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', cursor: 'pointer', fontSize: '14px' }}>
      <input type="radio" name={name} checked={current === value} onChange={() => onPick(value)} /> {label}
    </label>
  );
  const setA = (patch) => setAct((a) => ({ ...a, ...patch }));

  const actionPanel = () => {
    const a = act;
    const info = a.info;
    if (!info) return <p style={{ fontSize: '13px' }}>Loading...</p>;
    if (info.error) return <p style={{ color: '#d63031' }}>{info.error}</p>;
    return (
      <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setA({ type: 'postpone' })} style={btn(a.type === 'postpone' ? '#6c5ce7' : '#dfe6e9', a.type === 'postpone' ? 'white' : '#2d3436')}>🔁 Postpone</button>
          <button type="button" onClick={() => setA({ type: 'cancel' })} style={btn(a.type === 'cancel' ? '#e74c3c' : '#dfe6e9', a.type === 'cancel' ? 'white' : '#2d3436')}>🚫 Cancel</button>
        </div>
        {a.type === 'cancel' && (
          <>
            <h4 style={{ margin: '4px 0' }}>Who cancelled?</h4>
            {[['student', 'Student'], ['teacher', 'Teacher'], ['admin', 'Admin']].map(([v, l]) => radio(`cb-${a.cls.id}`, v, l, a.cancelledBy, (val) => setA({ cancelledBy: val })))}
            <h4 style={{ margin: '10px 0 4px 0' }}>Give makeup credit?</h4>
            {radio(`gc-${a.cls.id}`, true, 'Yes, add a makeup credit', a.giveCredit, (val) => setA({ giveCredit: val }))}
            {radio(`gc-${a.cls.id}`, false, 'No, count it from the package', a.giveCredit, (val) => setA({ giveCredit: val }))}
            <h4 style={{ margin: '10px 0 4px 0' }}>Pay the teacher for this class?</h4>
            {radio(`pt-${a.cls.id}`, true, 'Yes', a.payTeacher, (val) => setA({ payTeacher: val }))}
            {radio(`pt-${a.cls.id}`, false, 'No', a.payTeacher, (val) => setA({ payTeacher: val }))}
            <p style={{ fontSize: '12px', color: '#636e72', margin: '2px 0 0 0' }}>Suggested by the 30-minute rule. You can change it.</p>
          </>
        )}
        {a.type === 'postpone' && (
          <>
            {radio(`m-${a.cls.id}`, 'student', '1. Let the student choose (makeup credit + "choose a new time" message)', a.mode, (val) => { setA({ mode: val, newStart: '', manualTime: '' }); setActSlots(null); })}
            {radio(`m-${a.cls.id}`, 'time', "2. I'll pick the new time", a.mode, (val) => { setA({ mode: val, newStart: '', manualTime: '' }); if (info.teacher) loadActSlots(info.teacher.id); })}
            {radio(`m-${a.cls.id}`, 'teacher', '3. Move to another teacher', a.mode, (val) => { setA({ mode: val, newStart: '', manualTime: '', newTeacherId: '' }); setActSlots(null); })}
            {a.mode === 'time' && (info.teacher
              ? <SlotPicker slots={actSlots} picked={a.newStart} manual={a.manualTime} onPick={(s) => setA({ newStart: s, manualTime: '' })} onManual={(v) => setA({ manualTime: v })} />
              : <p style={{ color: '#d63031' }}>The teacher of this class was not found.</p>)}
            {a.mode === 'teacher' && (
              <div style={{ marginTop: '6px' }}>
                <select value={a.newTeacherId} onChange={(e) => { setA({ newTeacherId: e.target.value, newStart: '', manualTime: '' }); loadActSlots(e.target.value); }} style={input}>
                  <option value="">-- Choose the new teacher --</option>
                  {(info.teachers || []).filter((t) => t.id !== info.teacher?.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {a.newTeacherId && (
                  <>
                    <p style={{ fontSize: '13px', margin: '8px 0 0 0' }}>Keep the same time, or choose a new one below. {(a.newStart || a.manualTime) && <button type="button" onClick={() => setA({ newStart: '', manualTime: '' })} style={{ marginLeft: '6px', fontSize: '12px', cursor: 'pointer' }}>↩ Keep same time</button>}</p>
                    <SlotPicker slots={actSlots} picked={a.newStart} manual={a.manualTime} onPick={(s) => setA({ newStart: s, manualTime: '' })} onManual={(v) => setA({ manualTime: v })} />
                  </>
                )}
              </div>
            )}
          </>
        )}
        {a.type && (
          <>
            <input type="text" placeholder="Reason (optional, saved in the history)" value={a.reason} onChange={(e) => setA({ reason: e.target.value })} style={{ ...input, marginTop: '10px' }} />
            <button onClick={submitAction} disabled={busy} style={{ ...btn(busy ? '#b2bec3' : (a.type === 'cancel' ? '#e74c3c' : '#6c5ce7')), width: '100%', marginTop: '10px', padding: '10px' }}>
              {busy ? 'Working...' : a.type === 'cancel' ? '🚫 Cancel this class' : '🔁 Postpone this class'}
            </button>
          </>
        )}
      </div>
    );
  };

  // classes shown: the student's upcoming ones, or just the focused class when the student is unknown
  const focusRow = focusEvent ? [{ id: focusEvent.id, title: focusEvent.title, startTime: focusEvent.startTime, teacherName: '' }] : [];
  const classes = data && !data.error
    ? (focusEvent && !data.classes.some((c) => c.id === focusEvent.id) ? [...focusRow, ...data.classes] : data.classes) // the clicked class is always shown
    : focusRow;
  const hasStudent = !!(data && !data.error && data.student);
  const tabBtn = (key, label) => (
    <button type="button" onClick={() => setTab(key)} disabled={key !== 'classes' && !hasStudent} style={{ flex: 1, padding: '8px', border: 'none', borderBottom: tab === key ? '3px solid #0984e3' : '3px solid transparent', backgroundColor: 'transparent', cursor: key !== 'classes' && !hasStudent ? 'not-allowed' : 'pointer', fontWeight: tab === key ? 'bold' : 'normal', color: key !== 'classes' && !hasStudent ? '#b2bec3' : '#2d3436', fontSize: '14px' }}>{label}</button>
  );

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
      <div style={{ backgroundColor: '#f5f6fa', padding: '20px', borderRadius: '12px', width: '600px', maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', color: '#2d3436' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>🛠️ Manage{hasStudent ? `: ${data.student.name}` : ''}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖</button>
        </div>
        <p style={{ margin: '4px 0 12px 0', fontSize: '12px', color: '#636e72' }}>Every change goes to Google Calendar and is sent to the student's and the teacher's WhatsApp groups. Times are in your time.</p>

        {hasStudent && data.student.paused && <p style={{ color: '#d35400', fontSize: '13px', margin: '0 0 10px 0' }}>⏸️ This student is fully paused.</p>}
        {hasStudent && !data.student.hasGroup && <p style={{ color: '#d35400', fontSize: '13px', margin: '0 0 10px 0' }}>⚠️ No student group link saved: messages go to the link written in the class, if any.</p>}

        {/* 👪 class shared by brothers / sisters: choose the child first */}
        {!studentId && choices.length > 1 && (
          <div style={{ ...box, borderColor: '#fdcb6e' }}>
            <label style={{ fontWeight: 'bold', fontSize: '14px' }}>👪 Which child is this class for?</label>
            <select value="" onChange={(e) => { if (e.target.value) { setStudentId(e.target.value); loadOverview(e.target.value); } }} style={input}>
              <option value="">-- Choose --</option>
              {choices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        {resolveError && <p style={{ color: '#d35400', fontSize: '13px' }}>{resolveError}</p>}
        {data && data.error && <p style={{ color: '#d63031' }}>{data.error}</p>}

        <div style={{ display: 'flex', borderBottom: '1px solid #dfe6e9', marginBottom: '12px', backgroundColor: 'white', borderRadius: '8px 8px 0 0' }}>
          {tabBtn('classes', `📅 Classes${hasStudent ? ` (${data.classes.length})` : ''}`)}
          {tabBtn('credits', `🎒 Credits${hasStudent ? ` (${data.credits.length})` : ''}`)}
          {tabBtn('book', '➕ Book a class')}
        </div>

        {/* 📅 CLASSES */}
        {tab === 'classes' && (
          <>
            {!data && !focusEvent && <p>Loading...</p>}
            {hasStudent && classes.length === 0 && <p style={{ fontSize: '13px', color: '#636e72' }}>No classes in the next 30 days.</p>}
            {classes.map((c) => (
              <div key={c.id} style={{ ...box, borderColor: act && act.cls.id === c.id ? '#0984e3' : '#e9eef2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14px' }}><strong>{c.title}</strong><br /><small>🕒 {when(c.startTime)}{c.teacherName ? ` · 👨‍🏫 ${c.teacherName}` : ''}</small></span>
                  {!(act && act.cls.id === c.id)
                    ? <button type="button" onClick={() => openAction(c, null)} style={btn('#0984e3')}>Change…</button>
                    : <button type="button" onClick={() => setAct(null)} style={btn('#dfe6e9', '#2d3436')}>Close</button>}
                </div>
                {act && act.cls.id === c.id && actionPanel()}
              </div>
            ))}
          </>
        )}

        {/* 🎒 CREDITS */}
        {tab === 'credits' && hasStudent && (
          <>
            {data.credits.length === 0 && <p style={{ fontSize: '13px', color: '#636e72' }}>No active makeup credits.</p>}
            {data.credits.map((c) => (
              <div key={c.id} style={{ ...box, fontSize: '14px' }}>
                🎒 <strong>{c.reason || 'Makeup credit'}</strong>{c.teacherName ? ` · 👨‍🏫 ${c.teacherName}` : ''} · {c.durationMinutes} min
                <div style={{ fontSize: '12px', color: '#636e72' }}>For the class of {day(c.originalClassDate)} · valid until {day(c.expirationDate)}{c.waiting ? ' · ⏳ waiting for the teacher to update their hours' : ''}</div>
              </div>
            ))}
            <div style={{ ...box, borderColor: '#00b894' }}>
              <h4 style={{ margin: '0 0 6px 0' }}>➕ Add a makeup credit (valid 90 days)</h4>
              <label style={{ fontSize: '13px' }}>Teacher
                <select value={grant.teacherId} onChange={(e) => setGrant({ ...grant, teacherId: e.target.value })} style={input}>
                  <option value="">-- The teacher of their classes --</option>
                  {data.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label style={{ fontSize: '13px', display: 'block', marginTop: '6px' }}>Reason (the student sees it)
                <input type="text" placeholder="e.g. Teacher was sick, Internet problem" value={grant.reason} onChange={(e) => setGrant({ ...grant, reason: e.target.value })} style={input} />
              </label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <label style={{ fontSize: '13px', flex: 1 }}>Missed class date (optional)
                  <input type="date" value={grant.originalDate} onChange={(e) => setGrant({ ...grant, originalDate: e.target.value })} style={input} />
                </label>
                <label style={{ fontSize: '13px', width: '110px' }}>Length (min)
                  <input type="number" min="15" max="240" step="15" value={grant.durationMinutes} onChange={(e) => setGrant({ ...grant, durationMinutes: e.target.value })} style={input} />
                </label>
              </div>
              <button onClick={submitGrant} disabled={busy} style={{ ...btn(busy ? '#b2bec3' : '#00b894'), width: '100%', marginTop: '10px', padding: '10px' }}>{busy ? 'Working...' : '🎒 Add credit and notify'}</button>
            </div>
          </>
        )}

        {/* ➕ BOOK A CLASS */}
        {tab === 'book' && hasStudent && (
          <div style={box}>
            <label style={{ fontSize: '13px' }}>Teacher
              <select value={book.teacherId} onChange={(e) => setBook({ ...book, teacherId: e.target.value, newStart: '', manualTime: '' })} style={input}>
                <option value="">-- Choose the teacher --</option>
                {data.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.fresh ? '' : ' (hours not confirmed this week)'}</option>)}
              </select>
            </label>
            <div style={{ marginTop: '8px' }}>
              {radio('use-credit', true, `🎒 Makeup: use a credit (${data.credits.length} available)`, book.useCredit, () => setBook({ ...book, useCredit: true, newStart: '', manualTime: '' }))}
              {radio('use-credit', false, '➕ Extra class: no credit used', book.useCredit, () => setBook({ ...book, useCredit: false, newStart: '', manualTime: '' }))}
            </div>
            {book.useCredit && data.credits.length === 0 && <p style={{ color: '#d35400', fontSize: '13px' }}>No credits to use. Add one in 🎒 Credits, or choose "Extra class".</p>}
            {book.useCredit && data.credits.length > 1 && (
              <label style={{ fontSize: '13px' }}>Which credit?
                <select value={book.creditId} onChange={(e) => setBook({ ...book, creditId: e.target.value })} style={input}>
                  <option value="">The best match (same teacher, oldest first)</option>
                  {data.credits.map((c) => <option key={c.id} value={c.id}>{c.reason || 'Credit'} · {c.durationMinutes} min · until {day(c.expirationDate)}</option>)}
                </select>
              </label>
            )}
            {!book.useCredit && (
              <label style={{ fontSize: '13px', display: 'block', marginTop: '4px' }}>Length (min)
                <input type="number" min="15" max="240" step="15" value={book.durationMinutes} onChange={(e) => setBook({ ...book, durationMinutes: e.target.value })} style={{ ...input, width: '110px' }} />
              </label>
            )}
            {book.teacherId && (!book.useCredit || data.credits.length > 0) && (
              <SlotPicker slots={bookSlots} picked={book.newStart} manual={book.manualTime} onPick={(s) => setBook({ ...book, newStart: s, manualTime: '' })} onManual={(v) => setBook({ ...book, manualTime: v })} />
            )}
            <button onClick={submitBook} disabled={busy || !book.teacherId || (book.useCredit && data.credits.length === 0)} style={{ ...btn(busy || !book.teacherId || (book.useCredit && data.credits.length === 0) ? '#b2bec3' : '#0984e3'), width: '100%', marginTop: '12px', padding: '10px' }}>
              {busy ? 'Working...' : (book.newStart || book.manualTime) ? `✅ Book ${when(book.manualTime ? new Date(book.manualTime) : book.newStart)}` : 'Choose a time'}
            </button>
          </div>
        )}

        {/* 📜 last changes */}
        {hasStudent && data.history.length > 0 && (
          <details style={{ marginTop: '8px', fontSize: '13px' }}>
            <summary style={{ cursor: 'pointer', color: '#636e72' }}>📜 Last changes</summary>
            {data.history.map((h, i) => (
              <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid #eee' }}>
                {day(h.when)} · {h.action}{h.by === 'admin' ? ' (admin)' : ''}{h.oldStart ? ` · ${when(h.oldStart)}` : ''}{h.newStart ? ` → ${when(h.newStart)}` : ''}{h.teacherName ? ` · ${h.teacherName}` : ''}{h.reason ? ` · ${h.reason}` : ''}
              </div>
            ))}
          </details>
        )}
      </div>
    </div>
  );
}

export default AdminManageWindow;
