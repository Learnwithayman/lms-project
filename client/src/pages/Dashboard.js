import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

// 🌐 LIVE PRODUCTION URL CONFIGURATION 
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function Dashboard() {
  const [classes, setClasses] = useState([]);
  const [user, setUser] = useState({});
  const [earnings, setEarnings] = useState(null); 
  const navigate = useNavigate();
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentClassId, setCurrentClassId] = useState(null);
  const [notes, setNotes] = useState('');
  const [homework, setHomework] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token) return navigate('/');

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    
    fetchClasses(token, parsedUser);

    if (parsedUser?.role?.toLowerCase() === 'teacher') {
      fetchEarnings(token);
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

  const handleEndClass = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      const targetClass = classes.find(c => (c.id === currentClassId || c._id === currentClassId));

      await axios.put(`${API_URL}/api/schedule/end`, {
        classId: currentClassId,
        notes: notes,
        homework: homework,
        studentGroupId: targetClass?.studentGroupId,
        title: targetClass?.title,
        startTime: targetClass?.startTime
      }, config);

      setIsModalOpen(false);
      setNotes('');
      setHomework('');
      
      fetchClasses(token, user);
      fetchEarnings(token);

      alert('✅ Class ended successfully and hours logged!');
    } catch (error) {
      console.error('Error ending class:', error);
      alert('Failed to end class. Check console for details.');
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

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>👋 Welcome, {user.name}</h1>
        <button onClick={handleLogout} className="logout-btn">Logout</button>
      </div>

      {user?.role?.toLowerCase() === 'teacher' && earnings && (
        <div style={{
          backgroundColor: '#d4edda', color: '#155724', padding: '20px',
          borderRadius: '8px', marginBottom: '20px', border: '1px solid #c3e6cb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
        }}>
          <div>
            <h2 style={{ margin: '0 0 5px 0' }}>💰 Current Month Earnings</h2>
            <p style={{ margin: 0 }}>
              You have taught <strong>{earnings.totalHours} hours</strong> this month at <strong>${earnings.hourlyRate}/hr</strong>.
            </p>
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold' }}>
            ${earnings.currentEarnings}
          </div>
        </div>
      )}

      <h2>📅 Your Schedule</h2>
      
      <button 
        onClick={() => navigate('/progress')} 
        style={{ 
          marginBottom: '20px', backgroundColor: '#17a2b8', color: 'white', 
          padding: '10px 20px', border: 'none', borderRadius: '4px', 
          cursor: 'pointer', fontWeight: 'bold'
        }}
      >
        📈 View Progress Hub
      </button>

      <div style={{ display: 'grid', gap: '20px' }}>
        {classes.length === 0 ? (
           <p style={{ fontStyle: 'italic', color: 'gray' }}>No upcoming classes found on your calendar.</p>
        ) : (
          classes.filter(cls => cls.status !== 'completed').map((cls) => {
            const isLive = isClassLive(cls.startTime);
            const classIdentifier = cls._id || cls.id;

            return (
              <div key={classIdentifier} className="card" style={{ borderLeft: '5px solid #3498db' }}>
                <h3>📚 {cls.title || cls.subject}</h3>
                <p><strong>⏰ Time:</strong> {new Date(cls.startTime).toLocaleString()}</p>
                
                <div style={{ display: 'flex', alignItems: 'center', marginTop: '10px', gap: '10px', flexWrap: 'wrap' }}>
                  
                  {(cls.zoomLink || cls.meetingLink) ? (
                    <a 
                      href={isLive ? (cls.zoomLink || cls.meetingLink) : undefined} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{ textDecoration: 'none', pointerEvents: isLive ? 'auto' : 'none' }}
                    >
                      <button 
                        className={isLive ? "btn-blue" : "btn-disabled"}
                        disabled={!isLive}
                        style={{ 
                          padding: '10px 20px', 
                          backgroundColor: isLive ? '#3498db' : '#bdc3c7',
                          cursor: isLive ? 'pointer' : 'not-allowed'
                        }}
                      >
                        🎥 {isLive ? "Join Class" : "Locked (Not Class Time)"}
                      </button>
                    </a>
                  ) : (
                    <span style={{ color: 'grey', fontStyle: 'italic', fontSize: '14px' }}>No meeting link.</span>
                  )}

                  {user?.role?.toLowerCase() === 'teacher' && (
                    <>
                      <button 
                        onClick={() => handleAttendance(cls, 'Late')}
                        style={{ backgroundColor: '#ffc107', color: 'black', padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        🏃‍♂️ Late
                      </button>

                      <button 
                        onClick={() => handleAttendance(cls, 'Absent')}
                        style={{ backgroundColor: '#6c757d', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        ❌ Absent
                      </button>

                      <button 
                        onClick={() => {
                          setCurrentClassId(classIdentifier); 
                          setIsModalOpen(true);       
                        }}
                        style={{ backgroundColor: '#dc3545', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        🛑 End Class
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* THE END CLASS POPUP MODAL */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '400px', color: 'black' }}>
            <h2 style={{ marginTop: 0 }}>🛑 End Class</h2>
            
            <label style={{ fontWeight: 'bold' }}>Class Notes:</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What Surahs or Tajweed rules did you cover today?"
              style={{ width: '100%', height: '80px', margin: '10px 0', padding: '10px' }}
            />

            <label style={{ fontWeight: 'bold' }}>Homework Assigned:</label>
            <textarea
              value={homework}
              onChange={(e) => setHomework(e.target.value)}
              placeholder="What should the student practice?"
              style={{ width: '100%', height: '60px', margin: '10px 0', padding: '10px' }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px' }}>
              <button 
                onClick={() => setIsModalOpen(false)} 
                style={{ padding: '10px 15px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#f8f9fa' }}
              >
                Cancel
              </button>
              <button 
                className="btn-green" 
                style={{ padding: '10px 15px', cursor: 'pointer', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}
                onClick={handleEndClass} 
              >
                Submit & End Class
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Dashboard;