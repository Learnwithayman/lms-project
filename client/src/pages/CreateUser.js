import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function CreateUser() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student'); 
  const [whatsappNumber, setWhatsappNumber] = useState(''); 
  const [whatsappGroupId, setWhatsappGroupId] = useState(''); // <--- NEW STATE FOR GROUP ID
  const navigate = useNavigate();

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const config = {
        headers: { Authorization: `Bearer ${token}` },
      };

      // Pointing to your local server for testing!
      await axios.post('http://localhost:5000/api/users', {
        name,
        email,
        password,
        role,
        whatsappNumber, 
        whatsappGroupId // <--- SENDING THE GROUP ID TO THE DATABASE
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
      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', width: '300px', gap: '10px' }}>
        
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

        {/* NEW WHATSAPP GROUP ID INPUT */}
        <input 
          type="text" 
          placeholder="WhatsApp Group ID (e.g. 12036...)" 
          value={whatsappGroupId} 
          onChange={(e) => setWhatsappGroupId(e.target.value)} 
          style={{ padding: '10px', border: '2px solid #2ecc71', borderRadius: '4px' }}
        />
        <small style={{ color: 'gray', marginTop: '-5px', marginBottom: '5px' }}>
          *Find this ID in your backend terminal when the bot connects.
        </small>
        
        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ padding: '10px' }}>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
        </select>

        <button type="submit" style={{ padding: '10px', background: '#007bff', color: 'white', border: 'none', cursor: 'pointer', marginTop: '10px', borderRadius: '4px' }}>
          Create User
        </button>
      </form>
    </div>
  );
}

export default CreateUser;