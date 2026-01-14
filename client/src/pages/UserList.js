import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function UserList() {
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/');

    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get('https://lms-backend-02zs.onrender.com/api/users', config);
      setUsers(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  // --- NEW DELETE LOGIC ---
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      // Call the backend to delete
      await axios.delete(`https://lms-backend-02zs.onrender.com/api/users/${id}`, config);
      
      // Update the screen immediately (remove the user from the list)
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
          {users.map((user) => (
            <tr key={user._id}>
              <td><strong>{user.name}</strong></td>
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
                
                {/* NEW RED DELETE BUTTON */}
                <button 
                  onClick={() => handleDelete(user._id)} 
                  className="role-admin" // Using the 'admin' badge color (Red)
                  style={{ fontSize: '12px', padding: '5px 10px', border: 'none', cursor: 'pointer', color: 'white', borderRadius: '5px' }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default UserList;