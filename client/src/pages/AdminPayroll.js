import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function AdminPayroll() {
  const [payrollData, setPayrollData] = useState([]);
  const [user, setUser] = useState({});
  const navigate = useNavigate();

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
    // Security check: Kick out anyone who isn't the admin!
    if (parsedUser?.role?.toLowerCase() !== 'admin') {
      return navigate('/dashboard');
    }

    setUser(parsedUser);
    fetchPayroll(token);
  }, [navigate]);

  const fetchPayroll = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get('https://lms-backend-02zs.onrender.com/api/schedule/payroll-report', config);
      setPayrollData(res.data);
    } catch (error) {
      console.error("Failed to fetch payroll:", error);
    }
  };

  const handleAddAdjustment = async () => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      await axios.post('https://lms-backend-02zs.onrender.com/api/schedule/payroll-adjustment', {
        teacherId: selectedTeacherId,
        amount: amount, 
        reason: reason
      }, config);

      // Close the popup and clear the form
      setIsModalOpen(false);
      setAmount('');
      setReason('');

      // Refresh the report to instantly show the new math!
      fetchPayroll(token);

    } catch (error) {
      console.error("Failed to add adjustment:", error);
      alert('Failed to add adjustment. Check console.');
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>💼 Admin Payroll Center</h1>
        <button onClick={() => navigate('/dashboard')} className="btn-blue" style={{ padding: '8px 15px' }}>
          ⬅ Back to Dashboard
        </button>
      </div>

      <h2>Current Month Overview</h2>

      <div style={{ display: 'grid', gap: '20px', marginTop: '20px' }}>
        {payrollData.length === 0 ? (
          <p style={{ color: 'grey' }}>No teachers found or data is loading...</p>
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
              style={{ width: '100%', padding: '10px', margin: '5px 0 15px 0', borderRadius: '4px', border: '1px solid #ccc' }}
            />

            <label style={{ fontWeight: 'bold' }}>Reason:</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Excellent performance"
              style={{ width: '100%', padding: '10px', margin: '5px 0 15px 0', borderRadius: '4px', border: '1px solid #ccc' }}
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