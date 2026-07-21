import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

// 🌐 LIVE PRODUCTION URL CONFIGURATION 
const API_URL = process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com';

function UserList() {
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  // ✨ NEW: Wallet Modal States
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [makeupDate, setMakeupDate] = useState('');
  const [makeupReason, setMakeupReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/');

    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/users`, config);
      setUsers(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      await axios.delete(`${API_URL}/api/users/${id}`, config);
      
      setUsers(users.filter((user) => user._id !== id));
      alert('User Deleted Successfully');
    } catch (error) {
      alert('Failed to delete user');
    }
  };

  const copyToClipboard = (id) => {
    navigator.clipboard.writeText(id);
    alert('ID Copied!');
  };

  // 🎒 NEW: Handle Granting a Makeup Credit
  const handleGrantMakeup = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      await axios.post(`${API_URL}/api/schedule/makeup`, {
        studentId: selectedStudent._id,
        originalDate: makeupDate,
        reason: makeupReason
      }, config);
      
      alert('✅ Makeup credit granted successfully! Valid for 90 days.');
      
      // Close modal and refresh the list to show the new makeup balance
      setIsWalletOpen(false);
      setMakeupDate('');
      setMakeupReason('');
      fetchUsers(); 
    } catch (error) {
      console.error(error);
      alert('❌ Failed to grant makeup credit.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Wallet Modal Helper
  const openWallet = (student) => {
    setSelectedStudent(student);
    setIsWalletOpen(true);
  };

  return (
    <div className="dashboard-container">
      <button onClick={() => navigate('/admin')} className="btn-grey" style={{ padding: '8px 15px', marginBottom: '20px' }}>
        ⬅ Back to Dashboard
      </button>
      <h1>📋 All Users Database</h1>
      
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Email</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            
            // Calculate active makeups (not used and not expired)
            const activeMakeups = user.makeupBank ? user.makeupBank.filter(m => !m.isUsed && new Date(m.expirationDate) > new Date()).length : 0;
            
            return (
            <tr key={user._id}>
              <td>
                <strong>{user.name}</strong>
                {user.role === 'student' && activeMakeups > 0 && (
                  <span style={{ marginLeft: '10px', backgroundColor: '#2ecc71', color: 'white', padding: '2px 6px', borderRadius: '10px', fontSize: '11px' }}>
                    {activeMakeups} Makeups
                  </span>
                )}
              </td>
              <td>
                 <span className={`badge role-${user.role}`}>
                   {user.role}
                 </span>
              </td>
              <td>{user.email}</td>
              <td style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => copyToClipboard(user._id)} className="btn-grey" style={{ fontSize: '12px', padding: '5px 10px' }}>
                  Copy ID
                </button>
                
                {/* ✨ NEW WALLET BUTTON FOR STUDENTS */}
                {user.role === 'student' && (
                  <button 
                    onClick={() => openWallet(user)} 
                    style={{ fontSize: '12px', padding: '5px 10px', backgroundColor: '#f39c12', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                  >
                    💳 Wallet
                  </button>
                )}

                <button 
                  onClick={() => handleDelete(user._id)} 
                  className="role-admin" 
                  style={{ fontSize: '12px', padding: '5px 10px', border: 'none', cursor: 'pointer', color: 'white', borderRadius: '5px' }}
                >
                  Delete
                </button>
              </td>
            </tr>
          )})}
        </tbody>
      </table>

      {/* ========================================== */}
      {/* 🎒 STUDENT WALLET MODAL */}
      {/* ========================================== */}
      {isWalletOpen && selectedStudent && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '500px', color: 'black' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>💳 {selectedStudent.name}'s Wallet</h2>
              <button onClick={() => setIsWalletOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            </div>

            {/* SUBSCRIPTION OVERVIEW */}
            <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
              <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #ddd' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#555' }}>Subscription</h4>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: selectedStudent.subscription?.status === 'active' ? '#2ecc71' : '#e74c3c' }}>
                  {selectedStudent.subscription?.status ? selectedStudent.subscription.status.toUpperCase() : 'NONE'}
                </div>
                <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>
                  {selectedStudent.subscription?.classesUsed || 0} / {selectedStudent.subscription?.totalClassesBought || 0} Classes Used
                </p>
              </div>

              <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #ddd' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#555' }}>Makeup Bank</h4>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f39c12' }}>
                  {selectedStudent.makeupBank ? selectedStudent.makeupBank.filter(m => !m.isUsed && new Date(m.expirationDate) > new Date()).length : 0}
                </div>
                <p style={{ margin: '5px 0 0 0', fontSize: '14px' }}>Available (90-Day)</p>
              </div>
            </div>

            {/* GRANT MAKEUP CREDIT FORM */}
            <div style={{ backgroundColor: '#eef2f5', padding: '20px', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>➕ Grant Makeup Credit</h3>
              <form onSubmit={handleGrantMakeup}>
                
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Original Missed Date:</label>
                <input 
                  type="date" 
                  required
                  value={makeupDate}
                  onChange={(e) => setMakeupDate(e.target.value)}
                  style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                />

                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Reason (Optional):</label>
                <input 
                  type="text" 
                  placeholder="e.g., Teacher canceled, Medical emergency"
                  value={makeupReason}
                  onChange={(e) => setMakeupReason(e.target.value)}
                  style={{ width: '100%', padding: '10px', marginBottom: '20px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                />

                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  style={{ width: '100%', padding: '12px', backgroundColor: isSubmitting ? '#95a5a6' : '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                >
                  {isSubmitting ? 'Granting...' : 'Grant 90-Day Credit'}
                </button>
              </form>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default UserList;