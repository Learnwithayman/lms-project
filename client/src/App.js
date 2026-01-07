import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import CreateUser from './pages/CreateUser';
import ScheduleClass from './pages/ScheduleClass';
import UserList from './pages/UserList';
import AdminSchedule from './pages/AdminSchedule'; // <--- NEW IMPORT

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/create-user" element={<CreateUser />} />
        <Route path="/schedule-class" element={<ScheduleClass />} />
        <Route path="/users" element={<UserList />} />
        <Route path="/all-classes" element={<AdminSchedule />} /> {/* <--- NEW ROUTE */}
      </Routes>
    </Router>
  );
}

export default App;