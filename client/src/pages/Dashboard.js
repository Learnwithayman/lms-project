import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function Dashboard() {
  const [classes, setClasses] = useState([]);
  const [user, setUser] = useState({});
  const [earnings, setEarnings] = useState(null); // <--- NEW STATE FOR WALLET
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
    fetchClasses(token);

    // NEW: If the user is a teacher, go fetch their paycheck data!
    if (parsedUser?.role?.toLowerCase() === 'teacher') {
      fetchEarnings(token);
    }
  }, [navigate]);

  const fetchClasses = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get('https://lms-backend-02zs.onrender.com/api/schedule/my-classes', config);
      setClasses(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  // NEW FUNCTION: Fetch the payroll calculation from the backend
  const fetchEarnings = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get('https://lms-backend-02zs.onrender.com/api/schedule/earnings', config);
      setEarnings(res.data);
    } catch (error) {
      console.error("Failed to fetch earnings:", error);
    }
  };

  const handleEndClass = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      await axios.put('https://lms-backend-02zs.onrender.com/api/schedule/end', {
        classId: currentClassId,
        notes: notes,
        homework: homework
      }, config);

      // Close the popup and clear the text boxes
      setIsModalOpen(false);
      setNotes('');
      setHomework('');

      // Refresh the schedule so the completed class disappears
      fetchClasses(token);

      // NEW: Refresh the Wallet so the teacher immediately sees their money go up!
      if (user?.role?.toLowerCase() === 'teacher') {
        fetchEarnings(token);
      }

    } catch (error) {
      console.error('Error ending class:', error);
      alert('Failed to end class. Check console for details.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>👋 Welcome, {user.name}</h1>
        <button onClick={handleLogout} className="logout-btn">Logout</button>
      </div>

      {/* THE NEW TEACHER WALLET UI */}
      {user?.role?.toLowerCase() === 'teacher' && earnings && (
        <div style={{
          backgroundColor: '#d4edda',
          color: '#155724',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #c3e6cb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
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
      
      {/* Button to navigate to Progress Hub */}
      <button 
        onClick={() => navigate('/progress')} 
        style={{ 
          marginBottom: '20px', 
          backgroundColor: '#17a2b8', 
          color: 'white', 
          padding: '10px 20px', 
          border: 'none', 
          borderRadius: '4px', 
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        📈 View Progress Hub
      </button>

      <div style={{ display: 'grid', gap: '20px' }}>
        {/* The filter right here hides 'completed' classes! */}
        {classes.filter(cls => cls.status !== 'completed').map((cls) => (
          <div key={cls._id} className="card" style={{ borderLeft: '5px solid #3498db' }}>
            <h3>📚 Subject: {cls.subject}</h3>
            <p><strong>⏰ Time:</strong> {new Date(cls.startTime).toLocaleString()}</p>
            <p><strong>⏳ Duration:</strong> {cls.durationMinutes} minutes</p>

            {/* JOIN BUTTON LOGIC: Only shows if a link exists */}
            {cls.meetingLink ? (
              <div style={{ display: 'flex', alignItems: 'center', marginTop: '10px' }}>
                <a
                  href={cls.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <button
                    className="btn-blue"
                    style={{ padding: '10px 20px' }}
                  >
                    🎥 Join Class
                  </button>
                </a>

                {/* The End Class Button */}
                {user?.role?.toLowerCase() === 'teacher' && (
                  <button 
                    onClick={() => {
                      setCurrentClassId(cls._id); 
                      setIsModalOpen(true);       
                    }}
                    style={{ 
                      marginLeft: '10px', 
                      backgroundColor: '#dc3545', 
                      color: 'white', 
                      padding: '10px 15px', 
                      border: 'none', 
                      borderRadius: '4px', 
                      cursor: 'pointer' 
                    }}
                  >
                    🛑 End Class
                  </button>
                )}
              </div>
            ) : (
              <p style={{ color: 'grey', fontStyle: 'italic', fontSize: '14px' }}>
                No meeting link provided.
              </p>
            )}
          </div>
        ))}
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