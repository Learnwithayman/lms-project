import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function AdminSchedule() {
  const [classes, setClasses] = useState([]);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const [newTime, setNewTime] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get('http://localhost:5000/api/schedule/all', config);
      setClasses(res.data);
    } catch (error) {
      console.error(error);
      alert('Failed to load classes');
    }
  };

  // 1. Open the Modal
  const openRescheduleModal = (cls) => {
    setSelectedClass(cls);
    setNewTime(''); // Reset the input
    setIsModalOpen(true);
  };

  // 2. Submit the New Time
  const handleConfirmReschedule = async () => {
    if (!newTime) return alert("Please pick a time!");

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const formattedDate = new Date(newTime).toISOString();

      await axios.put(`http://localhost:5000/api/schedule/${selectedClass._id}`, {
        newStartTime: formattedDate
      }, config);

      alert('Class Rescheduled Successfully! 📅');
      setIsModalOpen(false); // Close Modal
      fetchClasses();        // Refresh List
    } catch (error) {
      alert('Failed to reschedule.');
      console.error(error);
    }
  };

  const handleDelete = async (id) => {
    if(!window.confirm("Are you sure you want to delete this class?")) return;
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await axios.delete(`http://localhost:5000/api/schedule/${id}`, config);
      setClasses(classes.filter(c => c._id !== id));
    } catch (error) {
      alert('Error deleting class');
    }
  };

  return (
    <div className="dashboard-container">
      <button onClick={() => navigate('/admin')} className="btn-grey" style={{ marginBottom: '20px' }}>⬅ Back</button>
      <h1>📅 Manage All Classes</h1>
      
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Teacher</th>
            <th>Student</th>
            <th>Time</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((cls) => (
            <tr key={cls._id}>
              <td>{cls.subject}</td>
              <td>{cls.teacher ? cls.teacher.name : 'Unknown'}</td>
              <td>{cls.student ? cls.student.name : 'Unknown'}</td>
              <td>{new Date(cls.startTime).toLocaleString()}</td>
              <td style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => openRescheduleModal(cls)} 
                  className="btn-blue"
                  style={{ padding: '5px 10px', fontSize: '12px' }}
                >
                  🕒 Reschedule
                </button>
                <button 
                  onClick={() => handleDelete(cls._id)} 
                  className="role-admin"
                  style={{ padding: '5px 10px', fontSize: '12px', border:'none' }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* --- THE POP-UP WINDOW (MODAL) --- */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>🕒 Reschedule Class</h2>
            <p>For: <strong>{selectedClass?.subject}</strong></p>
            
            <label style={{ textAlign: 'left', display: 'block', marginBottom: '5px' }}>New Date & Time:</label>
            <input 
              type="datetime-local" 
              value={newTime} 
              onChange={(e) => setNewTime(e.target.value)} 
            />

            <div className="modal-actions">
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="btn-grey" 
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmReschedule} 
                className="btn-blue" 
                style={{ flex: 1 }}
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default AdminSchedule;