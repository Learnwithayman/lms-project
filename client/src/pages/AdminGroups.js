import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

// 👥 STEP 13 (24 Nov): GROUP COURSES (admin)
// Create a group (teacher, weekly day/time, course WhatsApp group, Classroom, Zoom), add / remove members
// (Gift, New student on their own PayPal seat subscription, Enrolled + added to the main invoice),
// move or skip one week, and see past classes with attendance and recording links.
// Every change updates Google Calendar; billing changes only REMIND the admin on WhatsApp.

const API_URL = process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Edmonton', 'America/Toronto', 'Europe/London', 'Europe/Istanbul', 'Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Australia/Sydney'];
const BILLING = {
  gift: '🎁 Gift (free)',
  new_paypal: '🆕 New student: own PayPal seat subscription',
  main_invoice: '🧾 Enrolled: added to the main invoice'
};
const EMPTY = { name: '', course: '', teacherId: '', weekday: 6, time: '14:00', timeZone: 'America/New_York', durationMinutes: 60, startDate: '', whatsappLink: '', classroomLink: '', zoomLink: '', seatPrice: 5, teacherSeatBonus: 2, active: true };

const box = { backgroundColor: 'white', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', color: '#2d3436' };
const input = { padding: '8px', border: '1px solid #ccc', borderRadius: '5px', fontSize: '14px', width: '100%', boxSizing: 'border-box' };
const label = { display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#636e72', marginBottom: '4px' };
const btn = (bg, color = 'white') => ({ padding: '8px 14px', backgroundColor: bg, color, border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' });
const fmt = (d) => new Date(d).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function AdminGroups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | { id?: string, form }
  const [openId, setOpenId] = useState(null);   // group whose members / classes are open
  const [busy, setBusy] = useState(false);

  const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  const errText = (e) => (e && e.response && e.response.data && e.response.data.message) || 'Something went wrong. Please try again.';

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [g, u] = await Promise.all([axios.get(`${API_URL}/api/groups`, auth()), axios.get(`${API_URL}/api/users`, auth())]);
      setGroups(g.data || []);
      const users = u.data || [];
      setTeachers(users.filter((x) => x.role === 'teacher').sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      setStudents(users.filter((x) => x.role === 'student').sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    } catch (e) {
      setError(errText(e));
    }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const replaceGroup = (g) => setGroups((list) => (list.some((x) => x.id === g.id) ? list.map((x) => (x.id === g.id ? g : x)) : [...list, g]));

  const saveGroup = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const f = editing.form;
      const body = { ...f, weekday: Number(f.weekday), durationMinutes: Number(f.durationMinutes), seatPrice: Number(f.seatPrice), teacherSeatBonus: Number(f.teacherSeatBonus) };
      const res = editing.id
        ? await axios.put(`${API_URL}/api/groups/${editing.id}`, body, auth())
        : await axios.post(`${API_URL}/api/groups`, body, auth());
      replaceGroup(res.data.group);
      setEditing(null);
      setOpenId(res.data.group.id);
      alert(`✅ ${res.data.message}`);
    } catch (e) {
      alert(`❌ ${errText(e)}`);
    }
    setBusy(false);
  };

  const startEdit = (g) => setEditing({ id: g ? g.id : null, form: g ? { name: g.name, course: g.course || '', teacherId: g.teacherId, weekday: g.weekday, time: g.time, timeZone: g.timeZone, durationMinutes: g.durationMinutes, startDate: g.startDate || '', whatsappLink: g.whatsappLink || '', classroomLink: g.classroomLink || '', zoomLink: g.zoomLink || '', seatPrice: g.seatPrice, teacherSeatBonus: g.teacherSeatBonus, active: g.active } : { ...EMPTY } });
  const setF = (k, v) => setEditing((e) => ({ ...e, form: { ...e.form, [k]: v } }));

  return (
    <div style={{ padding: '16px', maxWidth: '980px', margin: '0 auto', fontFamily: 'Segoe UI, Arial, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <h1 style={{ margin: 0, color: '#2d3436' }}>👥 Group Courses</h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => startEdit(null)} style={btn('#00b894')}>➕ New group</button>
          <button onClick={() => navigate('/admin')} style={btn('#636e72')}>⬅ Back to dashboard</button>
        </div>
      </div>
      <p style={{ marginTop: 0, color: '#636e72', fontSize: '14px' }}>Each group has one weekly class in Google Calendar and one course WhatsApp group. Group classes never count against a member's own subscription. Billing changes only send you a reminder; PayPal is never changed by the LMS.</p>

      {error && <div style={{ ...box, backgroundColor: '#ffeaea', color: '#c0392b' }}>⚠️ {error}</div>}
      {loading && <p>Loading...</p>}
      {!loading && groups.length === 0 && !error && <div style={box}>No groups yet. Press <b>➕ New group</b> to create the first one.</div>}

      {groups.map((g) => (
        <GroupCard
          key={g.id}
          group={g}
          open={openId === g.id}
          onToggle={() => setOpenId(openId === g.id ? null : g.id)}
          onEdit={() => startEdit(g)}
          students={students}
          auth={auth}
          errText={errText}
          onGroup={replaceGroup}
        />
      ))}

      {editing && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '20px', width: '620px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', color: 'black' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h2 style={{ margin: 0 }}>{editing.id ? '✏️ Edit group' : '➕ New group'}</h2>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <div><label style={label}>Group name</label><input style={input} value={editing.form.name} onChange={(e) => setF('name', e.target.value)} placeholder="e.g. Saturday Quran Circle" /></div>
              <div><label style={label}>Course</label><input style={input} value={editing.form.course} onChange={(e) => setF('course', e.target.value)} placeholder="e.g. Quran / Arabic" /></div>
              <div><label style={label}>Teacher</label>
                <select style={input} value={editing.form.teacherId} onChange={(e) => setF('teacherId', e.target.value)}>
                  <option value="">Choose a teacher...</option>
                  {teachers.map((t) => <option key={t._id} value={t._id}>{t.name}{t.teacherGroupId ? '' : ' (no group link!)'}</option>)}
                </select>
              </div>
              <div><label style={label}>Day</label>
                <select style={input} value={editing.form.weekday} onChange={(e) => setF('weekday', e.target.value)}>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div><label style={label}>Time</label><input type="time" style={input} value={editing.form.time} onChange={(e) => setF('time', e.target.value)} /></div>
              <div><label style={label}>Time zone of that time</label>
                <select style={input} value={editing.form.timeZone} onChange={(e) => setF('timeZone', e.target.value)}>
                  {(ZONES.includes(editing.form.timeZone) ? ZONES : [editing.form.timeZone, ...ZONES]).map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div><label style={label}>Length (minutes)</label><input type="number" min="15" max="240" style={input} value={editing.form.durationMinutes} onChange={(e) => setF('durationMinutes', e.target.value)} /></div>
              <div><label style={label}>First week (optional)</label><input type="date" style={input} value={editing.form.startDate} onChange={(e) => setF('startDate', e.target.value)} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={label}>Course WhatsApp group link (all members + teacher)</label><input style={input} value={editing.form.whatsappLink} onChange={(e) => setF('whatsappLink', e.target.value)} placeholder="https://chat.whatsapp.com/..." /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={label}>Google Classroom link</label><input style={input} value={editing.form.classroomLink} onChange={(e) => setF('classroomLink', e.target.value)} placeholder="https://classroom.google.com/c/..." /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={label}>Zoom link</label><input style={input} value={editing.form.zoomLink} onChange={(e) => setF('zoomLink', e.target.value)} placeholder="https://us05web.zoom.us/j/..." /></div>
              <div><label style={label}>Seat price ($ per hour)</label><input type="number" min="0" step="0.5" style={input} value={editing.form.seatPrice} onChange={(e) => setF('seatPrice', e.target.value)} /></div>
              <div><label style={label}>Teacher extra per paying seat ($ per hour)</label><input type="number" min="0" step="0.5" style={input} value={editing.form.teacherSeatBonus} onChange={(e) => setF('teacherSeatBonus', e.target.value)} /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '14px', cursor: 'pointer' }}><input type="checkbox" checked={!!editing.form.active} onChange={(e) => setF('active', e.target.checked)} /> Active (the weekly class is in Google Calendar)</label>
              </div>
            </div>
            {editing.id && <p style={{ fontSize: '12px', color: '#d35400' }}>Changing the day, time, length or teacher starts a new weekly series from now on and tells the course group and the teacher.</p>}
            <button onClick={saveGroup} disabled={busy} style={{ ...btn(busy ? '#95a5a6' : '#0984e3'), width: '100%', padding: '12px', marginTop: '10px' }}>{busy ? 'Saving...' : '💾 Save group'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupCard({ group: g, open, onToggle, onEdit, students, auth, errText, onGroup }) {
  const [classes, setClasses] = useState(null);
  const [add, setAdd] = useState({ studentId: '', billing: 'gift', paypalSubscriptionId: '', search: '' });
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState(null); // { eventId, mode, newStart, reason }
  const [recEdit, setRecEdit] = useState({}); // sessionId → link

  const active = g.members.filter((m) => !m.leftAt);
  const past = g.members.filter((m) => m.leftAt);
  const paying = active.filter((m) => m.billing !== 'gift').length;

  const loadClasses = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/groups/${g.id}/classes`, auth());
      setClasses(res.data);
    } catch (e) {
      setClasses({ upcoming: [], past: [], error: errText(e) });
    }
  };
  useEffect(() => { if (open) loadClasses(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const call = async (fn, after) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res.data.group) onGroup(res.data.group);
      alert(`✅ ${res.data.message}`);
      if (after) after();
    } catch (e) {
      alert(`❌ ${errText(e)}`);
    }
    setBusy(false);
  };

  const addMember = () => {
    if (!add.studentId) return alert('Please choose a student.');
    call(() => axios.post(`${API_URL}/api/groups/${g.id}/members`, { studentId: add.studentId, billing: add.billing, paypalSubscriptionId: add.paypalSubscriptionId }, auth()),
      () => setAdd({ studentId: '', billing: 'gift', paypalSubscriptionId: '', search: '' }));
  };
  const changeBilling = (m, billing) => {
    if (!window.confirm(`Change ${m.name} to "${BILLING[billing]}"? You will get a WhatsApp reminder for the PayPal change.`)) return;
    call(() => axios.put(`${API_URL}/api/groups/${g.id}/members/${m.id}`, { billing }, auth()));
  };
  const removeMember = (m) => {
    if (!window.confirm(`Remove ${m.name} from ${g.name}?`)) return;
    call(() => axios.delete(`${API_URL}/api/groups/${g.id}/members/${m.id}`, auth()));
  };
  const doAction = () => {
    if (!action) return;
    if (action.mode === 'move' && !action.newStart) return alert('Please choose the new time.');
    if (action.mode === 'skip' && !window.confirm('Skip this class? The course group and the teacher are told, and you get a reminder to take one class off for each paying member.')) return;
    call(() => axios.post(`${API_URL}/api/groups/${g.id}/cancel`, { eventId: action.eventId, mode: action.mode, newStart: action.mode === 'move' ? new Date(action.newStart).toISOString() : undefined, reason: action.reason }, auth()),
      () => { setAction(null); loadClasses(); });
  };
  const saveRecording = (sessionId) => call(() => axios.put(`${API_URL}/api/groups/sessions/${sessionId}/recording`, { recordingLink: recEdit[sessionId] || '' }, auth()), loadClasses);

  const memberIds = new Set(active.map((m) => m.studentId));
  const q = add.search.trim().toLowerCase();
  const choices = students.filter((s) => !memberIds.has(s._id) && (!q || (s.name || '').toLowerCase().includes(q)));

  return (
    <div style={{ ...box, borderLeft: `5px solid ${g.active ? '#00b894' : '#b2bec3'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 300px' }}>
          <h3 style={{ margin: '0 0 4px 0' }}>👥 {g.name} {!g.active && <span style={{ fontSize: '12px', color: '#636e72' }}>(not active)</span>}</h3>
          <div style={{ fontSize: '13px', color: '#636e72', lineHeight: 1.6 }}>
            {g.course && <>📚 {g.course} · </>}🧑‍🏫 {g.teacherName || '?'} · 📅 every {DAYS[g.weekday]} at {g.time} ({g.timeZone}), {g.durationMinutes} min<br />
            👤 {active.length} member{active.length === 1 ? '' : 's'} ({paying} paying, {active.length - paying} gift) · 💲 ${g.seatPrice}/hour per seat · 🧑‍🏫 +${g.teacherSeatBonus}/hour per paying seat<br />
            {g.whatsappLink ? <a href={g.whatsappLink} target="_blank" rel="noopener noreferrer">💬 Course WhatsApp group</a> : <span style={{ color: '#d63031' }}>⚠️ No course WhatsApp link (no reminders)</span>}
            {g.classroomLink && <> · <a href={g.classroomLink} target="_blank" rel="noopener noreferrer">📚 Classroom</a></>}
            {g.zoomLink && <> · <a href={g.zoomLink} target="_blank" rel="noopener noreferrer">🎥 Zoom</a></>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={onEdit} style={btn('#3498db')}>✏️ Edit</button>
          <button onClick={onToggle} style={btn('#6c5ce7')}>{open ? '▲ Close' : '▼ Members & classes'}</button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: '14px' }}>
          {/* MEMBERS */}
          <h4 style={{ margin: '10px 0 8px 0' }}>👤 Members</h4>
          {active.length === 0 && <p style={{ fontSize: '13px', color: '#636e72' }}>No members yet.</p>}
          {active.map((m) => (
            <div key={m.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '6px', marginBottom: '6px' }}>
              <b style={{ flex: '1 1 160px' }}>{m.name}</b>
              <select value={m.billing} disabled={busy} onChange={(e) => changeBilling(m, e.target.value)} style={{ ...input, width: 'auto', flex: '1 1 260px' }}>
                {Object.keys(BILLING).map((k) => <option key={k} value={k}>{BILLING[k]}</option>)}
              </select>
              <span style={{ fontSize: '12px', color: '#636e72' }}>since {new Date(m.joinedAt).toLocaleDateString()}</span>
              <button onClick={() => removeMember(m)} disabled={busy} style={btn('#d63031')}>Remove</button>
            </div>
          ))}
          {past.length > 0 && <p style={{ fontSize: '12px', color: '#636e72' }}>Left: {past.map((m) => `${m.name} (${new Date(m.leftAt).toLocaleDateString()})`).join(', ')}</p>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', padding: '10px', border: '1px dashed #b2bec3', borderRadius: '6px', marginTop: '8px' }}>
            <div><label style={label}>Find a student</label><input style={input} value={add.search} onChange={(e) => setAdd({ ...add, search: e.target.value })} placeholder="Type a name..." /></div>
            <div><label style={label}>Student</label>
              <select style={input} value={add.studentId} onChange={(e) => setAdd({ ...add, studentId: e.target.value })}>
                <option value="">Choose...</option>
                {choices.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div><label style={label}>Billing</label>
              <select style={input} value={add.billing} onChange={(e) => setAdd({ ...add, billing: e.target.value })}>
                {Object.keys(BILLING).map((k) => <option key={k} value={k}>{BILLING[k]}</option>)}
              </select>
            </div>
            {add.billing === 'new_paypal' && <div><label style={label}>PayPal subscription ID (optional)</label><input style={input} value={add.paypalSubscriptionId} onChange={(e) => setAdd({ ...add, paypalSubscriptionId: e.target.value })} placeholder="I-..." /></div>}
            <div style={{ display: 'flex', alignItems: 'flex-end' }}><button onClick={addMember} disabled={busy} style={{ ...btn('#00b894'), width: '100%' }}>➕ Add member</button></div>
          </div>
          <p style={{ fontSize: '12px', color: '#636e72', margin: '6px 0 0 0' }}>Adding someone sends a welcome to the course group (it says classes are recorded). Paying members send you a WhatsApp reminder to add or remove the amount in PayPal.</p>

          {/* CLASSES */}
          <h4 style={{ margin: '18px 0 8px 0' }}>📅 Next classes</h4>
          {!classes && <p style={{ fontSize: '13px' }}>Loading...</p>}
          {classes && classes.error && <p style={{ color: '#d63031', fontSize: '13px' }}>⚠️ {classes.error}</p>}
          {classes && !classes.error && classes.upcoming.length === 0 && <p style={{ fontSize: '13px', color: '#636e72' }}>No upcoming classes{g.active ? '' : ' (group not active)'}.</p>}
          {classes && classes.upcoming.map((c) => (
            <div key={c.eventId} style={{ padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '6px', marginBottom: '6px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 220px' }}>🕒 {fmt(c.start)} <span style={{ fontSize: '12px', color: '#636e72' }}>(your time)</span>{c.moved && <b style={{ color: '#e17055' }}> · moved</b>}</span>
                <button onClick={() => setAction({ eventId: c.eventId, mode: 'move', newStart: '', reason: '' })} style={btn('#fdcb6e', '#2d3436')}>🔁 Move</button>
                <button onClick={() => setAction({ eventId: c.eventId, mode: 'skip', reason: '' })} style={btn('#636e72')}>🚫 Skip</button>
              </div>
              {action && action.eventId === c.eventId && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginTop: '8px' }}>
                  {action.mode === 'move' && <div><label style={label}>New time (your computer's time)</label><input type="datetime-local" style={input} value={action.newStart} onChange={(e) => setAction({ ...action, newStart: e.target.value })} /></div>}
                  <div><label style={label}>Reason (optional)</label><input style={input} value={action.reason} onChange={(e) => setAction({ ...action, reason: e.target.value })} /></div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                    <button onClick={doAction} disabled={busy} style={btn(action.mode === 'move' ? '#0984e3' : '#d63031')}>{action.mode === 'move' ? 'Move whole group' : 'Skip this week'}</button>
                    <button onClick={() => setAction(null)} style={btn('#b2bec3', '#2d3436')}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <h4 style={{ margin: '18px 0 8px 0' }}>📜 Past classes</h4>
          {classes && !classes.error && classes.past.length === 0 && <p style={{ fontSize: '13px', color: '#636e72' }}>No finished group classes yet.</p>}
          {classes && classes.past.map((s) => (
            <div key={s.id} style={{ padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '6px', marginBottom: '6px', fontSize: '13px' }}>
              <b>{fmt(s.when)}</b> · {s.minutes} min{s.seatBonus > 0 ? ` · teacher +$${s.seatBonus}` : ''}<br />
              {s.attendance.length > 0 && <span>{s.attendance.map((a) => `${a.status === 'absent' ? '❌' : '✅'} ${a.name}`).join('  ')}<br /></span>}
              {s.notes && <span style={{ color: '#636e72' }}>📝 {s.notes}<br /></span>}
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                <input style={{ ...input, flex: '1 1 260px' }} placeholder="🎥 Recording link (Google Classroom)" value={recEdit[s.id] !== undefined ? recEdit[s.id] : s.recordingLink} onChange={(e) => setRecEdit({ ...recEdit, [s.id]: e.target.value })} />
                <button onClick={() => saveRecording(s.id)} disabled={busy} style={btn('#0984e3')}>Save</button>
                {s.recordingLink && <a href={s.recordingLink} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'center' }}>Open</a>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminGroups;
