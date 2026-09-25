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
    studentGroupId: ''
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
  const [isSubUpdating, setIsSubUpdating] = useState(false);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignStudent, setAssignStudent] = useState(null);
  const [selectedTeachers, setSelectedTeachers] = useState([]); 
  const [isAssigning, setIsAssigning] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [isEditing, setIsEditing] = useState(false);

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
      setNewUser({ name: '', email: '', password: '', role: 'student', whatsappNumber: '', studentGroupId: '' });
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
      await axios.put(`${API_URL}/api/users/${selectedStudent._id}/subscription`, {
        status: subStatus,
        totalClassesBought: subTotal,
        classesUsed: subUsed,
        startDate: subStart,
        endDate: subEnd
      }, config);
      alert('✅ Subscription updated successfully!');
      setIsWalletOpen(false);
      fetchUsers(); 
    } catch (error) {
      console.error(error);
      alert('❌ Failed to update subscription.');
    } finally {
      setIsSubUpdating(false);
    }
  };

  // ✨ NEW: Auto-Sync Wallet Handler
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
        endDate: subEnd
      }, config);

      setSubTotal(res.data.subscription.totalClassesBought);
      setSubUsed(res.data.subscription.classesUsed);
      setSubStatus('active');

      alert(`✅ Auto-synced! Found ${res.data.subscription.totalClassesBought} total scheduled classes and ${res.data.subscription.classesUsed} completed classes.`);
      fetchUsers();
    } catch (error) {
      console.error(error);
      alert('❌ Failed to auto-sync wallet from calendar.');
    } finally {
      setIsSubUpdating(false);
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
      alert(`✅ Teachers linked successfully to ${assignStudent.name}!`);
      setIsAssignModalOpen(false);
      fetchUsers();
    } catch (error) {
      console.error(error);
      alert('❌ Failed to update assigned teachers.');
    } finally {
      setIsAssigning(false);
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

  const toggleTeacher = (teacherId) => {
    setSelectedTeachers([teacherId]); // Restricts to one teacher based on previous update
  };

  const openWallet = (student) => {
    setSelectedStudent(student);
    setSubStatus(student.subscription?.status || 'none');
    setSubTotal(student.subscription?.totalClassesBought || 0);
    setSubUsed(student.subscription?.classesUsed || 0);
    setSubStart(student.subscription?.startDate ? student.subscription.startDate.split('T')[0] : '');
    setSubEnd(student.subscription?.endDate ? student.subscription.endDate.split('T')[0] : '');
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
      hourlyRate: user.hourlyRate || 3.0
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
                        <button onClick={() => openWallet(user)} style={{ fontSize: '12px', padding: '5px 10px', backgroundColor: '#f39c12', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>💳 Wallet</button>
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

              <div>
                <label style={{ fontWeight: 'bold', fontSize: '13px' }}>User Role:</label>
                <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #dfe6e9', marginTop: '4px', boxSizing: 'border-box' }}>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
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
              <div>
                <label style={{ fontWeight: 'bold', fontSize: '14px' }}>System Role:</label>
                <select value={editForm.role} onChange={(e) => setEditForm({...editForm, role: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}>
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
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

      {/* ASSIGN MODAL */}
      {isAssignModalOpen && assignStudent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '400px', color: 'black' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>🧑‍🏫 Assign Teacher</h2>
              <button onClick={() => setIsAssignModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            </div>
            <p style={{ color: '#555', marginBottom: '15px', fontSize: '14px' }}>Select the primary teacher for <strong>{assignStudent.name}</strong>.</p>
            
            <div style={{ marginBottom: '25px' }}>
              <select 
                value={selectedTeachers.length > 0 ? selectedTeachers[0] : ''} 
                onChange={(e) => setSelectedTeachers([e.target.value])} 
                style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '15px' }}>
                <option value="">-- Unassigned (Select a Teacher) --</option>
                {allTeachers.map(teacher => (
                  <option key={teacher._id} value={teacher._id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={handleSaveAssignments} disabled={isAssigning} style={{ width: '100%', padding: '12px', backgroundColor: isAssigning ? '#95a5a6' : '#9b59b6', color: 'white', border: 'none', borderRadius: '5px', cursor: isAssigning ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
              {isAssigning ? 'Saving...' : 'Save Assignment'}
            </button>
          </div>
        </div>
      )}

      {/* WALLET MODAL */}
      {isWalletOpen && selectedStudent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflowY: 'auto', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '550px', color: 'black', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>💳 {selectedStudent.name}'s Wallet</h2>
              <button onClick={() => setIsWalletOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            </div>

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

            <div style={{ backgroundColor: '#eef2f5', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50', borderBottom: '1px solid #ccc', paddingBottom: '10px' }}>⚙️ Manage Subscription</h3>
              
              {/* ✨ NEW: Auto-Count Classes Button */}
              <button 
                type="button" 
                onClick={handleAutoSyncWallet}
                disabled={isSubUpdating}
                style={{ width: '100%', padding: '10px', backgroundColor: '#8e44ad', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', marginBottom: '15px' }}>
                {isSubUpdating ? 'Syncing...' : '⚡ Auto-Count Classes from Calendar'}
              </button>

              <form onSubmit={handleUpdateSubscription} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                
                {/* ✨ NEW: PLAN PRESET SELECTOR */}
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
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Classes Completed:</label>
                  <input type="number" min="0" value={subUsed} onChange={(e) => setSubUsed(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </div>

                <div></div>

                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>Start Date:</label>
                  <input type="date" value={subStart} onChange={(e) => setSubStart(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>End Date:</label>
                  <input type="date" value={subEnd} onChange={(e) => setSubEnd(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <button type="submit" disabled={isSubUpdating} style={{ width: '100%', padding: '12px', backgroundColor: isSubUpdating ? '#95a5a6' : '#2ecc71', color: 'white', border: 'none', borderRadius: '5px', cursor: isSubUpdating ? 'not-allowed' : 'pointer', fontWeight: 'bold', marginTop: '10px' }}>
                    {isSubUpdating ? 'Updating...' : 'Update Subscription'}
                  </button>
                </div>
              </form>
            </div>

            <div style={{ backgroundColor: '#fff4e6', padding: '20px', borderRadius: '8px', border: '1px solid #fce8cc' }}>
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