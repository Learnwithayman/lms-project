import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

// 🌐 LIVE PRODUCTION URL CONFIGURATION 
const API_URL = process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com';

function Dashboard() {
  const [classes, setClasses] = useState([]);
  const [user, setUser] = useState({});
  const [earnings, setEarnings] = useState(null); 
  const [subSummary, setSubSummary] = useState(null);
  
  const navigate = useNavigate();
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentClassId, setCurrentClassId] = useState(null);
  const [notes, setNotes] = useState('');
  const [classroomChecked, setClassroomChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token) return navigate('/');

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    
    fetchClasses(token, parsedUser);

    if (parsedUser?.role?.toLowerCase() === 'teacher') {
      fetchEarnings(token);
    } else {
      // 👈 NEW: Now securely pointing to the Day 4 Student Endpoint!
      fetchSubSummary(token);
    }
  }, [navigate]);

  const fetchClasses = async (token, parsedUser) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      let res;
      if (parsedUser?.role?.toLowerCase() === 'teacher') {
        res = await axios.get(`${API_URL}/api/schedule/google-calendar`, config);
      } else {
        res = await axios.get(`${API_URL}/api/schedule/my-classes`, config);
      }
      setClasses(res.data);
    } catch (error) {
      console.error("Error fetching classes:", error);
    }
  };

  const fetchEarnings = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/schedule/earnings`, config);
      setEarnings(res.data);
    } catch (error) {
      console.error("Failed to fetch earnings:", error);
    }
  };

  const fetchSubSummary = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/student/subscription-summary`, config);
      setSubSummary(res.data);
    } catch (error) {
      console.error("Failed to fetch subscription summary:", error);
    }
  };

  const handleJoinClassClick = async (cls) => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await axios.post(`${API_URL}/api/schedule/join`, {
        classId: cls.id || cls._id,
        title: cls.title || cls.subject,
        studentGroupName: cls.studentGroupName,
        startTime: cls.startTime
      }, config);
    } catch (error) {
      console.error('⚠️ Silently failed to mark class as joined:', error);
    }
  };

  const handleEndClass = async () => {
    if (!classroomChecked) return alert("Please upload the homework and check the confirmation box first!");
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const targetClass = classes.find(c => (c.id === currentClassId || c._id === currentClassId));

      let dynamicDuration = 60; 
      if (targetClass?.startTime && targetClass?.endTime) {
        const start = new Date(targetClass.startTime).getTime();
        const end = new Date(targetClass.endTime).getTime();
        dynamicDuration = Math.round((end - start) / 60000); 
      } else if (targetClass?.durationMinutes) {
        dynamicDuration = targetClass.durationMinutes; 
      }

      await axios.put(`${API_URL}/api/schedule/end`, {
        classId: currentClassId,
        notes: notes,
        classroomLink: targetClass?.classroomLink, 
        studentGroupId: targetClass?.studentGroupId,
        whatsappGroupId: targetClass?.teacherGroupId, 
        studentName: targetClass?.title,
        startTime: targetClass?.startTime,
        durationMinutes: dynamicDuration 
      }, config);

      setIsModalOpen(false);
      setNotes('');
      setClassroomChecked(false);
      
      fetchClasses(token, user);
      fetchEarnings(token);
      alert('✅ Class ended successfully and hours logged!');
    } catch (error) {
      console.error('Error ending class:', error);
      alert('Failed to end class.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAttendance = async (cls, status) => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      await axios.post(`${API_URL}/api/schedule/attendance`, {
        classId: cls.id || cls._id,
        attendanceStatus: status,
        studentGroupId: cls.studentGroupId,
        title: cls.title,
        startTime: cls.startTime,
        zoomLink: cls.zoomLink || cls.meetingLink
      }, config);
      alert(`✅ Student marked as ${status}. WhatsApp message sent!`);
    } catch (error) {
      console.error('Error marking attendance:', error);
      alert('Failed to mark attendance.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const isClassLive = (startTime) => {
    const now = new Date();
    const classStart = new Date(startTime);
    const fifteenMinsBefore = new Date(classStart.getTime() - 15 * 60 * 1000);
    const ninetyMinsAfter = new Date(classStart.getTime() + 90 * 60 * 1000);
    return now >= fifteenMinsBefore && now <= ninetyMinsAfter;
  };

  const selectedClass = classes.find(c => (c.id === currentClassId || c._id === currentClassId));

  // Calculates progress bar percentage safely
  const calculateProgress = () => {
    if (!subSummary?.subscription || subSummary.subscription.totalClassesBought === 0) return 0;
    const { classesUsed, totalClassesBought } = subSummary.subscription;
    const percentage = (classesUsed / totalClassesBought) * 100;
    return Math.min(percentage, 100); 
  };

  return (
    <div className="dashboard-container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      
      {/* 👑 LUXURY PARENT PORTAL HEADER */}
      {user?.role?.toLowerCase() !== 'teacher' ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '30px', borderRadius: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.04)', marginBottom: '30px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ width: '70px', height: '70px', borderRadius: '50%', backgroundColor: '#6c5ce7', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(108, 92, 231, 0.3)' }}>
              {user.name ? user.name.charAt(0).toUpperCase() : '👤'}
            </div>
            <div>
              <h1 style={{ margin: '0 0 5px 0', color: '#2d3436', fontSize: '28px' }}>Hello, {user.name}</h1>
              <span style={{ backgroundColor: '#e8f4fd', color: '#0984e3', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Parent Portal</span>
            </div>
          </div>
          <button onClick={handleLogout} style={{ border: 'none', backgroundColor: '#ff7675', color: 'white', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}>Logout</button>
        </div>
      ) : (
        <div className="dashboard-header">
          <h1>👋 Welcome, {user.name}</h1>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      )}

      {/* ========================================== */}
      {/* 🟢 TEACHER EARNINGS DASHBOARD              */}
      {/* ========================================== */}
      {user?.role?.toLowerCase() === 'teacher' && earnings && (
        <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #c3e6cb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
          <div>
            <h2 style={{ margin: '0 0 5px 0' }}>💰 Current Month Earnings</h2>
            <p style={{ margin: 0 }}>You have taught <strong>{earnings.totalHours} hours</strong> this month at <strong>${earnings.hourlyRate}/hr</strong>.</p>
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold' }}>${earnings.currentEarnings}</div>
        </div>
      )}

      {/* ========================================== */}
      {/* ✨ 🔵 LUXURY STUDENT SUBSCRIPTION DASHBOARD */}
      {/* ========================================== */}
      {user?.role?.toLowerCase() !== 'teacher' && subSummary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '25px', marginBottom: '40px' }}>
          
          {/* 🎓 Main Subscription Progress Card */}
          <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '15px', borderTop: '5px solid #0984e3', boxShadow: '0 10px 25px rgba(0,0,0,0.04)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#2d3436', fontSize: '20px', display: 'flex', justifyContent: 'space-between' }}>
              <span>📅 Current Plan</span>
              {subSummary.subscription?.status === 'active' ? (
                <span style={{ fontSize: '12px', backgroundColor: '#00b894', color: 'white', padding: '4px 10px', borderRadius: '12px', alignSelf: 'center' }}>ACTIVE</span>
              ) : (
                <span style={{ fontSize: '12px', backgroundColor: '#b2bec3', color: 'white', padding: '4px 10px', borderRadius: '12px', alignSelf: 'center' }}>INACTIVE</span>
              )}
            </h3>
            
            {subSummary.subscription ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#636e72', fontWeight: 'bold' }}>
                  <span>{subSummary.subscription.classesUsed} Completed</span>
                  <span>{subSummary.subscription.totalClassesBought} Total</span>
                </div>
                
                {/* Visual Progress Bar */}
                <div style={{ width: '100%', height: '12px', backgroundColor: '#dfe6e9', borderRadius: '10px', overflow: 'hidden', marginBottom: '20px' }}>
                  <div style={{ width: `${calculateProgress()}%`, height: '100%', backgroundColor: '#0984e3', transition: 'width 0.5s ease-in-out' }}></div>
                </div>

                <div style={{ backgroundColor: '#f5f6fa', padding: '15px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>⏳</span>
                  <div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#636e72', textTransform: 'uppercase', fontWeight: 'bold' }}>Next Renewal Date</p>
                    <p style={{ margin: 0, color: '#2d3436', fontWeight: 'bold', fontSize: '16px' }}>
                      {new Date(subSummary.subscription.endDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p style={{ margin: 0, color: '#b2bec3', fontStyle: 'italic' }}>No active subscription found. Please contact administration.</p>
            )}
          </div>

          {/* ✨ Makeup Bank Card */}
          <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '15px', borderTop: '5px solid #fdcb6e', boxShadow: '0 10px 25px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#2d3436', fontSize: '20px' }}>✨ Makeup Credits</h3>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '15px', backgroundColor: '#fff3cd', color: '#d35400', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', fontWeight: 'bold' }}>
                {subSummary.makeupCount}
              </div>
              <div>
                <p style={{ margin: '0 0 5px 0', color: '#636e72', fontWeight: 'bold' }}>Available to Schedule</p>
                <p style={{ margin: 0, fontSize: '13px', color: '#b2bec3' }}>Credits remain valid for 90 days from the missed class.</p>
              </div>
            </div>
            
            {subSummary.makeupCount > 0 && (
              <div style={{ borderTop: '1px solid #f1f2f6', paddingTop: '15px' }}>
                <p style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 'bold', color: '#636e72', textTransform: 'uppercase' }}>Expiring Soon:</p>
                <ul style={{ listStyleType: 'none', padding: 0, margin: 0, fontSize: '14px' }}>
                  {subSummary.activeMakeups.slice(0, 2).map((makeup, i) => (
                    <li key={i} style={{ marginBottom: '8px', color: '#d63031', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#d63031', display: 'inline-block' }}></span>
                      Expires {new Date(makeup.expirationDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <h2>🗓️ Your Schedule</h2>
      
      <button onClick={() => navigate('/progress')} style={{ marginBottom: '20px', backgroundColor: '#0984e3', color: 'white', padding: '12px 25px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(9, 132, 227, 0.2)' }}>
        📈 View Progress Reports
      </button>

      <div style={{ display: 'grid', gap: '20px' }}>
        {classes.length === 0 ? (
           <p style={{ fontStyle: 'italic', color: 'gray' }}>No upcoming classes found on your calendar.</p>
        ) : (
          classes.filter(cls => cls.status !== 'completed').map((cls) => {
            const isLive = isClassLive(cls.startTime);
            const classIdentifier = cls._id || cls.id;

            return (
              <div key={classIdentifier} className="card" style={{ borderLeft: '5px solid #0984e3', borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.03)' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#2d3436' }}>📚 {cls.title || cls.subject}</h3>
                <p style={{ margin: '0 0 15px 0', color: '#636e72' }}><strong>⏰ Time:</strong> {new Date(cls.startTime).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {(cls.zoomLink || cls.meetingLink) ? (
                    <button 
                      className={isLive ? "btn-blue" : "btn-disabled"}
                      disabled={!isLive}
                      style={{ padding: '10px 20px', backgroundColor: isLive ? '#00b894' : '#b2bec3', cursor: isLive ? 'pointer' : 'not-allowed', border: 'none', color: 'white', borderRadius: '6px', fontWeight: 'bold' }}
                      onClick={() => {
                        if (isLive) {
                          handleJoinClassClick(cls);
                          window.open(cls.zoomLink || cls.meetingLink, '_blank');
                        }
                      }}
                    >
                      🎥 {isLive ? "Join Class" : "Locked (Not Class Time)"}
                    </button>
                  ) : (
                    <span style={{ color: 'grey', fontStyle: 'italic', fontSize: '14px' }}>No meeting link.</span>
                  )}

                  {user?.role?.toLowerCase() === 'teacher' && (
                    <>
                      <button onClick={() => handleAttendance(cls, 'Late')} style={{ backgroundColor: '#fdcb6e', color: 'black', padding: '10px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>🏃‍♂️ Late</button>
                      <button onClick={() => handleAttendance(cls, 'Absent')} style={{ backgroundColor: '#636e72', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>❌ Absent</button>
                      <button onClick={() => { setCurrentClassId(classIdentifier); setIsModalOpen(true); }} style={{ backgroundColor: '#d63031', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>🛑 End Class</button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* END CLASS MODAL (Unchanged functionality, slightly refined CSS) */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '15px', width: '450px', color: '#2d3436' }}>
            <h2 style={{ margin: '0 0 20px 0' }}>🛑 End Class</h2>
            
            <label style={{ fontWeight: 'bold' }}>Class Notes:</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Write a brief summary of today's class..." style={{ width: '100%', height: '80px', margin: '10px 0', padding: '10px', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid #dfe6e9' }} />

            <div style={{ marginTop: '20px', padding: '15px', background: '#f5f6fa', borderRadius: '10px', border: '1px solid #dfe6e9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 'bold', color: '#2d3436' }}>Step 2: Assign Homework</span>
                <button type="button" onClick={() => window.open(selectedClass?.classroomLink || 'https://classroom.google.com', '_blank')} style={{ background: '#fdcb6e', color: '#2d3436', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>📚 Open Classroom</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '15px' }}>
                <input type="checkbox" id="hwCheck" checked={classroomChecked} onChange={(e) => setClassroomChecked(e.target.checked)} style={{ transform: 'scale(1.2)', cursor: 'pointer' }} />
                <label htmlFor="hwCheck" style={{ cursor: 'pointer', fontSize: '14px', color: '#636e72' }}>☑ I confirm I have checked/uploaded the homework.</label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '25px' }}>
              <button onClick={() => setIsModalOpen(false)} disabled={isSubmitting} style={{ padding: '10px 15px', cursor: isSubmitting ? 'not-allowed' : 'pointer', border: '1px solid #b2bec3', borderRadius: '6px', backgroundColor: 'transparent', fontWeight: 'bold', color: '#636e72' }}>Cancel</button>
              <button disabled={isSubmitting} style={{ padding: '10px 15px', cursor: isSubmitting ? 'not-allowed' : 'pointer', backgroundColor: isSubmitting ? '#b2bec3' : '#00b894', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }} onClick={handleEndClass}>
                {isSubmitting ? 'Ending Class...' : 'Submit & End Class'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;