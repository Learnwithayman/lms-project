import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      // 1. Send data to backend
      const res = await axios.post('https://lms-backend-02zs.onrender.com/api/users/login', {
        email,
        password,
      });

      // 2. Save Token
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data));

      alert('Login Successful!');

      // 3. SMART REDIRECT (The logic we added)
      if (res.data.role === 'admin') {
        navigate('/admin'); // Admins go here
      } else {
        navigate('/dashboard'); // Teachers/Students go here
      }

    } catch (error) {
      alert('Invalid Email or Password');
      console.error(error);
    }
  };

  return (
    <div style={{ padding: '50px' }}>
      <h1>Login to LMS</h1>
      <form onSubmit={handleLogin}>
        <div>
          <input
            type="email"
            placeholder="Enter Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ padding: '10px', margin: '10px 0', width: '200px' }}
          />
        </div>
        <div>
          <input
            type="password"
            placeholder="Enter Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ padding: '10px', margin: '10px 0', width: '200px' }}
          />
        </div>
        <button type="submit" style={{ padding: '10px 20px', cursor: 'pointer' }}>
          Login
        </button>
      </form>
    </div>
  );
}

export default Login;