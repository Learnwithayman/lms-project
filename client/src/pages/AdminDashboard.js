import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css'; 

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

  // ✨ NEW: Edit & Approve Modal State
  const [isEditApproveModalOpen, setIsEditApproveModalOpen] = useState(false);
  const [editedNote, setEditedNote] = useState('');

  // Legacy PDF Vault States
  const [studentsList, setStudentsList] = useState([]);
  const [legacyForm, setLegacyForm] = useState({ studentId: '', monthYear: '', pdfLink: '' });
  const [isSubmittingLegacy, setIsSubmittingLegacy] = useState(false);

  // State to handle the View Notes Modal
  const [viewNotesModal, setViewNotesModal] = useState({ isOpen: false, text: '', student: '' });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token || !userData) {
      navigate('/');
      return;
    }

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);

    if (parsedUser.role !== 'admin') {
      alert('Access Denied');
      navigate('/dashboard');
    } else {
      fetchLiveClasses(token);
      fetchMessageLogs(token);
      fetchPendingMakeups(token); 
      fetchPendingReports(token);
      fetchStudents(token);
    }
  }, [navigate]);

  const fetchStudents = async (token) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com'}/api/users`, {
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

  const handleLegacySubmit = async (e) => {
    e.preventDefault();
    setIsSubmittingLegacy(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com'}/api/admin/legacy-report`, {
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
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com'}/api/admin/pending-reports`, {
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

  // ✨ UPDATED: Added editedNote parameter
  const handleApproveReport = async (studentId, monthYear, customNote = null) => {
    if (!customNote && !window.confirm('Approve this report exactly as the teacher wrote it?')) return;
    
    setIsSubmittingReport(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com'}/api/admin/approve-report`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ studentId, monthYear, editedNote: customNote }) // Passes the fixed note to backend
      });
      if (response.ok) {
        alert('✅ Report Approved! It is now live on the Student Portal.');
        setIsEditApproveModalOpen(false);
        fetchPendingReports(token);
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
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com'}/api/admin/reject-report`, {
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
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com'}/api/schedule/admin/makeups`, {
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
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com'}/api/schedule/admin/makeups/${id}/resolve`, {
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
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com'}/api/schedule/admin-live-monitor`, {
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
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com'}/api/schedule/message-logs`, {
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

  const handleResendReminder = async (classData) => {
    if (!window.confirm(`Resend reminder for ${classData.title}?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com'}/api/schedule/resend-reminder`, {
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

  const handleCancelClass = async (classData) => {
    if (!window.confirm(`Are you sure you want to cancel "${classData.title}"?\n\nThis will send a WhatsApp notification to both the teacher and the student.`)) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com'}/api/schedule/admin-cancel`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          title: classData.title,
          studentGroupName: classData.studentGroupName,
          teacherGroupName: classData.teacherGroupId,
          startTime: classData.startTime
        })
      });
      
      if (response.ok) {
        alert('🚫 Class canceled successfully! Notifications have been sent.');
        fetchLiveClasses(token);
        fetchMessageLogs(token); 
      } else {
        alert('❌ Failed to cancel class.');
      }
    } catch (error) {
      console.error(error);
      alert('❌ Server error while canceling class.');
    }
  };

  const handleResendNotes = async (classData) => {
    if (!window.confirm(`Resend completed notes for ${classData.title || classData.subject}?`)) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com'}/api/schedule/resend-notes`, {
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
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com'}/api/schedule/admin-force-end`, {
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
          🗓️ Manage Classes
        </button>
        <button onClick={() => navigate('/admin-payroll')} className="action-btn btn-grey" style={{width: 'auto', padding: '10px 20px', backgroundColor: '#ffc107', color: '#333', fontWeight: 'bold', border: 'none'}}>
          💰 Manage Payroll
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
      {/* PENDING STUDY PLANS & REPORTS INBOX */}
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
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    
                    <button 
                      onClick={() => { setSelectedReport(report); setIsRejectModalOpen(true); }}
                      style={{ backgroundColor: 'transparent', color: '#d63031', border: '1px solid #d63031', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      Reject & Edit
                    </button>

                    {/* ✨ NEW: Edit & Approve Button */}
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
                      ✅ Approve As-Is
                    </button>
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
                            onClick={() => handleCancelClass(cls)} 
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

      {/* ✨ NEW: EDIT & APPROVE MODAL */}
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