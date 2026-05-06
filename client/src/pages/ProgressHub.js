import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function ProgressHub() {
  const navigate = useNavigate();
  const [pastClasses, setPastClasses] = useState([]);

  useEffect(() => {
    const fetchPastClasses = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return navigate('/');

        const config = { headers: { Authorization: `Bearer ${token}` } };
        
        const res = await axios.get('https://lms-backend-02zs.onrender.com/api/schedule/completed', config);
        setPastClasses(res.data);
      } catch (error) {
        console.error("Failed to fetch past classes:", error);
      }
    };

    fetchPastClasses();
  }, [navigate]);

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>📈 Progress Hub</h1>
        <button onClick={() => navigate('/dashboard')} className="btn-blue" style={{ padding: '8px 15px' }}>
          ⬅ Back to Schedule
        </button>
      </div>

      <h2>Your Completed Classes</h2>
      
      <div style={{ display: 'grid', gap: '20px', marginTop: '20px' }}>
        {/* If there are no classes, show this friendly message */}
        {pastClasses.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'grey' }}>
            <p>No completed classes found yet (or waiting for backend update!).</p>
          </div>
        ) : (
          /* If there ARE classes, build a beautiful card for each one */
          pastClasses.map((cls) => (
            <div key={cls._id} className="card" style={{ borderLeft: '5px solid #28a745' }}>
              <h3>✅ Subject: {cls.subject}</h3>
              <p><strong>📅 Date:</strong> {new Date(cls.startTime).toLocaleDateString()}</p>
              
              <hr style={{ margin: '15px 0', border: '0', borderTop: '1px solid #eee' }} />
              
              <div style={{ backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '5px', marginBottom: '10px' }}>
                <p style={{ margin: '0 0 5px 0' }}><strong>📝 Teacher's Notes:</strong></p>
                <p style={{ margin: 0, color: '#555' }}>{cls.notes || 'No notes provided.'}</p>
              </div>

              <div style={{ backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '5px' }}>
                <p style={{ margin: '0 0 5px 0' }}><strong>📚 Homework Assigned:</strong></p>
                <p style={{ margin: 0, color: '#555' }}>{cls.homework || 'No homework assigned.'}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ProgressHub;