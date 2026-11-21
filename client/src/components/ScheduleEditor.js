import React, { useState } from 'react';

// ==========================================
// 🗓️ STEP 19: EASIER "MY SCHEDULE" EDITOR (teachers)
// ==========================================
// One card per day: each time window has ✏️ Edit and ✕ Remove, "+ Add hours" under the day,
// "Copy to…" copies a day's hours to other days, and overnight hours are ONE row
// (e.g. Monday 21:00 → 05:00 next day). The saved data keeps the old shape
// ({ weekly: [{ day, start, end }], blocked, extra }, Cairo time): an overnight row is saved as
// Monday 21:00–24:00 + Tuesday 00:00–05:00, so free times and makeup booking keep working.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDER = [6, 0, 1, 2, 3, 4, 5]; // Saturday first

const toMin = (hm) => (hm === '24:00' ? 1440 : Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)));
const showHm = (hm) => (hm === '24:00' || hm === '00:00' ? '00:00' : hm);
let nextId = 1;
const newId = () => `r${nextId++}`;

// Saved list → rows (an overnight pair becomes one row)
export const toRows = (weekly = []) => {
  const list = weekly.map((w) => ({ day: Number(w.day), start: w.start, end: w.end, used: false }));
  const rows = [];
  list.forEach((a) => {
    if (a.used || (a.end !== '24:00' && a.end !== '23:59')) return;
    const b = list.find((x) => !x.used && x !== a && x.day === (a.day + 1) % 7 && x.start === '00:00' && x.end !== '24:00');
    if (!b) return;
    a.used = true; b.used = true;
    rows.push({ id: newId(), day: a.day, start: a.start, end: b.end, overnight: true });
  });
  list.filter((x) => !x.used).forEach((x) => rows.push({ id: newId(), day: x.day, start: x.start, end: x.end, overnight: false }));
  return rows;
};

// Rows → saved list
export const toWeekly = (rows) => rows.flatMap((r) => (r.overnight
  ? [{ day: r.day, start: r.start, end: '24:00' }, ...(r.end !== '00:00' ? [{ day: (r.day + 1) % 7, start: '00:00', end: r.end }] : [])]
  : [{ day: r.day, start: r.start, end: r.end }]));

// Start + end typed by the teacher → a row (end before start = ends the next day; end 00:00 = until midnight)
export const makeRow = (day, start, end) => {
  if (!start || !end) return { error: 'Please choose a start and an end time.' };
  if (start === end) return { error: 'The start and end times are the same.' };
  if (end === '00:00') return { row: { day, start, end: '24:00', overnight: false } };
  if (end < start) return { row: { day, start, end, overnight: true } };
  return { row: { day, start, end, overnight: false } };
};

// Minutes of a row inside its own day line (overnight rows go past 1440)
const span = (r) => [toMin(r.start), r.overnight ? 1440 + toMin(r.end) : toMin(r.end)];
export const findOverlap = (rows, row, ignoreId) => {
  const [s, e] = span(row);
  return rows.find((o) => {
    if (o.id === ignoreId) return false;
    const [os, oe] = span(o);
    const shift = ((o.day - row.day + 7) % 7) * 1440; // the other row placed on this row's day line
    if (shift !== 0 && shift !== 1440 && shift !== 6 * 1440) return false;
    const off = shift === 6 * 1440 ? -1440 : shift;
    return s < oe + off && os + off < e;
  });
};

const label = (r) => (r.overnight ? `${r.start} → ${showHm(r.end)} (next day)` : `${r.start} – ${showHm(r.end)}${r.end === '24:00' ? ' (midnight)' : ''}`);
const hoursOf = (r) => { const [s, e] = span(r); return (e - s) / 60; };
const niceDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

