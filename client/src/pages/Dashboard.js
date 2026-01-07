import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function Dashboard() {
  const [classes, setClasses] = useState([]);
  const [user, setUser] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token) return navigate('/');

    setUser(JSON.parse(userData));
    fetchClasses(token);
  }, [navigate]);

  const fetchClasses = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get('http://localhost:5000/api/schedule/my-classes', config);
      setClasses(res.data);
    } catch (error) {
      console.error(error);
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

      <h2>📅 Your Schedule</h2>

      {classes.length === 0 ? (
        <p>No classes scheduled yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          {classes.map((cls) => (
            <div key={cls._id} className="card" style={{ borderLeft: '5px solid #3498db' }}>
              <h3>📚 Subject: {cls.subject}</h3>
              <p><strong>⏰ Time:</strong> {new Date(cls.startTime).toLocaleString()}</p>
              <p><strong>⏳ Duration:</strong> {cls.durationMinutes} minutes</p>
              
              {/* JOIN BUTTON LOGIC: Only shows if a link exists */}
              {cls.meetingLink ? (
                <a 
                  href={cls.meetingLink} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <button 
                    className="btn-blue" 
                    style={{ marginTop: '10px', padding: '10px 20px' }}
                  >
                    🎥 Join Class
                  </button>
                </a>
              ) : (
                <p style={{ color: 'grey', fontStyle: 'italic', fontSize: '14px' }}>
                  No meeting link provided.
                </p>
              )}

            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Dashboard;