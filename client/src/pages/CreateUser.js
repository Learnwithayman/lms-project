import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function CreateUser() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student'); // Default to student
  const navigate = useNavigate();

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      // 1. Get the Admin Token (Only admins can do this!)
      const token = localStorage.getItem('token');
      const config = {
        headers: { Authorization: `Bearer ${token}` },
      };

      // 2. Send data to backend
      await axios.post('https://lms-backend-02zs.onrender.com/api/users', {
        name,
        email,
        password,
        role,
      }, config);

      alert('User Created Successfully! 🎉');
      navigate('/admin'); // Go back to dashboard

    } catch (error) {
      console.error(error);
      alert('Failed to create user. Email might be taken.');
    }
  };

  return (
    <div style={{ padding: '50px' }}>
      <button onClick={() => navigate('/admin')} style={{ marginBottom: '20px' }}>⬅ Back</button>
      <h1>👤 Create New User</h1>
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', width: '300px', gap: '10px' }}>
        
        <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} required padding="10px" />
        <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        
        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ padding: '10px' }}>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
        </select>

        <button type="submit" style={{ padding: '10px', background: '#007bff', color: 'white', border: 'none', cursor: 'pointer' }}>
          Create User
        </button>
      </form>
    </div>
  );
}

export default CreateUser;