import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css'; 

function AdminDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState({});

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
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>🛡️ Admin Control Panel</h1>
        <button onClick={handleLogout} className="logout-btn">Logout</button>
      </div>

      <h2>👋 Welcome, {user.name}</h2>
      <p>Manage users, schedule classes, and organize the school.</p>
      
      {/* Quick Actions */}
      <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
        <button onClick={() => navigate('/users')} className="action-btn btn-grey" style={{width: 'auto', padding: '10px 20px'}}>
          📋 View Users
        </button>
        <button onClick={() => navigate('/all-classes')} className="action-btn btn-grey" style={{width: 'auto', padding: '10px 20px'}}>
          🗓️ Manage Classes
        </button>
      </div>

      <div className="admin-grid">
        {/* Create User Card */}
        <div className="action-card" style={{ borderTopColor: '#3498db' }}>
          <h3>👤 Create New User</h3>
          <p>Register new teachers, students, or admins into the system.</p>
          <button onClick={() => navigate('/create-user')} className="action-btn btn-blue">
            Create User
          </button>
        </div>

        {/* Schedule Class Card */}
        <div className="action-card" style={{ borderTopColor: '#2ecc71' }}>
          <h3>📅 Schedule Class</h3>
          <p>Assign a teacher to a student for a specific subject.</p>
          <button onClick={() => navigate('/schedule-class')} className="action-btn btn-green">
            Schedule Class
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;