import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function ScheduleClass() {
  const [teacherId, setTeacherId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [subject, setSubject] = useState('');
  const [meetingLink, setMeetingLink] = useState(''); // <--- New State
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState(60);
  const navigate = useNavigate();

  const handleSchedule = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const config = {
        headers: { Authorization: `Bearer ${token}` },
      };

      const formattedDate = new Date(startTime).toISOString();

      await axios.post('http://localhost:5000/api/schedule', {
        teacherId: teacherId.trim(),
        studentId: studentId.trim(),
        subject,
        meetingLink, // <--- Send the link to backend
        startTime: formattedDate,
        durationMinutes: duration,
      }, config);

      alert('Class Scheduled Successfully! 📅');
      navigate('/admin');

    } catch (error) {
      console.error(error);
      alert('Failed to schedule class.');
    }
  };

  return (
    <div className="dashboard-container">
      <button onClick={() => navigate('/admin')} className="btn-grey" style={{ marginBottom: '20px' }}>⬅ Back</button>
      <h1>📅 Schedule a Class</h1>
      <form onSubmit={handleSchedule} style={{ maxWidth: '400px' }}>
        
        <label>Teacher ID:</label>
        <input type="text" placeholder="Teacher ID" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required />
        
        <label>Student ID:</label>
        <input type="text" placeholder="Student ID" value={studentId} onChange={(e) => setStudentId(e.target.value)} required />
        
        <label>Subject:</label>
        <input type="text" placeholder="e.g. Quran" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        
        {/* NEW INPUT FOR ZOOM LINK */}
        <label>Zoom/Meeting Link:</label>
        <input 
          type="text" 
          placeholder="e.g. https://zoom.us/j/123456" 
          value={meetingLink} 
          onChange={(e) => setMeetingLink(e.target.value)} 
        />
        
        <label>Start Time:</label>
        <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
        
        <label>Duration (Minutes):</label>
        <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} required />

        <button type="submit" className="btn-green" style={{ width: '100%' }}>
          Confirm Schedule
        </button>
      </form>
    </div>
  );
}

export default ScheduleClass;