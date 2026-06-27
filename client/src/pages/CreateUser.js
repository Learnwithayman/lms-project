import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function CreateUser() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student'); 
  const [whatsappNumber, setWhatsappNumber] = useState(''); 
  
  // --- SEPARATED STATE FIELDS ---
  const [teacherGroupId, setTeacherGroupId] = useState(''); 
  const [studentGroupId, setStudentGroupId] = useState(''); 
  const [hourlyRate, setHourlyRate] = useState(''); 
  const [currency, setCurrency] = useState('USD'); // <--- NEW CURRENCY STATE
  
  const navigate = useNavigate();

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const config = {
        headers: { Authorization: `Bearer ${token}` },
      };

      await axios.post('http://localhost:5000/api/users', {
        name,
        email,
        password,
        role,
        whatsappNumber, 
        teacherGroupId: role === 'teacher' ? teacherGroupId : '',
        studentGroupId: role === 'student' ? studentGroupId : '',
        hourlyRate: role === 'teacher' ? Number(hourlyRate) : 3.0,
        currency: role === 'teacher' ? currency : 'USD' // <--- SENDING TO BACKEND
      }, config);

      alert('User Created Successfully! 🎉');
      navigate('/admin'); 

    } catch (error) {
      console.error(error);
      alert('Failed to create user. Email might be taken.');
    }
  };

  return (
    <div style={{ padding: '50px' }}>
      <button onClick={() => navigate('/admin')} style={{ marginBottom: '20px' }}>⬅ Back</button>
      <h1>👤 Create New User</h1>
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', width: '320px', gap: '10px' }}>
        
        <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} required style={{ padding: '10px' }} />
        <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: '10px' }} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ padding: '10px' }} />
        
        <input 
          type="text" 
          placeholder="WhatsApp No. (e.g. 201xxxxxxxxx)" 
          value={whatsappNumber} 
          onChange={(e) => setWhatsappNumber(e.target.value)} 
          style={{ padding: '10px' }}
        />

        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ padding: '10px', fontWeight: 'bold' }}>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
        </select>

        {/* 🎓 DYNAMIC TEACHER FIELDS */}
        {role === 'teacher' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8f9fa', padding: '10px', borderRadius: '5px', borderLeft: '4px solid #f39c12' }}>
            <label style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>Teacher Group ID</label>
            <input 
              type="text" 
              placeholder="e.g. 12036... (from terminal)" 
              value={teacherGroupId} 
              onChange={(e) => setTeacherGroupId(e.target.value)} 
              style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            
            {/* NEW RATE AND CURRENCY ROW */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>Hourly Rate</label>
                <input 
                  type="number" 
                  step="0.5"
                  placeholder="e.g. 4.5" 
                  value={hourlyRate} 
                  onChange={(e) => setHourlyRate(e.target.value)} 
                  style={{ padding: '10px', width: '100%', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>Currency</label>
                <select 
                  value={currency} 
                  onChange={(e) => setCurrency(e.target.value)} 
                  style={{ padding: '10px', width: '100%', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EGP">EGP (E£)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* 📚 DYNAMIC STUDENT FIELD */}
        {role === 'student' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8f9fa', padding: '10px', borderRadius: '5px', borderLeft: '4px solid #2ecc71' }}>
            <label style={{ fontSize: '12px', color: '#555', fontWeight: 'bold' }}>Student Group ID</label>
            <input 
              type="text" 
              placeholder="e.g. 12036... (from terminal)" 
              value={studentGroupId} 
              onChange={(e) => setStudentGroupId(e.target.value)} 
              style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>
        )}

        <button type="submit" style={{ padding: '10px', background: '#007bff', color: 'white', border: 'none', cursor: 'pointer', marginTop: '10px', borderRadius: '4px', fontWeight: 'bold' }}>
          Create User
        </button>
      </form>
    </div>
  );
}

export default CreateUser;