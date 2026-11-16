import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css'; 

const API_URL = process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com';

function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState({});
  const [liveClasses, setLiveClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Message Log States
  const [messageLogs, setMessageLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Pending Makeups States
  const [pendingMakeups, setPendingMakeups] = useState([]);
  const [loadingMakeups, setLoadingMakeups] = useState(true);

  // Pending Reports States (Approval Gate)
  const [pendingReports, setPendingReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  
  // Rejection Modal State
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Edit & Approve Modal State
  const [isEditApproveModalOpen, setIsEditApproveModalOpen] = useState(false);
  const [editedNote, setEditedNote] = useState('');

  // Legacy PDF Vault States
  const [studentsList, setStudentsList] = useState([]);
  const [legacyForm, setLegacyForm] = useState({ studentId: '', monthYear: '', pdfLink: '' });
  const [isSubmittingLegacy, setIsSubmittingLegacy] = useState(false);

  // State to handle the View Notes Modal
  const [viewNotesModal, setViewNotesModal] = useState({ isOpen: false, text: '', student: '' });

  // Honor List Generator States
  const [selectedHonorMonth, setSelectedHonorMonth] = useState('');
  const [honorList, setHonorList] = useState([]);
  const [loadingHonorList, setLoadingHonorList] = useState(false);

  // ✨ NEW: School-Wide Tracker States
  const [trackMonth, setTrackMonth] = useState('');
  const [trackData, setTrackData] = useState({ summary: null, trackingData: [] });
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [trackTeacher, setTrackTeacher] = useState(''); // 📋 Step 5: filter the tracker by teacher

  // 📋 Step 5: Preview plan / report reminders (sends nothing)
  const [previewDate, setPreviewDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }));
  const [previewData, setPreviewData] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // 🔁 Step 7: Postpone / Cancel boxes in the live monitor
  const [classAction, setClassAction] = useState(null); // { type: 'cancel' | 'postpone', cls, info, ... }
  const [actionSlots, setActionSlots] = useState(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // 🔄 Step 8: Switch to new IDs (preview → choices → apply) + old-ID warning
  const [idPlan, setIdPlan] = useState(null);
  const [idChoices, setIdChoices] = useState({});
  const [idPeople, setIdPeople] = useState({});
  const [loadingIds, setLoadingIds] = useState(false);
  const [idCheck, setIdCheck] = useState(null);

  // ✨ NEW: WhatsApp Bot Test State
  const [isTestingBot, setIsTestingBot] = useState(false);

  // Helper to generate recent months for the dropdown
  const getRecentMonths = () => {
    const months = [];
    const date = new Date();
    date.setMonth(date.getMonth() + 1); 
    for (let i = 0; i < 12; i++) {
      months.push(date.toLocaleString('default', { month: 'long', year: 'numeric' }));
      date.setMonth(date.getMonth() - 1);
    }
    return months;
  };
  const recentMonths = getRecentMonths();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token || !userData) {
      navigate('/');
      return;
    }

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    
    // Set defaults
    const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
    setSelectedHonorMonth(currentMonth);
    setTrackMonth(currentMonth);

    if (parsedUser.role !== 'admin') {
      alert('Access Denied');
      navigate('/dashboard');
    } else {
      fetchLiveClasses(token);
      fetchMessageLogs(token);
      fetchPendingMakeups(token); 
      fetchPendingReports(token);
      fetchStudents(token);
      fetchIdCheck(token);
    }
  }, [navigate]);

  const fetchStudents = async (token) => {
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setStudentsList(data.filter(u => u.role === 'student'));
      }
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  // ✨ NEW: Fetch Tracking Data
  const fetchTrackingData = async () => {
    if (!trackMonth) return;
    setLoadingTrack(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/admin/report-tracking/${trackMonth}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTrackData(res.data);
    } catch (error) {
      console.error('Error fetching tracker:', error);
      alert('Failed to load tracking data.');
    } finally {
      setLoadingTrack(false);
    }
  };

  // 📋 Step 5: Preview who would get a plan / report reminder on a day (nothing is sent)
  const fetchReminderPreview = async () => {
    setLoadingPreview(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/admin/reminder-preview?date=${previewDate}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPreviewData(res.data);
    } catch (error) {
      console.error('Error loading reminder preview:', error);
      alert('Failed to load the reminder preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  // 🔄 Step 8: is anything still using old IDs? (warning at the top)
  const fetchIdCheck = async (token) => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/group-ids/check`, { headers: { Authorization: `Bearer ${token}` } });
      setIdCheck(res.data);
    } catch (error) {
      console.error('Group ID check failed:', error);
    }
  };

  // 🔄 Step 8: preview (nothing is changed)
  const fetchIdPlan = async () => {
    setLoadingIds(true);
    try {
      const res = await axios.get(`${API_URL}/api/admin/group-ids/preview`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setIdPlan(res.data);
      setIdChoices({});
      setIdPeople({});
    } catch (error) {
      alert(`❌ ${error.response?.data?.message || 'Could not build the preview.'}`);
    } finally {
      setLoadingIds(false);
    }
  };

  // 🔄 Step 8: apply (backup → Google Calendar → LMS)
  const applyIdPlan = async () => {
    if (!idPlan) return;
    const unclearLeft = idPlan.classes.filter(c => c.status === 'unclear' && Object.entries(c.sides).some(([role, side]) => side.unclear && !idChoices[c.id]?.[role])).length;
    const msg = `Switch to new IDs now?\n\n• ${idPlan.counts.ready} classes are ready${unclearLeft ? `\n• ${unclearLeft} unclear classes have no choice and will be SKIPPED` : ''}\n• ${idPlan.lmsUpdates.length} saved groups in the LMS become links\n• ${idPlan.people.length} people without classes: pasted links are saved, empty ones are cleared\n\nA backup of every class description is kept.`;
    if (!window.confirm(msg)) return;
    setLoadingIds(true);
    try {
      const res = await axios.post(`${API_URL}/api/admin/group-ids/apply`, { choices: idChoices, people: idPeople }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      const r = res.data;
      alert(`✅ Done!\n\nClasses changed: ${r.classesChanged}\nClasses skipped: ${r.classesSkipped.length}${r.classErrors.length ? `\nErrors: ${r.classErrors.length}` : ''}\nLMS groups updated: ${r.lmsChanged}\nPeople saved / cleared: ${r.peopleSaved} / ${r.peopleCleared}`);
      fetchIdCheck(localStorage.getItem('token'));
      fetchIdPlan();
    } catch (error) {
      alert(`❌ ${error.response?.data?.message || 'Could not apply the switch.'}`);
    } finally {
      setLoadingIds(false);
    }
  };

  const handleLegacySubmit = async (e) => {
    e.preventDefault();
    setIsSubmittingLegacy(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/admin/legacy-report`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(legacyForm)
      });
      
      if (response.ok) {
        alert('✅ Legacy PDF linked successfully! The parent can now view it in their Progress Hub.');
        setLegacyForm({ studentId: '', monthYear: '', pdfLink: '' });
      } else {
        alert('❌ Failed to link legacy PDF. Ensure the backend route is active.');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmittingLegacy(false);
    }
  };

  const fetchPendingReports = async (token) => {
    try {
      const response = await fetch(`${API_URL}/api/admin/pending-reports`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPendingReports(data);
      }
    } catch (error) {
      console.error("Error fetching pending reports:", error);
    } finally {
      setLoadingReports(false);
    }
  };

  const handleApproveReport = async (studentId, monthYear, customNote = null, opts = {}) => {
    const confirmText = opts.mode === 'wait'
      ? `Approve now, and send the student message after ${(opts.waitingFor || []).join(', ')} saves their part and you approve it?`
      : 'Approve this report exactly as the teacher wrote it?';
    if (!customNote && !window.confirm(confirmText)) return;
    
    setIsSubmittingReport(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/admin/approve-report`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ studentId, monthYear, editedNote: customNote, mode: opts.mode, waitingFor: opts.waitingFor }) 
      });
      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        alert(result.waiting || result.alreadySent ? `✅ ${result.message}` : '✅ Report Approved! It is now live on the Student Portal.');
        setIsEditApproveModalOpen(false);
        fetchPendingReports(token);
        // Refresh tracker if open
        if (trackData.summary) fetchTrackingData();
      } else {
        alert('❌ Failed to approve report.');
      }
    } catch (error) {
      console.error('Error approving report:', error);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    setIsSubmittingReport(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/admin/reject-report`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          studentId: selectedReport.studentId,
          monthYear: selectedReport.monthYear,
          adminNotes: adminNotes
        })
      });
      if (response.ok) {
        alert('🛑 Report Rejected. Sent back to the teacher with your notes.');
        setIsRejectModalOpen(false);
        setAdminNotes('');
        fetchPendingReports(token);
        if (trackData.summary) fetchTrackingData();
      } else {
        alert('❌ Failed to reject report.');
      }
    } catch (error) {
      console.error('Error rejecting report:', error);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const fetchPendingMakeups = async (token) => {
    try {
      const response = await fetch(`${API_URL}/api/schedule/admin/makeups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPendingMakeups(data);
      }
    } catch (error) {
      console.error('Error fetching makeups:', error);
    } finally {
      setLoadingMakeups(false);
    }
  };

  const handleResolveMakeup = async (id) => {
    if (!window.confirm('Are you sure you want to mark this request as scheduled? This will clear it from your inbox.')) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/schedule/admin/makeups/${id}/resolve`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        alert('✅ Request marked as scheduled!');
        fetchPendingMakeups(token); 
      } else {
        alert('❌ Failed to resolve request.');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const fetchLiveClasses = async (token) => {
    try {
      const response = await fetch(`${API_URL}/api/schedule/admin-live-monitor`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setLiveClasses(data);
      }
    } catch (error) {
      console.error('Error fetching live classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessageLogs = async (token) => {
    try {
      const response = await fetch(`${API_URL}/api/schedule/message-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setMessageLogs(data);
      }
    } catch (error) {
      console.error('Error fetching message logs:', error);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchHonorList = async () => {
    if (!selectedHonorMonth) return alert('Please select a month and year');
    setLoadingHonorList(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/admin/honor-list/${selectedHonorMonth}`, config);
      
      setHonorList(res.data.students || []);
      if (res.data.students.length === 0) {
        alert(`ℹ️ No 10/10 students found for ${selectedHonorMonth}.`);
      }
    } catch (error) {
      console.error('Failed to fetch honor list:', error);
      alert('❌ Failed to fetch Honor List');
    } finally {
      setLoadingHonorList(false);
    }
  };

  const copyHonorNames = () => {
    const namesText = honorList.map(s => s.studentName).join('\n');
    navigator.clipboard.writeText(namesText);
    alert('📋 Honor List names copied to clipboard!');
  };

  const handleResendReminder = async (classData) => {
    if (!window.confirm(`Resend reminder for ${classData.title}?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/schedule/resend-reminder`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ classData })
      });
      
      if (response.ok) {
        alert('✅ Reminder resent successfully!');
        fetchMessageLogs(token); 
      } else alert('❌ Failed to resend reminder.');
    } catch (error) {
      console.error(error);
    }
  };

  // ==========================================
  // 🔁 STEP 7: POSTPONE + CANCEL (live monitor)
  // ==========================================
  const adminConfig = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const openClassAction = async (type, cls) => {
    const minutesUntil = (new Date(cls.startTime).getTime() - Date.now()) / 60000;
    setActionSlots(null);
    setClassAction({ type, cls, info: null, cancelledBy: '', giveCredit: null, payTeacher: minutesUntil < 30, reason: '', mode: 'student', newStart: '', manualTime: '', newTeacherId: '' });
    try {
      const res = await axios.get(`${API_URL}/api/schedule/admin/class-info/${encodeURIComponent(cls.id)}`, adminConfig());
      setClassAction(prev => prev && ({ ...prev, info: res.data }));
    } catch (error) {
      setClassAction(prev => prev && ({ ...prev, info: { error: error.response?.data?.message || 'Could not load this class.' } }));
    }
  };

  const loadActionSlots = async (teacherId) => {
    setActionSlots(null);
    if (!teacherId || !classAction?.info) return;
    try {
      const res = await axios.get(`${API_URL}/api/schedule/admin/free-slots?teacherId=${teacherId}&durationMinutes=${classAction.info.durationMinutes || 60}&eventId=${encodeURIComponent(classAction.cls.id)}`, adminConfig());
      setActionSlots(res.data);
    } catch (error) {
      setActionSlots({ error: error.response?.data?.message || 'Could not load free times.' });
    }
  };

  const submitClassAction = async () => {
    const a = classAction;
    if (!a) return;
    const token = localStorage.getItem('token');
    setIsSubmittingAction(true);
    try {
      let res;
      if (a.type === 'cancel') {
        if (!a.cancelledBy) return alert('Please choose who cancelled.');
        if (a.giveCredit === null) return alert('Please choose whether to give a makeup credit.');
        res = await axios.post(`${API_URL}/api/schedule/admin-cancel`, { eventId: a.cls.id, cancelledBy: a.cancelledBy, giveCredit: a.giveCredit, payTeacher: a.payTeacher, reason: a.reason }, adminConfig());
      } else {
        const newStart = a.manualTime ? new Date(a.manualTime).toISOString() : a.newStart;
        if (a.mode === 'time' && !newStart) return alert('Please choose the new time.');
        if (a.mode === 'teacher' && !a.newTeacherId) return alert('Please choose the new teacher.');
        res = await axios.post(`${API_URL}/api/schedule/admin-postpone`, { eventId: a.cls.id, mode: a.mode, newStart: newStart || undefined, newTeacherId: a.newTeacherId || undefined, reason: a.reason }, adminConfig());
      }
      alert(`✅ ${res.data.message}`);
      setClassAction(null);
      fetchLiveClasses(token);
      fetchMessageLogs(token);
    } catch (error) {
      alert(`❌ ${error.response?.data?.message || 'Something went wrong.'}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleResendNotes = async (classData) => {
    if (!window.confirm(`Resend completed notes for ${classData.title || classData.subject}?`)) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/schedule/resend-notes`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ classId: classData._id || classData.id })
      });
      
      if (response.ok) {
        alert('✅ Notes resent successfully!');
        fetchMessageLogs(token); 
      } else alert('❌ Failed to resend notes.');
    } catch (error) {
      console.error(error);
    }
  };

  const handleForceEnd = async (classId, title) => {
    if (!window.confirm(`Are you sure you want to FORCE END "${title}"? This will mark it as completed and stop all 50-minute reminders.`)) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/schedule/admin-force-end`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ classId })
      });
      
      if (response.ok) {
        alert('🛑 Class forcefully ended!');
        fetchLiveClasses(token); 
      } else {
        alert('❌ Failed to force end class.');
      }
    } catch (error) {
      console.error(error);
      alert('❌ Server error while force ending class.');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('📋 Text copied to clipboard!');
  };

  // ✨ NEW: Send a test message to the Admin Alerts group
  const handleTestBot = async () => {
    if (!window.confirm('Send a test message to the Admin Alerts WhatsApp group?')) return;
    setIsTestingBot(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/users/test-group`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        }
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        alert('✅ Test sent! Check the Admin Alerts group on WhatsApp.');
      } else {
        alert(`❌ ${data.message || 'Test failed. Check MacroDroid and the Message Logs.'}`);
      }
      fetchMessageLogs(token);
    } catch (error) {
      console.error(error);
      alert('❌ Server error while sending the test message.');
    } finally {
      setIsTestingBot(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div className="dashboard-container">
      <style>
        {`
          @keyframes pulseRed {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.05); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes pulseGreen {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.8; }
            100% { transform: scale(1); opacity: 1; }
          }
          .live-badge {
            color: #e74c3c;
            font-weight: bold;
            animation: pulseRed 1.5s infinite;
          }
          .joined-pulse {
            display: inline-block;
            animation: pulseGreen 1.5s infinite;
          }
        `}
      </style>

      {/* 🔄 STEP 8: OLD-ID WARNING */}
      {idCheck && (idCheck.classes > 0 || idCheck.people > 0) && (
        <div style={{ backgroundColor: '#fff3cd', border: '2px solid #f39c12', color: '#856404', padding: '12px 18px', borderRadius: '10px', marginBottom: '15px', fontWeight: 'bold' }}>
          ⚠️ {idCheck.classes} upcoming class{idCheck.classes === 1 ? '' : 'es'} and {idCheck.people} saved group{idCheck.people === 1 ? '' : 's'} still use old IDs. Open "🔄 Switch to new IDs" below to fix them.
          {idCheck.classTitles?.length > 0 && <div style={{ fontWeight: 'normal', fontSize: '12px', marginTop: '4px' }}>{idCheck.classTitles.join(' · ')}</div>}
        </div>
      )}

      <div className="dashboard-header">
        <h1>🛡️ Admin Control Panel</h1>
        <button onClick={handleLogout} className="logout-btn">Logout</button>
      </div>

      <h2>👋 Welcome, {user.name}</h2>
      <p>Manage users, schedule classes, and organize the school.</p>
      
      <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/users')} className="action-btn btn-grey" style={{width: 'auto', padding: '10px 20px'}}>
          👥 Manage Users
        </button>
        <button onClick={() => navigate('/all-classes')} className="action-btn btn-grey" style={{width: 'auto', padding: '10px 20px'}}>
          🗓️️ Manage Classes
        </button>
        <button onClick={() => navigate('/admin-payroll')} className="action-btn btn-grey" style={{width: 'auto', padding: '10px 20px', backgroundColor: '#ffc107', color: '#333', fontWeight: 'bold', border: 'none'}}>
          💰 Manage Payroll
        </button>
        {/* ✨ NEW: WhatsApp Bot Test */}
        <button onClick={handleTestBot} disabled={isTestingBot} className="action-btn btn-grey" style={{width: 'auto', padding: '10px 20px', backgroundColor: isTestingBot ? '#95a5a6' : '#25D366', color: 'white', fontWeight: 'bold', border: 'none', cursor: isTestingBot ? 'not-allowed' : 'pointer'}}>
          {isTestingBot ? '⏳ Sending Test...' : '📲 Test WhatsApp Bot'}
        </button>
      </div>

      {/* ========================================== */}
      {/* 📂 LEGACY PDF VAULT UPLOAD */}
      {/* ========================================== */}
      <div style={{ marginTop: '40px', backgroundColor: '#f8f9fa', padding: '25px', borderRadius: '12px', border: '1px solid #dfe6e9', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
        <h2 style={{ margin: '0 0 10px 0', color: '#2d3436', display: 'flex', alignItems: 'center', gap: '10px' }}>
          📂 Legacy PDF Vault Linker
        </h2>
        <p style={{ color: '#636e72', margin: '0 0 20px 0', fontSize: '14px' }}>Paste a Google Drive link from an old report to permanently attach it to a student's profile.</p>
        
        <form onSubmit={handleLegacySubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ fontWeight: 'bold', fontSize: '14px', color: '#2d3436' }}>Select Student:</label>
            <select required value={legacyForm.studentId} onChange={(e) => setLegacyForm({...legacyForm, studentId: e.target.value})} style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #dfe6e9' }}>
              <option value="">-- Choose a Student --</option>
              {studentsList.map(s => (
                <option key={s._id} value={s._id}>{s.name} ({s.email})</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ fontWeight: 'bold', fontSize: '14px', color: '#2d3436' }}>Month & Year:</label>
            <input required type="text" placeholder="e.g., August 2026" value={legacyForm.monthYear} onChange={(e) => setLegacyForm({...legacyForm, monthYear: e.target.value})} style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #dfe6e9', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ fontWeight: 'bold', fontSize: '14px', color: '#2d3436' }}>Google Drive Link:</label>
            <input required type="url" placeholder="https://drive.google.com/..." value={legacyForm.pdfLink} onChange={(e) => setLegacyForm({...legacyForm, pdfLink: e.target.value})} style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #dfe6e9', boxSizing: 'border-box' }} />
          </div>

          <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
            <button type="submit" disabled={isSubmittingLegacy} style={{ width: '100%', padding: '12px', backgroundColor: '#6c5ce7', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>
              {isSubmittingLegacy ? 'Linking PDF...' : '🔗 Attach PDF to Student Vault'}
            </button>
          </div>
        </form>
      </div>

      {/* ========================================== */}
      {/* 🏆 HONOR LIST GENERATOR CARD */}
      {/* ========================================== */}
      <div style={{ backgroundColor: '#fff', padding: '25px', borderRadius: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.04)', marginTop: '40px', borderTop: '5px solid #f3b431' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#2d3436', fontSize: '20px' }}>🏆 Honor List Generator</h2>
            <p style={{ margin: '5px 0 0 0', color: '#636e72', fontSize: '13px' }}>Automatically grab all students who achieved 10/10 perfect scores for any month.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px' }}>
          <select 
            value={selectedHonorMonth} 
            onChange={(e) => setSelectedHonorMonth(e.target.value)} 
            style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #dfe6e9', fontSize: '14px', width: '220px', backgroundColor: 'white', cursor: 'pointer', fontWeight: 'bold', color: '#2d3436' }}
          >
            {recentMonths.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button 
            onClick={fetchHonorList} 
            disabled={loadingHonorList} 
            style={{ padding: '10px 20px', backgroundColor: '#f3b431', color: '#2d3436', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {loadingHonorList ? 'Fetching...' : '🔍 Generate List'}
          </button>
        </div>

        {honorList.length > 0 && (
          <div style={{ backgroundColor: '#fdf9ec', padding: '20px', borderRadius: '10px', border: '1px solid #ffeaa7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ margin: 0, color: '#e67e22', fontSize: '16px' }}>🌟 {honorList.length} Students Qualified for {selectedHonorMonth}</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={copyHonorNames} 
                  style={{ backgroundColor: '#e67e22', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                >
                  📋 Copy All Names
                </button>
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '15px' }}>
              {honorList.map((st, i) => (
                <div key={i} style={{ backgroundColor: 'white', padding: '12px 15px', borderRadius: '8px', border: '1px solid #dfe6e9', fontWeight: 'bold', color: '#2d3436', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
                  <span>{st.studentName}</span>
                  <span style={{ fontSize: '12px', backgroundColor: '#2ecc71', color: 'white', padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold' }}>10/10</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* 📑 STUDY PLANS APPROVAL GATE */}
      {/* ========================================== */}
      <div style={{ marginTop: '40px', backgroundColor: '#e8f4fd', padding: '20px', borderRadius: '8px', border: '1px solid #b6d4fe', color: '#004085' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            📑 Study Plans Approval Gate
            {pendingReports.length > 0 && (
              <span style={{ backgroundColor: '#e74c3c', color: 'white', fontSize: '16px', padding: '4px 10px', borderRadius: '12px' }}>
                {pendingReports.length} Pending
              </span>
            )}
          </h2>
          <button onClick={() => fetchPendingReports(localStorage.getItem('token'))} style={{ padding: '8px 15px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
            🔄 Refresh Inbox
          </button>
        </div>

        {loadingReports ? (
          <p>Loading pending reports...</p>
        ) : pendingReports.length === 0 ? (
          <div style={{ padding: '15px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '5px', border: '1px solid #c3e6cb' }}>
            🎉 <strong>All caught up!</strong> There are no study plans or reports waiting for your approval.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '15px' }}>
            {pendingReports.map((report, idx) => (
              <div key={idx} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', borderLeft: report.isFinalized ? '5px solid #d63031' : '5px solid #0984e3', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 5px 0', color: '#2d3436' }}>👤 {report.studentName}</h3>
                    <p style={{ margin: 0, color: '#636e72', fontWeight: 'bold' }}>{report.monthYear} - {report.isFinalized ? 'Phase 2: Final Graded Report' : 'Phase 1: Draft Monthly Plan'}</p>
                    {report.lastSavedByName && (
                      <p style={{ margin: '5px 0 0 0', color: '#6c5ce7', fontSize: '13px', fontWeight: 'bold' }}>🆕 Last saved by {report.lastSavedByName}</p>
                    )}
                    {report.teacherCount > 1 && (
                      <p style={{ margin: '5px 0 0 0', color: report.waitingFor?.length ? '#d35400' : '#00b894', fontSize: '13px', fontWeight: 'bold' }}>
                        👥 {report.doneCount} of {report.teacherCount} teachers done{report.waitingFor?.length ? `, waiting for ${report.waitingFor.join(', ')}` : ''}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    
                    <button 
                      onClick={() => { setSelectedReport(report); setIsRejectModalOpen(true); }}
                      style={{ backgroundColor: 'transparent', color: '#d63031', border: '1px solid #d63031', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      Reject & Edit
                    </button>

                    <button 
                      onClick={() => { 
                        setSelectedReport(report); 
                        setEditedNote(report.teacherNote || ''); 
                        setIsEditApproveModalOpen(true); 
                      }}
                      style={{ backgroundColor: '#f39c12', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      ✏️ Edit & Approve
                    </button>

                    <button 
                      onClick={() => handleApproveReport(report.studentId, report.monthYear)}
                      style={{ backgroundColor: '#2ecc71', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      {report.waitingFor?.length && report.teacherCount > 1 ? '✅ Approve and send anyway' : '✅ Approve As-Is'}
                    </button>

                    {/* 👥 Step 5: two-teacher students — approve now, send after the other teacher's part */}
                    {report.teacherCount > 1 && report.waitingFor?.length > 0 && (
                      <button
                        onClick={() => handleApproveReport(report.studentId, report.monthYear, null, { mode: 'wait', waitingFor: report.waitingFor })}
                        style={{ backgroundColor: '#e67e22', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                        ⏳ Approve and wait for {report.waitingFor.join(', ')}
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', fontSize: '14px', color: '#333' }}>
                  {report.quran?.enrolled && <p style={{ margin: '5px 0' }}><strong>Quran:</strong> {report.quran.plan} {report.isFinalized && <span style={{color: '#0984e3', fontWeight: 'bold'}}>{`(${report.quran.score}/${report.quran.maxPossible})`}</span>}</p>}
                  {report.arabic?.enrolled && <p style={{ margin: '5px 0' }}><strong>Arabic:</strong> {report.arabic.plan} {report.isFinalized && <span style={{color: '#0984e3', fontWeight: 'bold'}}>{`(${report.arabic.score}/${report.arabic.maxPossible})`}</span>}</p>}
                  {report.islamicStudies?.enrolled && <p style={{ margin: '5px 0' }}><strong>Islamic Studies:</strong> {report.islamicStudies.plan} {report.isFinalized && <span style={{color: '#0984e3', fontWeight: 'bold'}}>{`(${report.islamicStudies.score}/${report.islamicStudies.maxPossible})`}</span>}</p>}
                  {report.isFinalized && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #dfe6e9' }}>
                      <p style={{ margin: '0 0 5px 0', fontSize: '16px' }}><strong>Total Score: <span style={{color: '#0984e3'}}>{report.totalScore}/10</span></strong></p>
                      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}><strong>Teacher Note:</strong><br/>{report.teacherNote}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* 🔄 STEP 8: SWITCH TO NEW IDS (old WhatsApp IDs → invite codes, Google Calendar + LMS) */}
      {/* ========================================== */}
      <div style={{ backgroundColor: '#fff', padding: '25px', borderRadius: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.04)', marginTop: '40px', borderTop: '5px solid #00b894' }}>
        <h2 style={{ margin: 0, color: '#2d3436', fontSize: '20px' }}>🔄 Switch to new IDs</h2>
        <p style={{ margin: '5px 0 15px 0', color: '#636e72', fontSize: '13px' }}>New ID = the last part of the group invite link. Changes the running weekly classes and upcoming classes in Google Calendar, and the saved groups in the LMS. Preview first: nothing changes until you press Apply. A backup of every class description is kept.</p>
        <button onClick={fetchIdPlan} disabled={loadingIds} style={{ padding: '10px 20px', backgroundColor: '#00b894', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
          {loadingIds ? 'Working... (this can take a minute)' : '🔍 Preview'}
        </button>

        {idPlan && (() => {
          const unclear = idPlan.classes.filter(c => c.status === 'unclear');
          const manual = idPlan.classes.filter(c => c.status === 'manual');
          const ready = idPlan.classes.filter(c => c.status === 'ready');
          const fmt = (d) => d ? new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
          const kindLabel = (k) => k === 'series' ? 'weekly series' : k === 'exception' ? 'single changed class' : 'single class';
          const choose = (id, role, code) => setIdChoices(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [role]: code } }));
          return (
            <div style={{ marginTop: '18px' }}>
              <p style={{ fontWeight: 'bold', margin: '0 0 10px 0' }}>✅ {idPlan.counts.ready} ready · ❓ {idPlan.counts.unclear} unclear · ✋ {idPlan.counts.manual} edit by hand · 👥 {idPlan.lmsUpdates.length} LMS groups · 📝 {idPlan.people.length} people without classes</p>

              {unclear.length > 0 && (
                <div style={{ marginBottom: '18px' }}>
                  <h3 style={{ fontSize: '16px', margin: '0 0 8px 0' }}>❓ Unclear classes: please choose (unanswered ones are skipped)</h3>
                  {unclear.map(c => (
                    <div key={c.id} style={{ border: '1px solid #ffe69c', backgroundColor: '#fffdf3', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px', fontSize: '13px' }}>
                      <strong>{c.title}</strong> <span style={{ color: '#636e72' }}>({kindLabel(c.kind)}{c.start ? `, from ${fmt(c.start)}` : ''})</span>
                      {['teacher', 'student'].filter(role => c.sides[role]?.unclear).map(role => (
                        <div key={role} style={{ marginTop: '6px' }}>
                          <div style={{ color: '#d35400' }}>{role === 'teacher' ? '👨‍🏫 Teacher group' : '👤 Student group'}: {c.sides[role].reason}</div>
                          {c.sides[role].options.map(o => (
                            <label key={o.code} style={{ display: 'block', cursor: 'pointer', padding: '2px 0' }}>
                              <input type="radio" name={`${c.id}-${role}`} checked={idChoices[c.id]?.[role] === o.code} onChange={() => choose(c.id, role, o.code)} /> {o.label}{o.matchesTitle ? ' ✓ matches the class name' : ''}
                            </label>
                          ))}
                        </div>
                      ))}
                      {['teacher', 'student'].filter(role => c.sides[role] && !c.sides[role].unclear).map(role => (
                        <div key={role} style={{ color: '#636e72', marginTop: '4px' }}>{role === 'teacher' ? '👨‍🏫' : '👤'} {c.sides[role].label} (clear)</div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {manual.length > 0 && (
                <div style={{ marginBottom: '18px', fontSize: '13px' }}>
                  <h3 style={{ fontSize: '16px', margin: '0 0 8px 0' }}>✋ Edit by hand in Google Calendar</h3>
                  {manual.map(c => <div key={c.id}>• <strong>{c.title}</strong>: {c.note}</div>)}
                </div>
              )}

              {ready.length > 0 && (
                <details style={{ marginBottom: '18px', fontSize: '13px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>✅ {ready.length} classes ready (click to see)</summary>
                  <div style={{ maxHeight: '260px', overflowY: 'auto', marginTop: '6px' }}>
                    {ready.map(c => (
                      <div key={c.id} style={{ padding: '4px 0', borderBottom: '1px solid #f1f2f6' }}>
                        <strong>{c.title}</strong> <span style={{ color: '#636e72' }}>({kindLabel(c.kind)})</span>
                        {['teacher', 'student'].filter(role => c.sides[role]).map(role => (
                          <span key={role} style={{ color: '#636e72' }}> · {role === 'teacher' ? '👨‍🏫' : '👤'} {c.sides[role].label}{c.sides[role].addLink ? ' (+ link line)' : ''}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {idPlan.lmsUpdates.length > 0 && (
                <details style={{ marginBottom: '18px', fontSize: '13px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>👥 {idPlan.lmsUpdates.length} saved groups in the LMS become links (click to see)</summary>
                  <div style={{ maxHeight: '220px', overflowY: 'auto', marginTop: '6px' }}>
                    {idPlan.lmsUpdates.map(u => <div key={u.id}>• {u.name} ({u.role}): <span style={{ color: '#00b894' }}>{u.newLink}</span></div>)}
                  </div>
                </details>
              )}

              {idPlan.people.length > 0 && (
                <div style={{ marginBottom: '18px', fontSize: '13px' }}>
                  <h3 style={{ fontSize: '16px', margin: '0 0 8px 0' }}>📝 People without a link found: paste their group invite link, or leave empty to remove the old ID</h3>
                  {idPlan.people.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                      <span style={{ minWidth: '170px' }}><strong>{p.name}</strong> <small style={{ color: '#636e72' }}>({p.role}{p.status ? `, ${p.status}` : ''})</small></span>
                      <input type="text" placeholder="https://chat.whatsapp.com/..." value={idPeople[p.id] || ''} onChange={(e) => setIdPeople(prev => ({ ...prev, [p.id]: e.target.value }))} style={{ flex: 1, minWidth: '220px', padding: '6px', borderRadius: '6px', border: '1px solid #dfe6e9' }} />
                      {p.suggestion && !idPeople[p.id] && (
                        <button type="button" onClick={() => setIdPeople(prev => ({ ...prev, [p.id]: p.suggestion }))} style={{ fontSize: '12px', padding: '5px 8px', cursor: 'pointer', borderRadius: '5px', border: '1px solid #00b894', backgroundColor: '#eafaf1' }}>Use link from their classes</button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button onClick={applyIdPlan} disabled={loadingIds} style={{ padding: '12px 22px', backgroundColor: '#0984e3', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: loadingIds ? 'not-allowed' : 'pointer' }}>
                {loadingIds ? 'Working...' : '✅ Apply the switch'}
              </button>
              {idPlan.switchedAt && <p style={{ fontSize: '12px', color: '#636e72', margin: '8px 0 0 0' }}>Last applied: {new Date(idPlan.switchedAt).toLocaleString()}</p>}
            </div>
          );
        })()}
      </div>

      {/* ========================================== */}
      {/* 📋 STEP 5: PREVIEW PLAN / REPORT REMINDERS (sends nothing) */}
      {/* ========================================== */}
      <div style={{ backgroundColor: '#fff', padding: '25px', borderRadius: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.04)', marginTop: '40px', borderTop: '5px solid #0984e3' }}>
        <h2 style={{ margin: 0, color: '#2d3436', fontSize: '20px' }}>📋 Plan & Report Reminders</h2>
        <p style={{ margin: '5px 0 15px 0', color: '#636e72', fontSize: '13px' }}>See exactly who would get a reminder on a day (10:00 AM Cairo). Nothing is sent from here.</p>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '15px' }}>
          <input type="date" value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #dfe6e9', fontSize: '14px' }} />
          <button onClick={fetchReminderPreview} disabled={loadingPreview} style={{ padding: '10px 20px', backgroundColor: '#0984e3', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            {loadingPreview ? 'Checking...' : (previewDate === new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) ? "👀 Preview today's reminders" : `👀 Preview reminders for ${previewDate}`)}
          </button>
        </div>
        {previewData && (
          <>
            {previewData.warnings?.length > 0 && (
              <div style={{ backgroundColor: '#fff3cd', border: '1px solid #ffe69c', color: '#856404', padding: '12px 15px', borderRadius: '8px', marginBottom: '15px', fontSize: '13px' }}>
                {previewData.warnings.map((w, i) => <p key={i} style={{ margin: i ? '6px 0 0 0' : 0 }}>⚠️ {w}</p>)}
              </div>
            )}
            {previewData.actions?.length === 0 ? (
              <p style={{ color: '#636e72', fontStyle: 'italic' }}>No reminders would be sent on {previewData.date}.</p>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                <p style={{ margin: 0, fontWeight: 'bold', color: '#2d3436' }}>{previewData.actions.length} message(s) on {previewData.date}:</p>
                {previewData.actions.map((a, i) => (
                  <div key={i} style={{ backgroundColor: '#f8f9fa', borderLeft: '4px solid #0984e3', padding: '12px 15px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <strong style={{ color: '#2d3436' }}>📨 To: {a.toName}</strong>
                      {a.alreadySent && <span style={{ backgroundColor: '#55efc4', color: '#00684a', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>✅ Already sent</span>}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', color: '#2d3436' }}>{a.text}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ========================================== */}
      {/* 📊 NEW: SCHOOL-WIDE MONTHLY TRACKER */}
      {/* ========================================== */}
      <div style={{ backgroundColor: '#fff', padding: '25px', borderRadius: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.04)', marginTop: '40px', borderTop: '5px solid #9b59b6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div>
            <h2 style={{ margin: 0, color: '#2d3436', fontSize: '20px' }}>📊 School-Wide Monthly Tracker</h2>
            <p style={{ margin: '5px 0 0 0', color: '#636e72', fontSize: '13px' }}>Track exactly which teachers are missing reports and which are finalized.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '25px' }}>
          <select 
            value={trackMonth} 
            onChange={(e) => setTrackMonth(e.target.value)} 
            style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #dfe6e9', fontSize: '14px', width: '220px', backgroundColor: 'white', cursor: 'pointer', fontWeight: 'bold', color: '#2d3436' }}
          >
            {recentMonths.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button 
            onClick={fetchTrackingData} 
            disabled={loadingTrack} 
            style={{ padding: '10px 20px', backgroundColor: '#9b59b6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {loadingTrack ? 'Scanning...' : '🔍 Fetch Tracking Data'}
          </button>
          {trackData.teacherStats?.length > 0 && (
            <select value={trackTeacher} onChange={(e) => setTrackTeacher(e.target.value)} style={{ padding: '10px 15px', borderRadius: '8px', border: '1px solid #dfe6e9', fontSize: '14px', backgroundColor: 'white', cursor: 'pointer', fontWeight: 'bold', color: '#2d3436' }}>
              <option value="">👨‍🏫 All teachers</option>
              {trackData.teacherStats.map(t => <option key={t.teacherId} value={t.teacherId}>{t.name}</option>)}
            </select>
          )}
        </div>

        {trackData.summary && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px', marginBottom: '20px' }}>
              <div style={{ backgroundColor: '#f1f2f6', padding: '15px', borderRadius: '8px', textAlign: 'center', borderLeft: '4px solid #b2bec3' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#636e72', fontSize: '12px', textTransform: 'uppercase' }}>Students With Classes</h4>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#2d3436' }}>{trackData.summary.total}</p>
              </div>
              <div style={{ backgroundColor: '#fff5f5', padding: '15px', borderRadius: '8px', textAlign: 'center', borderLeft: '4px solid #ff7675' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#636e72', fontSize: '12px', textTransform: 'uppercase' }}>Missing (No Action)</h4>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#d63031' }}>{trackData.summary.missing}</p>
              </div>
              <div style={{ backgroundColor: '#e8f4fd', padding: '15px', borderRadius: '8px', textAlign: 'center', borderLeft: '4px solid #74b9ff' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#636e72', fontSize: '12px', textTransform: 'uppercase' }}>Draft Plans</h4>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#0984e3' }}>{trackData.summary.draft}</p>
              </div>
              <div style={{ backgroundColor: '#f0fff4', padding: '15px', borderRadius: '8px', textAlign: 'center', borderLeft: '4px solid #55efc4' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#636e72', fontSize: '12px', textTransform: 'uppercase' }}>Final Reports</h4>
                <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#00b894' }}>{trackData.summary.final}</p>
              </div>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid #dfe6e9', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', color: '#2d3436', borderBottom: '2px solid #dfe6e9' }}>
                    <th style={{ padding: '12px 15px' }}>Student Name</th>
                    <th style={{ padding: '12px 15px' }}>Teachers (📋 plan · 📝 report)</th>
                    <th style={{ padding: '12px 15px' }}>Plan Status</th>
                    <th style={{ padding: '12px 15px' }}>Approval Status</th>
                  </tr>
                </thead>
                <tbody>
                  {trackData.trackingData.filter(row => !trackTeacher || (row.teachers || []).some(t => t.teacherId === trackTeacher)).map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f2f6', backgroundColor: row.status === 'Missing' ? '#fff9f9' : 'white' }}>
                      <td style={{ padding: '12px 15px', fontWeight: 'bold', color: '#2d3436' }}>{row.studentName}</td>
                      <td style={{ padding: '12px 15px', fontSize: '13px' }}>
                        {(row.teachers || []).map(t => (
                          <div key={t.teacherId}>{t.name}: 📋{t.planDone ? '✅' : '❌'} 📝{t.reportDone ? '✅' : '❌'}</div>
                        ))}
                        {row.teacherCount > 1 && (
                          <div style={{ color: '#d35400', fontWeight: 'bold', marginTop: '3px' }}>👥 Plans {row.plansDone} of {row.teacherCount} done · Reports {row.reportsDone} of {row.teacherCount} done</div>
                        )}
                        {row.changes && (row.changes.postponed > 0 || row.changes.cancelled > 0) && (
                          <div style={{ color: '#6c5ce7', marginTop: '3px' }}>🔁 {row.changes.postponed} postponed · 🚫 {row.changes.cancelled} cancelled</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 15px' }}>
                        {row.status === 'Missing' && <span style={{ color: '#d63031', fontWeight: 'bold' }}>❌ Missing</span>}
                        {row.status === 'Draft Plan' && <span style={{ color: '#0984e3', fontWeight: 'bold' }}>📝 Draft Plan</span>}
                        {row.status === 'Final Report' && <span style={{ color: '#00b894', fontWeight: 'bold' }}>🏁 Final Report</span>}
                      </td>
                      <td style={{ padding: '12px 15px' }}>
                        {row.approvalStatus === 'N/A' && <span style={{ color: '#b2bec3' }}>N/A</span>}
                        {row.approvalStatus === 'pending' && <span style={{ backgroundColor: '#fdcb6e', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>Pending</span>}
                        {row.approvalStatus === 'approved' && <span style={{ backgroundColor: '#55efc4', color: '#00b894', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>Approved</span>}
                        {row.approvalStatus === 'rejected' && <span style={{ backgroundColor: '#ff7675', color: 'white', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>Rejected</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ⏱️ Step 5: on time vs late, per teacher */}
            {trackData.teacherStats?.length > 0 && (
              <div style={{ marginTop: '20px', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#2d3436' }}>⏱️ On time this month</h3>
                {trackData.teacherStats.filter(t => !trackTeacher || t.teacherId === trackTeacher).map(t => (
                  <p key={t.teacherId} style={{ margin: '5px 0', fontSize: '14px', color: '#2d3436' }}>
                    <strong>{t.name}:</strong> Plans {t.plansOnTime}/{t.students} on time{t.plansLate ? `, ${t.plansLate} late` : ''} · Reports {t.reportsOnTime}/{t.students} on time{t.reportsLate ? `, ${t.reportsLate} late` : ''}{t.changes && (t.changes.postponed > 0 || t.changes.cancelled > 0) ? ` · 🔁 ${t.changes.postponed} postponed · 🚫 ${t.changes.cancelled} cancelled` : ''}
                  </p>
                ))}
                <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#636e72' }}>On time = plan saved by the student's first class day, report saved by the student's last class day.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* PENDING MAKEUP REQUESTS INBOX */}
      <div style={{ marginTop: '40px', backgroundColor: '#fff3cd', padding: '20px', borderRadius: '8px', border: '1px solid #ffeeba', color: '#856404' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          📥 Pending Makeup Requests
          {pendingMakeups.length > 0 && (
            <span style={{ backgroundColor: '#e74c3c', color: 'white', fontSize: '16px', padding: '4px 10px', borderRadius: '12px' }}>
              {pendingMakeups.length} New
            </span>
          )}
        </h2>
        <p style={{ marginTop: '5px', marginBottom: '20px' }}>Students who have requested a makeup class. Once you book the new class on Google Calendar, click "Mark as Scheduled" to clear the request.</p>

        {loadingMakeups ? (
          <p>Loading inbox...</p>
        ) : pendingMakeups.length === 0 ? (
          <div style={{ padding: '15px', backgroundColor: '#d4edda', color: '#155724', borderRadius: '5px', border: '1px solid #c3e6cb' }}>
            🎉 <strong>Inbox Zero!</strong> There are no pending makeup requests.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {pendingMakeups.map((req) => (
              <div key={req._id} style={{ backgroundColor: '#fff', padding: '15px', borderRadius: '8px', borderLeft: '5px solid #ffc107', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', color: '#333', fontSize: '1.2em' }}>👤 {req.student?.name || 'Unknown Student'}</h4>
                  <p style={{ margin: 0, fontSize: '14px', color: '#555', lineHeight: '1.5' }}>
                    <strong>Original Missed Class:</strong> {new Date(req.originalDate).toLocaleDateString()}<br/>
                    <strong>Preferred Makeup Date:</strong> <span style={{ color: '#e67e22', fontWeight: 'bold' }}>{new Date(req.preferredDate).toLocaleDateString()}</span><br/>
                    <strong>Reason Provided:</strong> {req.reason || 'None provided'}
                  </p>
                </div>
                <button 
                  onClick={() => handleResolveMakeup(req._id)}
                  style={{ padding: '10px 20px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', alignSelf: 'flex-start' }}>
                  ✅ Mark as Scheduled
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="live-monitor-section" style={{ marginTop: '40px', backgroundColor: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0 }}>📡 Live Class Monitor (24h)</h2>
            <p style={{ color: '#555', margin: '5px 0 0 0' }}>Real-time overview of all teacher schedules and communication triggers.</p>
          </div>
          <button onClick={() => fetchLiveClasses(localStorage.getItem('token'))} style={{ padding: '8px 15px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
            🔄 Refresh Monitor
          </button>
        </div>
        
        {loading ? (
          <p>Loading live schedule...</p>
        ) : liveClasses.length === 0 ? (
          <p>No classes scheduled for the next 24 hours.</p>
        ) : (
          liveClasses.map((teacherGroup, index) => (
            <div key={index} className="teacher-group-card" style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
              <h3 style={{ borderBottom: '2px solid #3498db', paddingBottom: '10px', color: '#2c3e50' }}>
                👨‍🏫 Teacher: {teacherGroup.teacherName}
              </h3>

              {teacherGroup.live && teacherGroup.live.length > 0 && (
                <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#e8f8f5', borderRadius: '5px', borderLeft: '5px solid #2ecc71', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                  <h4 style={{ color: '#27ae60', fontWeight: 'bold', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="joined-pulse">🟢</span> TEACHER HAS JOINED (LIVE NOW)
                  </h4>
                  <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
                    {teacherGroup.live.map((cls, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i !== teacherGroup.live.length - 1 ? '1px solid #d1f2eb' : 'none' }}>
                        <span>
                          <strong style={{ color: '#2c3e50', fontSize: '1.1em' }}>{cls.subject || cls.title}</strong><br/>
                          <small style={{ color: '#16a085', fontWeight: 'bold' }}>🕒 Button Clicked at: {new Date(cls.createdAt || cls.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small>
                        </span>
                        
                        <button 
                          onClick={() => handleForceEnd(cls._id, cls.subject || cls.title)}
                          style={{ padding: '6px 12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em', fontWeight: 'bold' }}>
                          🛑 Force End
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div style={{ marginTop: '15px' }}>
                <h4 style={{ color: '#e67e22' }}>⏳ Upcoming Classes</h4>
                {teacherGroup.upcoming.length === 0 ? <p style={{ fontSize: '0.9em', color: '#7f8c8d' }}>No upcoming classes.</p> : (
                  <ul style={{ listStyleType: 'none', padding: 0 }}>
                    {teacherGroup.upcoming.map((cls, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #eee' }}>
                        <span>
                          <strong>{cls.title}</strong><br/>
                          <small>🕒 {new Date(cls.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small>
                        </span>
                        
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            onClick={() => openClassAction('postpone', cls)}
                            style={{ padding: '6px 12px', backgroundColor: '#6c5ce7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em' }}>
                            🔁 Postpone
                          </button>
                          <button
                            onClick={() => openClassAction('cancel', cls)} 
                            style={{ padding: '6px 12px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em' }}>
                            🚫 Cancel
                          </button>
                          <button 
                            onClick={() => handleResendReminder(cls)} 
                            style={{ padding: '6px 12px', backgroundColor: '#e67e22', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em' }}>
                            🔄 Resend Reminder
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div style={{ marginTop: '20px' }}>
                <h4 style={{ color: '#2ecc71' }}>✅ Completed Classes</h4>
                {teacherGroup.completed.length === 0 ? <p style={{ fontSize: '0.9em', color: '#7f8c8d' }}>No completed classes yet.</p> : (
                  <ul style={{ listStyleType: 'none', padding: 0 }}>
                    {teacherGroup.completed.map((cls, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #eee' }}>
                        <span>
                          <strong>{cls.title || cls.subject}</strong><br/>
                          <small>🕒 {new Date(cls.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</small>
                        </span>
                        <div>
                          <button 
                            onClick={() => setViewNotesModal({ isOpen: true, text: cls.notes || 'No notes provided by teacher.', student: cls.title || cls.subject })} 
                            style={{ padding: '6px 12px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em', marginRight: '8px' }}>
                            👁️ View Notes
                          </button>
                          
                          <button 
                            onClick={() => handleResendNotes(cls)} 
                            style={{ padding: '6px 12px', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85em' }}>
                            🎓 Resend Notes
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: '40px', backgroundColor: '#2c3e50', padding: '20px', borderRadius: '8px', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, color: '#ecf0f1' }}>🤖 Bot Message Log (Last 24h)</h2>
          <button onClick={() => fetchMessageLogs(localStorage.getItem('token'))} style={{ padding: '8px 15px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
            🔄 Refresh Logs
          </button>
        </div>
        <p style={{ color: '#bdc3c7', marginBottom: '20px' }}>A complete paper trail of every WhatsApp message sent by your system.</p>
        
        {loadingLogs ? (
          <p>Loading messages...</p>
        ) : messageLogs.length === 0 ? (
          <p>No messages sent in the last 24 hours.</p>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', paddingRight: '10px' }}>
            {messageLogs.map((log) => (
              <div key={log._id} style={{ backgroundColor: '#34495e', padding: '15px', borderRadius: '8px', borderLeft: log.status === 'failed' ? '5px solid #e74c3c' : '5px solid #2ecc71' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#ecf0f1' }}>
                  <strong>📞 To: {log.recipient}</strong>
                  <span style={{ fontSize: '13px', color: '#bdc3c7' }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
                
                <div style={{ backgroundColor: '#1abc9c', color: 'white', padding: '12px', borderRadius: '5px', fontSize: '14px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', marginBottom: '10px', border: '1px solid #16a085' }}>
                  {log.messageBody}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: log.status === 'failed' ? '#e74c3c' : '#2ecc71' }}>
                    {log.status === 'failed' ? `❌ FAILED: ${log.errorMessage}` : '✅ SUCCESS'}
                  </span>
                  <button 
                    onClick={() => copyToClipboard(log.messageBody)}
                    style={{ padding: '6px 12px', backgroundColor: '#ecf0f1', color: '#2c3e50', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                    📋 Copy Draft
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 🔁 STEP 7: POSTPONE / CANCEL BOX */}
      {classAction && (() => {
        const a = classAction;
        const info = a.info;
        const set = (patch) => setClassAction(prev => ({ ...prev, ...patch }));
        const radio = (name, value, label, current, onPick) => (
          <label key={value} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', cursor: 'pointer' }}>
            <input type="radio" name={name} checked={current === value} onChange={() => onPick(value)} /> {label}
          </label>
        );
        const slotPicker = () => {
          if (!actionSlots) return <p style={{ fontSize: '13px' }}>Loading free times...</p>;
          if (actionSlots.error) return <p style={{ color: '#d63031' }}>{actionSlots.error}</p>;
          const groups = {};
          (actionSlots.slots || []).forEach(slot => {
            const k = new Date(slot).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            (groups[k] = groups[k] || []).push(slot);
          });
          return (
            <div style={{ marginTop: '8px' }}>
              {!actionSlots.hasHours && <p style={{ color: '#d35400', fontSize: '13px', margin: '0 0 6px 0' }}>⚠️ {actionSlots.teacher?.name} has not set their free hours yet.</p>}
              {actionSlots.hasHours && !actionSlots.fresh && <p style={{ color: '#d35400', fontSize: '13px', margin: '0 0 6px 0' }}>⚠️ {actionSlots.teacher?.name} has not confirmed their hours since Monday.</p>}
              {Object.keys(groups).length === 0 && <p style={{ fontSize: '13px', color: '#636e72' }}>No free times in the next 14 days.</p>}
              <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                {Object.entries(groups).map(([dayLabel, daySlots]) => (
                  <div key={dayLabel} style={{ marginBottom: '8px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>{dayLabel}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                      {daySlots.map(slot => (
                        <button key={slot} type="button" onClick={() => set({ newStart: slot, manualTime: '' })} style={{ padding: '4px 8px', borderRadius: '5px', border: a.newStart === slot && !a.manualTime ? '2px solid #00b894' : '1px solid #dfe6e9', backgroundColor: a.newStart === slot && !a.manualTime ? '#eafaf1' : 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                          {new Date(slot).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <label style={{ display: 'block', fontSize: '13px', marginTop: '8px' }}>Or type a time (your time):
                <input type="datetime-local" value={a.manualTime} onChange={(e) => set({ manualTime: e.target.value })} style={{ marginLeft: '6px', padding: '4px', borderRadius: '5px', border: '1px solid #dfe6e9' }} />
              </label>
            </div>
          );
        };

        return (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
            <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', width: '520px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#2d3436' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>{a.type === 'cancel' ? '🚫 Cancel class' : '🔁 Postpone class'}</h2>
                <button onClick={() => setClassAction(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖</button>
              </div>
              <p style={{ margin: '8px 0 15px 0', color: '#636e72' }}>
                <strong>{a.cls.title}</strong><br />
                🕒 {new Date(a.cls.startTime).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {info && !info.error && <><br />👨‍🏫 {info.teacher?.name || 'Teacher not found'} · 👤 {info.student?.name || 'Student not found'}</>}
              </p>

              {!info ? <p>Loading...</p> : info.error ? <p style={{ color: '#d63031' }}>{info.error}</p> : a.type === 'cancel' ? (
                <>
                  <h4 style={{ margin: '0 0 4px 0' }}>Who cancelled?</h4>
                  {[['student', 'Student'], ['teacher', 'Teacher'], ['admin', 'Admin']].map(([v, l]) => radio('cancelledBy', v, l, a.cancelledBy, (val) => set({ cancelledBy: val })))}
                  <h4 style={{ margin: '12px 0 4px 0' }}>Give makeup credit?</h4>
                  {radio('giveCredit', true, 'Yes, add a makeup credit', a.giveCredit, (val) => set({ giveCredit: val }))}
                  {radio('giveCredit', false, 'No, count it from the package', a.giveCredit, (val) => set({ giveCredit: val }))}
                  <h4 style={{ margin: '12px 0 4px 0' }}>Pay the teacher for this class?</h4>
                  {radio('payTeacher', true, 'Yes', a.payTeacher, (val) => set({ payTeacher: val }))}
                  {radio('payTeacher', false, 'No', a.payTeacher, (val) => set({ payTeacher: val }))}
                  <p style={{ fontSize: '12px', color: '#636e72', margin: '2px 0 0 0' }}>Suggested by the 30-minute rule. You can change it.</p>
                </>
              ) : (
                <>
                  {radio('mode', 'student', '1. Let the student choose (makeup credit + "choose a new time" message)', a.mode, (val) => { set({ mode: val, newStart: '', manualTime: '' }); setActionSlots(null); })}
                  {radio('mode', 'time', "2. I'll pick the new time", a.mode, (val) => { set({ mode: val, newStart: '', manualTime: '' }); if (info.teacher) loadActionSlots(info.teacher.id); })}
                  {radio('mode', 'teacher', '3. Move to another teacher', a.mode, (val) => { set({ mode: val, newStart: '', manualTime: '', newTeacherId: '' }); setActionSlots(null); })}

                  {a.mode === 'time' && (info.teacher ? slotPicker() : <p style={{ color: '#d63031' }}>The teacher of this class was not found.</p>)}

                  {a.mode === 'teacher' && (
                    <div style={{ marginTop: '8px' }}>
                      <select value={a.newTeacherId} onChange={(e) => { set({ newTeacherId: e.target.value, newStart: '', manualTime: '' }); loadActionSlots(e.target.value); }} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dfe6e9' }}>
                        <option value="">-- Choose the new teacher --</option>
                        {(info.teachers || []).filter(t => t.id !== info.teacher?.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      {a.newTeacherId && (
                        <>
                          <p style={{ fontSize: '13px', margin: '8px 0 0 0' }}>Keep the same time, or choose a new one below. {(a.newStart || a.manualTime) && <button type="button" onClick={() => set({ newStart: '', manualTime: '' })} style={{ marginLeft: '6px', fontSize: '12px', cursor: 'pointer' }}>↩ Keep same time</button>}</p>
                          {slotPicker()}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              {info && !info.error && (
                <>
                  <input type="text" placeholder="Reason (optional, saved in the history)" value={a.reason} onChange={(e) => set({ reason: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', padding: '8px', borderRadius: '6px', border: '1px solid #dfe6e9', marginTop: '15px' }} />
                  <button onClick={submitClassAction} disabled={isSubmittingAction} style={{ width: '100%', marginTop: '12px', padding: '12px', backgroundColor: isSubmittingAction ? '#b2bec3' : (a.type === 'cancel' ? '#e74c3c' : '#6c5ce7'), color: 'white', border: 'none', borderRadius: '8px', cursor: isSubmittingAction ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                    {isSubmittingAction ? 'Working...' : a.type === 'cancel' ? '🚫 Cancel this class' : '🔁 Postpone this class'}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* VIEW NOTES MODAL */}
      {viewNotesModal.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '450px', color: 'black' }}>
            <h3 style={{ marginTop: 0, color: '#2c3e50', borderBottom: '2px solid #3498db', paddingBottom: '10px' }}>
              📝 Notes: {viewNotesModal.student}
            </h3>
            
            <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '5px', minHeight: '100px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '14px', border: '1px solid #eee' }}>
              {viewNotesModal.text}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button 
                onClick={() => setViewNotesModal({ isOpen: false, text: '', student: '' })} 
                style={{ padding: '10px 20px', cursor: 'pointer', backgroundColor: '#34495e', color: 'white', border: 'none', borderRadius: '4px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT & APPROVE MODAL */}
      {isEditApproveModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '15px', width: '500px', color: '#2d3436' }}>
            <h2 style={{ margin: '0 0 10px 0', color: '#f39c12' }}>✏️ Edit General Feedback</h2>
            <p style={{ margin: '0 0 20px 0', color: '#636e72', fontSize: '14px' }}>Edit the teacher's note before publishing it to {selectedReport?.studentName}'s parent.</p>
            
            <textarea 
              value={editedNote} 
              onChange={(e) => setEditedNote(e.target.value)} 
              style={{ width: '100%', height: '150px', padding: '10px', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid #dfe6e9', fontFamily: 'inherit' }} 
            />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              <button type="button" onClick={() => setIsEditApproveModalOpen(false)} disabled={isSubmittingReport} style={{ padding: '10px 15px', cursor: 'pointer', border: '1px solid #b2bec3', borderRadius: '6px', backgroundColor: 'transparent', fontWeight: 'bold', color: '#636e72' }}>Cancel</button>
              <button 
                onClick={() => handleApproveReport(selectedReport.studentId, selectedReport.monthYear, editedNote)} 
                disabled={isSubmittingReport} 
                style={{ padding: '10px 15px', cursor: 'pointer', backgroundColor: '#2ecc71', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>
                {isSubmittingReport ? 'Saving...' : '💾 Save & Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECTION MODAL */}
      {isRejectModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '15px', width: '450px', color: '#2d3436' }}>
            <h2 style={{ margin: '0 0 10px 0', color: '#d63031' }}>🛑 Reject & Request Edit</h2>
            <p style={{ margin: '0 0 20px 0', color: '#636e72', fontSize: '14px' }}>Send {selectedReport?.studentName}'s {selectedReport?.monthYear} report back to the teacher with required fixes.</p>
            
            <form onSubmit={handleRejectSubmit}>
              <label style={{ fontWeight: 'bold' }}>Admin Notes (Sent via WhatsApp):</label>
              <textarea 
                required
                value={adminNotes} 
                onChange={(e) => setAdminNotes(e.target.value)} 
                placeholder="e.g., Please add more detail to the Quran section. Specify which Ayahs." 
                style={{ width: '100%', height: '100px', margin: '10px 0', padding: '10px', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid #dfe6e9' }} 
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px' }}>
                <button type="button" onClick={() => setIsRejectModalOpen(false)} disabled={isSubmittingReport} style={{ padding: '10px 15px', cursor: 'pointer', border: '1px solid #b2bec3', borderRadius: '6px', backgroundColor: 'transparent', fontWeight: 'bold', color: '#636e72' }}>Cancel</button>
                <button type="submit" disabled={isSubmittingReport} style={{ padding: '10px 15px', cursor: 'pointer', backgroundColor: '#d63031', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>
                  {isSubmittingReport ? 'Rejecting...' : 'Submit Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default AdminDashboard;