const btn = (bg, color = 'white') => ({ padding: '5px 10px', backgroundColor: bg, color, border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', whiteSpace: 'nowrap' });
const input = { padding: '6px', borderRadius: '6px', border: '1px solid #dfe6e9', fontSize: '14px' };

function ScheduleEditor({ value, onChange }) {
  const [rows, setRows] = useState(() => toRows(value.weekly));
  const [editing, setEditing] = useState(null);   // { id | 'new', day, start, end }
  const [copyFrom, setCopyFrom] = useState(null); // day number
  const [copyTo, setCopyTo] = useState({});
  const [newBlocked, setNewBlocked] = useState('');
  const [newExtra, setNewExtra] = useState({ date: '', start: '16:00', end: '21:00' });

  const commitRows = (next) => { setRows(next); onChange({ ...value, weekly: toWeekly(next) }); };

  const saveEdit = () => {
    const { row, error } = makeRow(editing.day, editing.start, editing.end);
    if (error) return alert(error);
    const clash = findOverlap(rows, row, editing.id);
    if (clash) return alert(`This overlaps ${DAYS[clash.day]} ${label(clash)}. Please change one of them.`);
    commitRows(editing.id === 'new' ? [...rows, { ...row, id: newId() }] : rows.map((r) => (r.id === editing.id ? { ...row, id: r.id } : r)));
    setEditing(null);
  };

  const doCopy = () => {
    const targets = Object.keys(copyTo).filter((d) => copyTo[d]).map(Number);
    if (!targets.length) return alert('Choose at least one day.');
    const source = rows.filter((r) => r.day === copyFrom);
    const replaced = targets.filter((d) => rows.some((r) => r.day === d));
    if (replaced.length && !window.confirm(`This replaces the hours on ${replaced.map((d) => DAYS[d]).join(', ')}. Continue?`)) return;
    const kept = rows.filter((r) => !targets.includes(r.day));
    const copies = targets.flatMap((d) => source.map((r) => ({ ...r, id: newId(), day: d })));
    const next = [...kept, ...copies];
    const clash = copies.find((c) => findOverlap(next, c, c.id));
    if (clash) return alert(`After copying, ${DAYS[clash.day]} ${label(clash)} would overlap other hours. Please check overnight hours first.`);
    commitRows(next);
    setCopyFrom(null);
    setCopyTo({});
  };

  const total = rows.reduce((sum, r) => sum + hoursOf(r), 0);

  const editor = (
    editing && (
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', padding: '8px', backgroundColor: '#eef6fd', borderRadius: '6px', marginTop: '6px' }}>
        <input type="time" value={editing.start} onChange={(e) => setEditing({ ...editing, start: e.target.value })} style={input} />
        <span>to</span>
        <input type="time" value={editing.end} onChange={(e) => setEditing({ ...editing, end: e.target.value })} style={input} />
        {editing.start && editing.end && editing.end < editing.start && editing.end !== '00:00' && <span style={{ fontSize: '12px', color: '#0984e3' }}>ends the next day</span>}
        <button type="button" onClick={saveEdit} style={btn('#00b894')}>✓ Save</button>
        <button type="button" onClick={() => setEditing(null)} style={btn('#dfe6e9', '#2d3436')}>Cancel</button>
      </div>
    )
  );

  return (
    <div>
      <h3 style={{ fontSize: '16px', margin: '0 0 4px 0' }}>Weekly hours</h3>
      <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#636e72' }}>
        Use ✏️ to change a time, ✕ to remove it, <b>+ Add hours</b> for a new window, and <b>Copy to…</b> to repeat a day. For night hours, just pick an end time earlier than the start (e.g. 21:00 to 05:00). Total: <b>{Math.round(total * 10) / 10} hours a week</b>.
      </p>

      {ORDER.map((d) => {
        const dayRows = rows.filter((r) => r.day === d).sort((a, b) => a.start.localeCompare(b.start));
        return (
          <div key={d} style={{ border: '1px solid #e9eef2', borderRadius: '8px', padding: '10px', marginBottom: '8px', backgroundColor: dayRows.length ? 'white' : '#fafbfc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '14px' }}>{DAYS[d]}</strong>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => { setCopyFrom(null); setEditing({ id: 'new', day: d, start: '16:00', end: '21:00' }); }} style={btn('#0984e3')}>+ Add hours</button>
                {dayRows.length > 0 && <button type="button" onClick={() => { setEditing(null); setCopyTo({}); setCopyFrom(copyFrom === d ? null : d); }} style={btn('#6c5ce7')}>⧉ Copy to…</button>}
              </div>
            </div>

            {dayRows.length === 0 && !(editing && editing.id === 'new' && editing.day === d) && (
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#b2bec3' }}>No hours (not working this day).</p>
            )}

            {dayRows.map((r) => (
              <div key={r.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', backgroundColor: '#f8f9fa', borderRadius: '6px', marginTop: '6px', fontSize: '14px' }}>
                  <span>🕒 {label(r)}</span>
                  <span style={{ display: 'flex', gap: '4px' }}>
                    <button type="button" title="Edit" onClick={() => { setCopyFrom(null); setEditing({ id: r.id, day: r.day, start: r.start, end: r.end === '24:00' ? '00:00' : r.end }); }} style={btn('#ffeaa7', '#2d3436')}>✏️ Edit</button>
                    <button type="button" title="Remove" onClick={() => { if (window.confirm(`Remove ${DAYS[r.day]} ${label(r)}?`)) commitRows(rows.filter((x) => x.id !== r.id)); }} style={btn('#fdecea', '#d63031')}>✕</button>
                  </span>
                </div>
                {editing && editing.id === r.id && editor}
              </div>
            ))}

            {editing && editing.id === 'new' && editing.day === d && editor}

            {copyFrom === d && (
              <div style={{ padding: '8px', backgroundColor: '#f1effd', borderRadius: '6px', marginTop: '6px', fontSize: '13px' }}>
                <div style={{ marginBottom: '6px' }}>Copy {DAYS[d]}'s hours to:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  {ORDER.filter((x) => x !== d).map((x) => (
                    <label key={x} style={{ cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!copyTo[x]} onChange={() => setCopyTo({ ...copyTo, [x]: !copyTo[x] })} /> {DAYS[x].slice(0, 3)}
                    </label>
                  ))}
                </div>
                <button type="button" onClick={doCopy} style={btn('#6c5ce7')}>Copy</button>{' '}
                <button type="button" onClick={() => setCopyFrom(null)} style={btn('#dfe6e9', '#2d3436')}>Cancel</button>
              </div>
            )}
          </div>
        );
      })}

      <h3 style={{ fontSize: '16px', margin: '18px 0 8px 0' }}>Days off</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
        {value.blocked.length === 0 && <span style={{ fontSize: '12px', color: '#b2bec3' }}>No days off.</span>}
        {value.blocked.map((d) => (
          <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', backgroundColor: '#fdecea', borderRadius: '14px', fontSize: '13px' }}>
            🚫 {niceDate(d)}
            <button type="button" onClick={() => onChange({ ...value, weekly: toWeekly(rows), blocked: value.blocked.filter((x) => x !== d) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d63031', padding: 0 }}>✕</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
        <input type="date" value={newBlocked} onChange={(e) => setNewBlocked(e.target.value)} style={input} />
        <button type="button" onClick={() => { if (!newBlocked) return; onChange({ ...value, weekly: toWeekly(rows), blocked: [...new Set([...value.blocked, newBlocked])].sort() }); setNewBlocked(''); }} style={btn('#d63031')}>+ Add day off</button>
      </div>

      <h3 style={{ fontSize: '16px', margin: '0 0 8px 0' }}>Extra hours on a date</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
        {value.extra.length === 0 && <span style={{ fontSize: '12px', color: '#b2bec3' }}>No extra hours.</span>}
        {value.extra.map((x, i) => (
          <span key={`${x.date}${x.start}${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', backgroundColor: '#eafaf1', borderRadius: '14px', fontSize: '13px' }}>
            ➕ {niceDate(x.date)} {x.start} – {showHm(x.end)}
            <button type="button" onClick={() => onChange({ ...value, weekly: toWeekly(rows), extra: value.extra.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d63031', padding: 0 }}>✕</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <input type="date" value={newExtra.date} onChange={(e) => setNewExtra({ ...newExtra, date: e.target.value })} style={input} />
        <input type="time" value={newExtra.start} onChange={(e) => setNewExtra({ ...newExtra, start: e.target.value })} style={input} />
        <input type="time" value={newExtra.end} onChange={(e) => setNewExtra({ ...newExtra, end: e.target.value })} style={input} />
        <button type="button" onClick={() => {
          if (!newExtra.date || !newExtra.start || !newExtra.end) return alert('Choose a date, a start and an end time.');
          const end = newExtra.end === '00:00' ? '24:00' : newExtra.end;
          if (newExtra.start >= end) return alert('The end time must be after the start time (for night hours on a date, add two entries: until 00:00, then the next date).');
          onChange({ ...value, weekly: toWeekly(rows), extra: [...value.extra, { date: newExtra.date, start: newExtra.start, end }] });
          setNewExtra({ ...newExtra, date: '' });
        }} style={btn('#00b894')}>+ Add</button>
      </div>
    </div>
  );
}

export default ScheduleEditor;
