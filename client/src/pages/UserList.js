import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

const API_URL = process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com';

function UserList() {
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  // Search & Filter State
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Create User State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'student',
    whatsappNumber: '',
    studentGroupId: '',
    timezone: 'America/New_York' // ✨ Default to Eastern Time
  });

  // Existing Modal States
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [makeupDate, setMakeupDate] = useState('');
  const [makeupReason, setMakeupReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [subStatus, setSubStatus] = useState('none');
  const [subTotal, setSubTotal] = useState(0);
  const [subUsed, setSubUsed] = useState(0); 
  const [subStart, setSubStart] = useState('');
  const [subEnd, setSubEnd] = useState('');
  
  // ✨ PAYPAL BILLING STATES
  const [billingType, setBillingType] = useState('none');
  const [subscriptionId, setSubscriptionId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [recurringSeriesId, setRecurringSeriesId] = useState('');
  
  // ✨ RECURRING SLOTS STATES
  const [recurringSlots, setRecurringSlots] = useState([]);
  const [newSlotDay, setNewSlotDay] = useState('Sunday');
  const [newSlotStart, setNewSlotStart] = useState('');
  const [newSlotEnd, setNewSlotEnd] = useState('');

  const [isSubUpdating, setIsSubUpdating] = useState(false);
  const [isSyncingTZ, setIsSyncingTZ] = useState(false); // ✨ Timezone Sync State

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignStudent, setAssignStudent] = useState(null);
  const [selectedTeachers, setSelectedTeachers] = useState([]); 
  const [isAssigning, setIsAssigning] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [isEditing, setIsEditing] = useState(false);

  // ✨ Common Timezones List
  const commonTimezones = [
    { label: "US Eastern (New York)", value: "America/New_York" },
    { label: "US Central (Chicago)", value: "America/Chicago" },
    { label: "US Mountain (Denver)", value: "America/Denver" },
    { label: "US Pacific (Los Angeles)", value: "America/Los_Angeles" },
    { label: "Canada (Toronto)", value: "America/Toronto" },
    { label: "UK (London)", value: "Europe/London" },
    { label: "Egypt (Cairo)", value: "Africa/Cairo" },
    { label: "Saudi Arabia (Riyadh)", value: "Asia/Riyadh" },
    { label: "UAE (Dubai)", value: "Asia/Dubai" },
    { label: "Australia (Sydney)", value: "Australia/Sydney" }
  ];

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

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setIsCreatingUser(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      await axios.post(`${API_URL}/api/users`, newUser, config);
      alert(`✅ ${newUser.role.toUpperCase()} "${newUser.name}" created successfully!`);
      
      setIsCreateModalOpen(false);
      setNewUser({ name: '', email: '', password: '', role: 'student', whatsappNumber: '', studentGroupId: '', timezone: 'America/New_York' });
      fetchUsers();
    } catch (error) {
      console.error('Error creating user:', error);
      alert(error.response?.data?.message || '❌ Failed to create user.');
    } finally {
      setIsCreatingUser(false);
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

  const handleUpdateSubscription = async (e) => {
    e.preventDefault();
    setIsSubUpdating(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      // Build unified payload with PayPal & Scheduling Info
      const payload = {
        status: subStatus,
        totalClassesBought: subTotal,
        classesUsed: subUsed,
        startDate: subStart,
        endDate: subEnd,
        paypal: {
          billingType,
          subscriptionId,
          invoiceId,
          recurringSeriesId
        },
        recurringSlots
      };

      await axios.put(`${API_URL}/api/users/${selectedStudent._id}/subscription`, payload, config);
      alert('✅ Subscription, Billing & Schedule updated successfully!');
      setIsWalletOpen(false);
      fetchUsers(); 
    } catch (error) {
      console.error(error);
      alert('❌ Failed to update subscription.');
    } finally {
      setIsSubUpdating(false);
    }
  };

  // ⚡ BUTTON 1: Auto-Count Past Classes
  const handleAutoSyncWallet = async () => {
    if (!subEnd) {
      alert('Please select an End Date first so the system knows which period to calculate!');
      return;
    }
    setIsSubUpdating(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const res = await axios.post(`${API_URL}/api/users/${selectedStudent._id}/sync-wallet`, {
        startDate: subStart || new Date().toISOString().split('T')[0],
        endDate: subEnd,
        totalClassesBought: subTotal,
        resetZero: false
      }, config);

      setSubTotal(res.data.subscription.totalClassesBought);
      setSubUsed(res.data.subscription.classesUsed);
      setSubStatus('active');

      alert(res.data.message);
      fetchUsers();
    } catch (error) {
      console.error(error);
      alert('❌ Failed to auto-sync wallet from calendar.');
    } finally {
      setIsSubUpdating(false);
    }
  };

  // 🔄 BUTTON 2: Reset Completed to 0 (All Upcoming)
  const handleResetCompletedToZero = async () => {
    setIsSubUpdating(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const res = await axios.post(`${API_URL}/api/users/${selectedStudent._id}/sync-wallet`, {
        startDate: subStart || new Date().toISOString().split('T')[0],
        endDate: subEnd,
        totalClassesBought: subTotal,
        resetZero: true
      }, config);

      setSubTotal(res.data.subscription.totalClassesBought);
      setSubUsed(0);
      setSubStatus('active');

      alert('✅ Reset Successful! Phase 1 (Classes Completed) is now set to 0.');
      fetchUsers();
    } catch (error) {
      console.error(error);
      alert('❌ Failed to reset completed classes.');
    } finally {
      setIsSubUpdating(false);
    }
  };

  // ✨ BUTTON 3: Sync Timezone to Google Calendar
  const handleSyncTimezone = async () => {
    if (!window.confirm(`Are you sure you want to sync all calendar events for this student to: ${selectedStudent.timezone || 'Africa/Cairo'}?`)) return;
    setIsSyncingTZ(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      await axios.post(`${API_URL}/api/schedule/sync-timezone`, { 
        studentId: selectedStudent._id 
      }, config);
      
      alert('✅ All Google Calendar events successfully anchored to student timezone!');
    } catch (error) {
      console.error(error);
      alert('❌ Failed to sync timezone to Google Calendar.');
    } finally {
      setIsSyncingTZ(false);
    }
  };

  const handleSaveAssignments = async () => {
    setIsAssigning(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await axios.put(`${API_URL}/api/users/${assignStudent._id}/assign`, {
        assignedTeachers: selectedTeachers
      }, config);
      alert(`✅ Teacher(s) linked successfully to ${assignStudent.name}!`);
      setIsAssignModalOpen(false);
      fetchUsers();
    } catch (error) {
      console.error(error);
      alert('❌ Failed to update assigned teachers.');
    } finally {
      setIsAssigning(false);
    }
  };

  const toggleTeacherSelection = (teacherId) => {
    if (selectedTeachers.includes(teacherId)) {
      setSelectedTeachers(selectedTeachers.filter(id => id !== teacherId));
    } else {
      setSelectedTeachers([...selectedTeachers, teacherId]);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setIsEditing(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await axios.put(`${API_URL}/api/users/${editForm._id}`, editForm, config);
      alert(`✅ Profile updated successfully!`);
      setIsEditModalOpen(false);
      fetchUsers();
    } catch (error) {
      console.error(error);
      alert('❌ Failed to update profile.');
    } finally {
      setIsEditing(false);
    }
  };

  const handleAddRecurringSlot = () => {
    if (!newSlotStart || !newSlotEnd) return alert("Please select start and end times");
    setRecurringSlots([...recurringSlots, { dayOfWeek: newSlotDay, startTime: newSlotStart, endTime: newSlotEnd }]);
    setNewSlotStart('');
    setNewSlotEnd('');
  };

  const handleRemoveRecurringSlot = (index) => {
    const updated = [...recurringSlots];
    updated.splice(index, 1);
    setRecurringSlots(updated);
  };

  const openWallet = (student) => {
    setSelectedStudent(student);
    
    // Legacy fields
    setSubStatus(student.subscription?.status || 'none');
    setSubTotal(student.subscription?.totalClassesBought || 0);
    setSubUsed(student.subscription?.classesUsed || 0);
    setSubStart(student.subscription?.startDate ? student.subscription.startDate.split('T')[0] : '');
    setSubEnd(student.subscription?.endDate ? student.subscription.endDate.split('T')[0] : '');
    
    // PayPal fields
    setBillingType(student.paypal?.billingType || 'none');
    setSubscriptionId(student.paypal?.subscriptionId || '');
    setInvoiceId(student.paypal?.invoiceId || '');
    setRecurringSeriesId(student.paypal?.recurringSeriesId || '');
    
    // Scheduling Fields
    setRecurringSlots(student.recurringSlots || []);
    
    setIsWalletOpen(true);
  };

  const openAssignModal = (student) => {
    setAssignStudent(student);
    setSelectedTeachers(student.assignedTeachers || []);
    setIsAssignModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditForm({
      _id: user._id,
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'student',
      studentGroupId: user.studentGroupId || '',
      teacherGroupId: user.teacherGroupId || '',
      hourlyRate: user.hourlyRate || 3.0,
      timezone: user.timezone || 'Africa/Cairo' // ✨ Added timezone to edit
    });
    setIsEditModalOpen(true);
  };

  const allTeachers = users.filter(u => u.role === 'teacher');

  const filteredUsers = users
    .filter((user) => {
      const matchesRole = roleFilter === 'ALL' || user.role?.toLowerCase() === roleFilter.toLowerCase();
      const matchesSearch = (user.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (user.email || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesRole && matchesSearch;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <div className="dashboard-container" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      
      {/* HEADER & BACK BUTTON */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <button 
          onClick={() => navigate('/admin')} 
          style={{ padding: '8px 16px', backgroundColor: '#636e72', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ← Back to Dashboard
        </button>

        <button 
          onClick={() => setIsCreateModalOpen(true)}
          style={{ padding: '10px 20px', backgroundColor: '#00b894', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', boxShadow: '0 4px 12px rgba(0,184,148,0.3)' }}>
          ➕ Create New User
        </button>
      </div>

      <h1 style={{ margin: '0 0 20px 0', color: '#2d3436' }}>📋 User Management Database</h1>

      {/* 🔍 SEARCH AND ROLE FILTER BAR */}
      <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.04)', marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
        
        {/* ROLE TABS */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {['ALL', 'STUDENT', 'TEACHER', 'ADMIN'].map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                fontWeight: 'bold',
                cursor: 'pointer',
                backgroundColor: roleFilter === role ? '#0984e3' : '#f1f2f6',
                color: roleFilter === role ? 'white' : '#636e72',
                transition: 'all 0.2s'
              }}>
              {role} {role !== 'ALL' && `(${users.filter(u => u.role?.toLowerCase() === role.toLowerCase()).length})`}
            </button>
          ))}
        </div>

        {/* SEARCH INPUT */}
        <input 
          type="text" 
          placeholder="🔍 Search name or email..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: '8px 15px', borderRadius: '6px', border: '1px solid #dfe6e9', width: '250px' }}
        />
      </div>

      {/* 📊 USERS TABLE */}
      <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.04)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#2d3436', color: 'white' }}>
              <th style={{ padding: '14px', fontSize: '14px' }}>Name (A-Z)</th>
              <th style={{ padding: '14px', fontSize: '14px' }}>Role</th>
              <th style={{ padding: '14px', fontSize: '14px' }}>Email</th>
              <th style={{ padding: '14px', fontSize: '14px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#b2bec3', fontStyle: 'italic' }}>No users found.</td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const activeMakeups = user.makeupBank ? user.makeupBank.filter(m => !m.isUsed && new Date(m.expirationDate) > new Date()).length : 0;
                return (
                <tr key={user._id} style={{ borderBottom: '1px solid #f1f2f6' }}>
                  <td style={{ padding: '14px' }}>
                    <strong>{user.name}</strong>
                    {user.role === 'student' && activeMakeups > 0 && (
                      <span style={{ marginLeft: '10px', backgroundColor: '#2ecc71', color: 'white', padding: '2px 6px', borderRadius: '10px', fontSize: '11px' }}>
                        {activeMakeups} Makeups
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '14px' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      color: 'white',
                      backgroundColor: user.role === 'admin' ? '#d63031' : user.role === 'teacher' ? '#0984e3' : '#00b894'
                    }}>
                      {user.role ? user.role.toUpperCase() : 'STUDENT'}
                    </span>
                  </td>
                  <td style={{ padding: '14px', color: '#636e72' }}>{user.email}</td>
                  <td style={{ padding: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => copyToClipboard(user._id)} className="btn-grey" style={{ fontSize: '12px', padding: '5px 10px' }}>Copy ID</button>
                    <button onClick={() => openEditModal(user)} style={{ fontSize: '12px', padding: '5px 10px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>✏️ Edit</button>
                    {user.role === 'student' && (
                      <>
                        <button onClick={() => openAssignModal(user)} style={{ fontSize: '12px', padding: '5px 10px', backgroundColor: '#9b59b6', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>🧑‍🏫 Assign</button>
                        <button onClick={() => openWallet(user)} style={{ fontSize: '12px', padding: '5px 10px', backgroundColor: '#f39c12', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>💳 Wallet & Sync</button>
                      </>
                    )}
                    <button onClick={() => handleDelete(user._id)} className="role-admin" style={{ fontSize: '12px', padding: '5px 10px', border: 'none', cursor: 'pointer', color: 'white', borderRadius: '5px' }}>Delete</button>
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>

      {/* ➕ CREATE USER MODAL */}
      {isCreateModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '15px', width: '450px', color: '#2d3436' }}>
            <h2 style={{ margin: '0 0 20px 0' }}>➕ Create New User Account</h2>

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Full Name:</label>
                <input type="text" required value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dfe6e9', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Email Address:</label>
                <input type="email" required value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dfe6e9', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Password:</label>
                <input type="password" required value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dfe6e9', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>User Role:</label>
                  <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dfe6e9', marginTop: '4px', boxSizing: 'border-box' }}>
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                
                {/* ✨ NEW: Timezone Dropdown on Create */}
                <div>
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Timezone:</label>
                  <select value={newUser.timezone} onChange={(e) => setNewUser({ ...newUser, timezone: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dfe6e9', marginTop: '4px', boxSizing: 'border-box' }}>
                    {commonTimezones.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>WhatsApp Number / JID (Optional):</label>
                <input type="text" placeholder="e.g. 201012345678" value={newUser.whatsappNumber} onChange={(e) => setNewUser({ ...newUser, whatsappNumber: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dfe6e9', marginTop: '4px', boxSizing: 'border-box' }} />
              </div>

              {newUser.role === 'student' && (
                <div>
                  <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Student WhatsApp Group ID (Optional):</label>
                  <input type="text" placeholder="e.g. 120363012345678@g.us" value={newUser.studentGroupId} onChange={(e) => setNewUser({ ...newUser, studentGroupId: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dfe6e9', marginTop: '4px', boxSizing: 'border-box' }} />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px' }}>
                <button type="button" onClick={() => setIsCreateModalOpen(false)} style={{ padding: '10px 15px', border: '1px solid #b2bec3', borderRadius: '6px', backgroundColor: 'transparent', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={isCreatingUser} style={{ padding: '10px 15px', backgroundColor: '#00b894', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {isCreatingUser ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '450px', color: 'black', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>✏️ Edit Profile</h2>
              <button onClick={() => setIsEditModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            </div>
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div><label style={{ fontWeight: 'bold', fontSize: '14px' }}>Full Name:</label><input type="text" required value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} /></div>
              <div><label style={{ fontWeight: 'bold', fontSize: '14px' }}>Email Address:</label><input type="email" required value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} /></div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontWeight: 'bold', fontSize: '14px' }}>System Role:</label>
                  <select value={editForm.role} onChange={(e) => setEditForm({...editForm, role: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}>
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                
                {/* ✨ NEW: Timezone Dropdown on Edit */}
                <div>
                  <label style={{ fontWeight: 'bold', fontSize: '14px' }}>Timezone:</label>
                  <select value={editForm.timezone} onChange={(e) => setEditForm({...editForm, timezone: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}>
                    {commonTimezones.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div><label style={{ fontWeight: 'bold', fontSize: '14px' }}>WhatsApp / Student Group ID:</label><input type="text" placeholder="e.g. 120363305478886477@g.us" value={editForm.studentGroupId} onChange={(e) => setEditForm({...editForm, studentGroupId: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} /></div>
              {editForm.role === 'teacher' && (
                <>
                  <div><label style={{ fontWeight: 'bold', fontSize: '14px' }}>Teacher Group ID:</label><input type="text" placeholder="e.g. 120363305478886477@g.us" value={editForm.teacherGroupId} onChange={(e) => setEditForm({...editForm, teacherGroupId: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} /></div>
                  <div><label style={{ fontWeight: 'bold', fontSize: '14px' }}>Hourly Pay Rate ($):</label><input type="number" step="0.5" value={editForm.hourlyRate} onChange={(e) => setEditForm({...editForm, hourlyRate: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} /></div>
                </>
              )}
              <button type="submit" disabled={isEditing} style={{ width: '100%', padding: '12px', backgroundColor: isEditing ? '#95a5a6' : '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: isEditing ? 'not-allowed' : 'pointer', fontWeight: 'bold', marginTop: '10px' }}>
                {isEditing ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN MODAL (CHECKBOXES) */}
      {isAssignModalOpen && assignStudent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '400px', color: 'black' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>🧑‍🏫 Assign Teachers</h2>
              <button onClick={() => setIsAssignModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            </div>
            <p style={{ color: '#555', marginBottom: '15px', fontSize: '14px' }}>Select all teachers who instruct <strong>{assignStudent.name}</strong>.</p>
            
            <div style={{ marginBottom: '25px', maxHeight: '250px', overflowY: 'auto', border: '1px solid #dfe6e9', borderRadius: '6px', padding: '10px' }}>
              {allTeachers.map(teacher => (
                <label key={teacher._id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 5px', cursor: 'pointer', borderBottom: '1px solid #f1f2f6' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedTeachers.includes(teacher._id)}
                    onChange={() => toggleTeacherSelection(teacher._id)}
                    style={{ transform: 'scale(1.2)' }}
                  />
                  <span style={{ fontSize: '15px', color: '#2d3436' }}>{teacher.name}</span>
                </label>
              ))}
            </div>

            <button onClick={handleSaveAssignments} disabled={isAssigning} style={{ width: '100%', padding: '12px', backgroundColor: isAssigning ? '#95a5a6' : '#9b59b6', color: 'white', border: 'none', borderRadius: '5px', cursor: isAssigning ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
              {isAssigning ? 'Saving...' : 'Save Assignments'}
            </button>
          </div>
        </div>
      )}

      {/* ✨ UPDATED WALLET & PAYPAL MODAL */}
      {isWalletOpen && selectedStudent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '650px', color: 'black', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>💳 {selectedStudent.name}'s Profile</h2>
              <button onClick={() => setIsWalletOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            </div>

            {/* Quick Stats */}
            <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
              <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #ddd' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#555' }}>Classes Used</h4>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: selectedStudent.subscription?.status === 'active' ? '#2ecc71' : '#e74c3c' }}>
                  {selectedStudent.subscription?.classesUsed || 0} / {selectedStudent.subscription?.totalClassesBought || 0}
                </div>
                <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#777' }}>
                  Status: {selectedStudent.subscription?.status ? selectedStudent.subscription.status.toUpperCase() : 'NONE'}
                </p>
              </div>
              <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #ddd' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#555' }}>Makeup Bank</h4>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f39c12' }}>
                  {selectedStudent.makeupBank ? selectedStudent.makeupBank.filter(m => !m.isUsed && new Date(m.expirationDate) > new Date()).length : 0}
                </div>
                <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#777' }}>Available (90-Day)</p>
              </div>
            </div>

            {/* ✨ SECTION 4: TIMEZONE SYNC */}
            <div style={{ backgroundColor: '#eafaf1', padding: '20px', borderRadius: '8px', marginBottom: '20px', borderLeft: '4px solid #27ae60' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#1e8449', fontSize: '16px' }}>🌍 DST & Timezone Sync</h3>
              <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#2d3436' }}>
                Current Saved Timezone: <strong>{selectedStudent.timezone || 'Africa/Cairo'}</strong>
              </p>
              <button 
                type="button" 
                onClick={handleSyncTimezone}
                disabled={isSyncingTZ}
                style={{ width: '100%', padding: '10px', backgroundColor: isSyncingTZ ? '#95a5a6' : '#27ae60', color: 'white', border: 'none', borderRadius: '5px', cursor: isSyncingTZ ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {isSyncingTZ ? 'Syncing...' : '🌍 Sync Calendar to Student Timezone'}
              </button>
            </div>

            <form onSubmit={handleUpdateSubscription}>
              
              {/* SECTION 1: PAYPAL BILLING */}
              <div style={{ backgroundColor: '#f0f4f8', padding: '20px', borderRadius: '8px', marginBottom: '20px', borderLeft: '4px solid #3498db' }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50', fontSize: '16px' }}>💳 Payment & Billing Setup (PayPal)</h3>
                
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Billing Type:</label>
                  <select value={billingType} onChange={(e) => setBillingType(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}>
                    <option value="none">None / Manual Payment</option>
                    <option value="subscription">Auto-Subscription (I-...)</option>
                    <option value="recurring_invoice">Recurring Invoice Series (INV2-...)</option>
                  </select>
                </div>

                {billingType === 'subscription' && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>PayPal Subscription ID (I-xxx):</label>
                    <input type="text" placeholder="e.g. I-BW452GL1KMUW" value={subscriptionId} onChange={(e) => setSubscriptionId(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                  </div>
                )}

                {billingType === 'recurring_invoice' && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Invoice ID (INV2-xxx):</label>
                      <input type="text" placeholder="e.g. INV2-9842-8821" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Recurring Series ID (REC-xxx):</label>
                      <input type="text" placeholder="e.g. REC-12345" value={recurringSeriesId} onChange={(e) => setRecurringSeriesId(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 2: WEEKLY SCHEDULE */}
              <div style={{ backgroundColor: '#fcf3cf', padding: '20px', borderRadius: '8px', marginBottom: '20px', borderLeft: '4px solid #f1c40f' }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#7d6608', fontSize: '16px' }}>🗓️ Weekly Recurring Schedule</h3>
                
                {recurringSlots.length > 0 && (
                  <div style={{ marginBottom: '15px' }}>
                    {recurringSlots.map((slot, index) => (
                      <div key={index} style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#fff', padding: '10px', borderRadius: '5px', marginBottom: '5px', border: '1px solid #f1c40f' }}>
                        <span><strong>{slot.dayOfWeek}s</strong>: {slot.startTime} - {slot.endTime}</span>
                        <button type="button" onClick={() => handleRemoveRecurringSlot(index)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontWeight: 'bold' }}>✖ Remove</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>Day</label>
                    <select value={newSlotDay} onChange={(e) => setNewSlotDay(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>Start Time</label>
                    <input type="time" value={newSlotStart} onChange={(e) => setNewSlotStart(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>End Time</label>
                    <input type="time" value={newSlotEnd} onChange={(e) => setNewSlotEnd(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
                  </div>
                  <button type="button" onClick={handleAddRecurringSlot} style={{ padding: '9px 15px', backgroundColor: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Add Slot</button>
                </div>
              </div>

              {/* SECTION 3: CALENDAR CYCLE CONTROLS */}
              <div style={{ backgroundColor: '#eef2f5', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50', borderBottom: '1px solid #ccc', paddingBottom: '10px', fontSize: '16px' }}>⚙ Manual Cycle Overrides</h3>
                
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <button type="button" onClick={handleAutoSyncWallet} disabled={isSubUpdating} style={{ flex: 1, padding: '10px', backgroundColor: '#8e44ad', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
                    {isSubUpdating ? 'Syncing...' : '⚡ Auto-Count Past Classes'}
                  </button>
                  <button type="button" onClick={handleResetCompletedToZero} disabled={isSubUpdating} style={{ flex: 1, padding: '10px', backgroundColor: '#e67e22', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
                    🔄 Reset Completed to 0
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div style={{ gridColumn: '1 / -1', backgroundColor: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #3498db' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px', color: '#2980b9' }}>⚡ Quick Auto-Calculate End Date:</label>
                    <select 
                      onChange={(e) => {
                        const days = Number(e.target.value);
                        if (!days) return;
                        const start = subStart ? new Date(subStart) : new Date();
                        const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
                        setSubStart(start.toISOString().split('T')[0]);
                        setSubEnd(end.toISOString().split('T')[0]);
                      }} 
                      style={{ width: '100%', padding: '8px', borderRadius: '5px', border: '1px solid #ccc', fontWeight: 'bold' }}>
                      <option value="">-- Choose Duration Preset --</option>
                      <option value="28">Monthly Cycle (28 Days)</option>
                      <option value="84">Quarterly Cycle (84 Days / 3 Months)</option>
                      <option value="336">Yearly Cycle (336 Days / 12 Months)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Status:</label>
                    <select value={subStatus} onChange={(e) => setSubStatus(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}>
                      <option value="none">None</option>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="expired">Expired</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Total Classes Bought:</label>
                    <input type="number" min="0" value={subTotal} onChange={(e) => setSubTotal(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Start Date:</label>
                    <input type="date" value={subStart} onChange={(e) => setSubStart(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>End Date:</label>
                    <input type="date" value={subEnd} onChange={(e) => setSubEnd(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>

              <button type="submit" disabled={isSubUpdating} style={{ width: '100%', padding: '14px', backgroundColor: isSubUpdating ? '#95a5a6' : '#2ecc71', color: 'white', border: 'none', borderRadius: '8px', cursor: isSubUpdating ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '16px', boxShadow: '0 4px 15px rgba(46,204,113,0.3)' }}>
                {isSubUpdating ? 'Saving...' : '💾 Save All Profile Changes'}
              </button>

            </form>
            
            {/* MAKEUP BANK FORM */}
            <div style={{ backgroundColor: '#fff4e6', padding: '20px', borderRadius: '8px', border: '1px solid #fce8cc', marginTop: '25px' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#d35400', borderBottom: '1px solid #fce8cc', paddingBottom: '10px' }}>➕ Grant Makeup Credit</h3>
              <form onSubmit={handleGrantMakeup}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Original Missed Date:</label>
                <input type="date" required value={makeupDate} onChange={(e) => setMakeupDate(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '15px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Reason (Optional):</label>
                <input type="text" placeholder="e.g., Teacher canceled, Medical emergency" value={makeupReason} onChange={(e) => setMakeupReason(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '20px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                <button type="submit" disabled={isSubmitting} style={{ width: '100%', padding: '12px', backgroundColor: isSubmitting ? '#95a5a6' : '#f39c12', color: 'white', border: 'none', borderRadius: '5px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
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