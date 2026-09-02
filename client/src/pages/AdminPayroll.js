import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

// 🌐 LIVE PRODUCTION URL CONFIGURATION 
const API_URL = process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com';

function AdminPayroll() {
  const [payrollData, setPayrollData] = useState([]);
  const [isLoading, setIsLoading] = useState(true); 
  const [user, setUser] = useState({});
  const navigate = useNavigate();

  // ✨ NEW: Month and Year States (Defaults to Current Month/Year)
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1); // 1 = Jan, 8 = Aug, 9 = Sep
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  // Modal State for Bonuses/Deductions
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState(null);
  const [selectedTeacherName, setSelectedTeacherName] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token) return navigate('/');
    
    const parsedUser = JSON.parse(userData);
    if (parsedUser?.role?.toLowerCase() !== 'admin') {
      return navigate('/dashboard');
    }

    setUser(parsedUser);
    fetchPayroll(token, selectedMonth, selectedYear);
  }, [navigate, selectedMonth, selectedYear]); // 👈 Re-fetches when month/year changes!

  const fetchPayroll = async (token, month, year) => {
    setIsLoading(true);
    try {
      // ✨ NEW: Passing the selected month and year to the backend
      const config = { 
        headers: { Authorization: `Bearer ${token}` },
        params: { month, year } 
      };
      const res = await axios.get(`${API_URL}/api/schedule/payroll-report`, config);
      
      console.log(`📊 Payroll Data for ${month}/${year}:`, res.data);
      setPayrollData(res.data);
    } catch (error) {
      console.error("Failed to fetch payroll:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddAdjustment = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      await axios.post(`${API_URL}/api/schedule/payroll-adjustment`, {
        teacherId: selectedTeacherId,
        amount: amount, 
        reason: reason
      }, config);

      setIsModalOpen(false);
      setAmount('');
      setReason('');
      fetchPayroll(token, selectedMonth, selectedYear);

    } catch (error) {
      console.error("Failed to add adjustment:", error);
      alert('Failed to add adjustment. Check console.');
    }
  };

  // Array of months for the dropdown
  const months = [
    { name: 'January', value: 1 }, { name: 'February', value: 2 }, 
    { name: 'March', value: 3 }, { name: 'April', value: 4 }, 
    { name: 'May', value: 5 }, { name: 'June', value: 6 }, 
    { name: 'July', value: 7 }, { name: 'August', value: 8 }, 
    { name: 'September', value: 9 }, { name: 'October', value: 10 }, 
    { name: 'November', value: 11 }, { name: 'December', value: 12 }
  ];

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>💼 Admin Payroll Center</h1>
        <button onClick={() => navigate('/admin')} className="btn-blue" style={{ padding: '8px 15px' }}>
          ⬅ Back to Dashboard
        </button>
      </div>

      {/* ✨ NEW: The Time Machine UI */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', marginTop: '20px' }}>
        <h2 style={{ margin: 0, color: '#2c3e50' }}>Payroll Overview</h2>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc', fontWeight: 'bold' }}
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.name}</option>
            ))}
          </select>

          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={{ padding: '10px', borderRadius: '5px', border: '1px solid #ccc', fontWeight: 'bold' }}
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
            <option value={2024}>2024</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '20px', marginTop: '20px' }}>
        {isLoading ? (
          <p style={{ color: '#007bff', fontWeight: 'bold' }}>⏳ Calculating Payroll Data for Selected Month...</p>
        ) : payrollData.length === 0 ? (
          <p style={{ color: 'grey', fontStyle: 'italic' }}>No payroll data found for this specific month.</p>
        ) : (
          payrollData.map((teacher) => (
            <div key={teacher.teacherId} className="card" style={{ borderLeft: '5px solid #6f42c1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>🧑‍🏫 {teacher.name}</h3>
                <p style={{ margin: '5px 0' }}><strong>Email:</strong> {teacher.email}</p>
                <p style={{ margin: '5px 0' }}><strong>Hours Taught:</strong> {teacher.totalHours} hrs (@ ${teacher.hourlyRate}/hr)</p>
                <p style={{ margin: '5px 0' }}><strong>Base Earnings:</strong> ${teacher.baseEarnings}</p>
                <p style={{ margin: '5px 0', color: teacher.adjustmentsTotal >= 0 ? '#28a745' : '#dc3545' }}>
                  <strong>Adjustments (Bonuses/Deductions):</strong> ${teacher.adjustmentsTotal}
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#155724', marginBottom: '15px' }}>
                  Total: ${teacher.finalEarnings}
                </div>
                <button 
                  onClick={() => {
                    setSelectedTeacherId(teacher.teacherId);
                    setSelectedTeacherName(teacher.name);
                    setIsModalOpen(true);
                  }}
                  style={{ backgroundColor: '#ffc107', color: '#333', padding: '10px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ➕ Add Bonus/Deduction
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* THE BONUS/DEDUCTION MODAL */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '400px', color: 'black' }}>
            <h2 style={{ marginTop: 0 }}>Adjust Pay for {selectedTeacherName}</h2>
            
            <label style={{ fontWeight: 'bold' }}>Amount ($):</label>
            <p style={{ fontSize: '12px', color: 'grey', margin: '5px 0' }}>Use a negative number for deductions (e.g., -10)</p>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 50 or -15"
              style={{ width: '100%', padding: '10px', margin: '5px 0 15px 0', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />

            <label style={{ fontWeight: 'bold' }}>Reason:</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Excellent performance"
              style={{ width: '100%', padding: '10px', margin: '5px 0 15px 0', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px' }}>
              <button 
                onClick={() => setIsModalOpen(false)} 
                style={{ padding: '10px 15px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#f8f9fa' }}
              >
                Cancel
              </button>
              <button 
                className="btn-green" 
                style={{ padding: '10px 15px', cursor: 'pointer', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}
                onClick={handleAddAdjustment} 
              >
                Apply Adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPayroll;