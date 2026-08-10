import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css'; 

function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState({});
  const [liveClasses, setLiveClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // ✨ NEW: Message Log States
  const [messageLogs, setMessageLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

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
      fetchMessageLogs(token); // 👈 Fetch logs on load
    }
  }, [navigate]);

  // 📡 FETCH LIVE MONITOR DATA
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

  // 📜 FETCH MESSAGE LOGS
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

  // 🔄 RESEND REMINDER HANDLER
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
        fetchMessageLogs(token); // Refresh logs
      } else alert('❌ Failed to resend reminder.');
    } catch (error) {
      console.error(error);
    }
  };

  // 🚫 CANCEL UPCOMING CLASS HANDLER
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
        fetchMessageLogs(token); // Refresh logs
      } else {
        alert('❌ Failed to cancel class.');
      }
    } catch (error) {
      console.error(error);
      alert('❌ Server error while canceling class.');
    }
  };

  // 🎓 RESEND NOTES HANDLER
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
        fetchMessageLogs(token); // Refresh logs
      } else alert('❌ Failed to resend notes.');
    } catch (error) {
      console.error(error);
    }
  };

  // 🛑 FORCE END CLASS HANDLER
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
        fetchLiveClasses(token); // Refresh the monitor to remove it from the green box
      } else {
        alert('❌ Failed to force end class.');
      }
    } catch (error) {
      console.error(error);
      alert('❌ Server error while force ending class.');
    }
  };

  // 📋 COPY TO CLIPBOARD HELPER
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
          📋 View Users
        </button>
        <button onClick={() => navigate('/all-classes')} className="action-btn btn-grey" style={{width: 'auto', padding: '10px 20px'}}>
          🗓️ Manage Classes
        </button>
        <button onClick={() => navigate('/admin-payroll')} className="action-btn btn-grey" style={{width: 'auto', padding: '10px 20px', backgroundColor: '#ffc107', color: '#333', fontWeight: 'bold', border: 'none'}}>
          💰 Manage Payroll
        </button>
      </div>

      <div className="admin-grid">
        <div className="action-card" style={{ borderTopColor: '#3498db' }}>
          <h3>👤 Create New User</h3>
          <p>Register new teachers, students, or admins into the system.</p>
          <button onClick={() => navigate('/create-user')} className="action-btn btn-blue">
            Create User
          </button>
        </div>
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

              {/* ✨ 🟢 THE NEW TEACHER JOINED TRACKER WITH FORCE END BUTTON */}
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
                        
                        {/* 🛑 NEW: FORCE END BUTTON */}
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
              
              {/* UPCOMING CLASSES */}
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

              {/* COMPLETED CLASSES */}
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

      {/* ========================================== */}
      {/* 📜 SYSTEM MESSAGE LOG SECTION */}
      {/* ========================================== */}
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

    </div>
  );
}

export default AdminDashboard;