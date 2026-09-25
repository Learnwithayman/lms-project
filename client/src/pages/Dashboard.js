import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import '../App.css';

const API_URL = process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com';

const FEEDBACK_TEMPLATES = {
  "Commendation": {
    Standard: "Masha'Allah, excellent progress! Through dedicated effort and the tawfiq of Allah (SWT), all learning goals for the month were successfully completed. May Allah (SWT) continue to bless your efforts."
  },
  "Regarding Absences": {
    Minor: "Attendance Note: We noticed a few absences this month which slightly slowed our pace. Insha'Allah, with consistent attendance next month, we can fully catch up on all material.",
    Major: "Action Required: Consistent attendance is a vital trust. Due to frequent absences this month, key study goals were not met. We encourage a renewed commitment to attendance to ensure success. May Allah (SWT) grant you steadfastness."
  },
  "Regarding Homework": {
    Minor: "Homework Reminder: Please remember that homework reinforces our lessons. A few missed assignments this month slowed our progress slightly. Let's aim for full completion next month!",
    Major: "Action Required: Homework is essential for retention. Unfortunately, frequent incomplete assignments prevented us from meeting our study goals this month. With renewed focus on home revision, you will achieve your objectives."
  },
  "Regarding In-Class Attention": {
    Minor: "Focus Reminder: We noticed some difficulty maintaining focus during class this month. Staying fully engaged in upcoming sessions will help ensure all concepts are mastered and retained.",
    Major: "Action Required: Active engagement is key to seeking knowledge. Unfortunately, a lack of focus in class has resulted in unmet study goals this month. We encourage better attention to ensure future success. May Allah (SWT) grant you clarity."
  },
  "Mixed Concerns (Attendance & Homework)": {
    Minor: "Consistency Reminder: We noticed slight gaps in both attendance and homework submission this month. Establishing a steady routine for classes and home revision will ensure we stay on schedule next month.",
    Major: "Action Required: Progress has been hindered this month by both absences and incomplete homework. Consistent attendance and independent practice are necessary trusts for success. We urge a renewed commitment to these areas to meet future goals."
  },
  "Mixed Concerns (Focus & Preparation)": {
    Minor: "Engagement Note: To fully master the current material, we need to see slightly more focus during class and consistent completion of assignments. A small increase in effort will yield great results, Insha'Allah.",
    Major: "Action Required: Learning requires active participation. Unfortunately, a combination of distraction in class and missed assignments has prevented us from meeting our study goals. We ask for your support in improving focus and preparation."
  },
  "General Improvement Needed": {
    Minor: "Monthly Summary: This month presented a few challenges regarding general preparation and consistency. We are confident that with a fresh start and renewed intention, next month will be very productive.",
    Major: "Action Required: Due to various inconsistencies this month, we were unable to meet our primary learning objectives. We strongly encourage a fresh start with renewed dedication and discipline for the month ahead. May Allah (SWT) grant you success."
  }
};

function Dashboard() {
  const [classes, setClasses] = useState([]);
  const [user, setUser] = useState({});
  const [earnings, setEarnings] = useState(null); 
  const [subSummary, setSubSummary] = useState(null);
  
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const [reportStatuses, setReportStatuses] = useState({});

  const navigate = useNavigate();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentClassId, setCurrentClassId] = useState(null);
  const [notes, setNotes] = useState('');
  const [classroomChecked, setClassroomChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isMakeupModalOpen, setIsMakeupModalOpen] = useState(false);
  const [selectedOriginalDate, setSelectedOriginalDate] = useState('');
  const [preferredMakeupDate, setPreferredMakeupDate] = useState('');
  const [makeupRequestNotes, setMakeupRequestNotes] = useState('');
  const [isRequestingMakeup, setIsRequestingMakeup] = useState(false);

  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planStudentIdentifier, setPlanStudentIdentifier] = useState('');
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [planForm, setPlanForm] = useState({
    monthYear: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
    isFinalized: false, 
    quranEnrolled: false, quranPlan: '', quranScore: '', quranCompleted: false, quranComment: '',
    arabicEnrolled: false, arabicPlan: '', arabicScore: '', arabicCompleted: false, arabicComment: '',
    islamicEnrolled: false, islamicPlan: '', islamicScore: '', islamicCompleted: false, islamicComment: '',
    teacherNote: '',
    templateCategory: '',
    templateSeverity: 'Minor'
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token) return navigate('/');

    const parsedUser = JSON.parse(userData);
    setUser(parsedUser);
    
    fetchClasses(token);
    fetchHistory(token); 

    if (parsedUser?.role?.toLowerCase() === 'teacher') {
      fetchEarnings(token);
      fetchReportStatuses(token);
    } else {
      fetchSubSummary(token);
    }
  }, [navigate]);

  const fetchClasses = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/schedule/google-calendar`, config);
      setClasses(res.data);
    } catch (error) {
      console.error("Error fetching classes:", error);
    }
  };

  const fetchHistory = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/schedule/completed`, config);
      setHistory(res.data);
    } catch (error) {
      console.error("Error fetching class history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchEarnings = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/schedule/earnings`, config);
      setEarnings(res.data);
    } catch (error) {
      console.error("Failed to fetch earnings:", error);
    }
  };

  const fetchSubSummary = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/student/subscription-summary`, config);
      setSubSummary(res.data);
    } catch (error) {
      console.error("Failed to fetch subscription summary:", error);
    }
  };

  const fetchReportStatuses = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/student/reports-status`, config);
      setReportStatuses(res.data);
    } catch (error) {
      console.error("Failed to fetch report statuses:", error);
    }
  };

  const fetchExistingPlan = async () => {
    setIsLoadingPlan(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/student/reports/${planStudentIdentifier}/${planForm.monthYear}`, config);
      
      if (res.data) {
        const r = res.data;
        setPlanForm(prev => ({
          ...prev,
          quranEnrolled: r.quran?.enrolled || false,
          quranPlan: r.quran?.plan || '',
          quranScore: r.quran?.score || '',
          quranCompleted: r.quran?.completed || false,
          quranComment: r.quran?.comment || '',
          arabicEnrolled: r.arabic?.enrolled || false,
          arabicPlan: r.arabic?.plan || '',
          arabicScore: r.arabic?.score || '',
          arabicCompleted: r.arabic?.completed || false,
          arabicComment: r.arabic?.comment || '',
          islamicEnrolled: r.islamicStudies?.enrolled || false,
          islamicPlan: r.islamicStudies?.plan || '',
          islamicScore: r.islamicStudies?.score || '',
          islamicCompleted: r.islamicStudies?.completed || false,
          islamicComment: r.islamicStudies?.comment || '',
          teacherNote: r.teacherNote || '',
        }));
        alert(`✅ Found existing plan for ${planForm.monthYear}!`);
      } else {
        alert('ℹ️ No existing plan found for this month.');
      }
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.message || '❌ Could not fetch the plan.');
    } finally {
      setIsLoadingPlan(false);
    }
  };

  const handleJoinClassClick = async (cls) => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await axios.post(`${API_URL}/api/schedule/join`, {
        classId: cls.id || cls._id,
        title: cls.title || cls.subject,
        studentGroupName: cls.studentGroupName,
        startTime: cls.startTime
      }, config);
    } catch (error) {
      console.error('⚠️ Silently failed to mark class as joined:', error);
    }
  };

  const handleEndClass = async () => {
    if (!classroomChecked) return alert("Please upload the homework and check the confirmation box first!");
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const targetClass = classes.find(c => (c.id === currentClassId || c._id === currentClassId));

      let dynamicDuration = 60; 
      if (targetClass?.startTime && targetClass?.endTime) {
        const start = new Date(targetClass.startTime).getTime();
        const end = new Date(targetClass.endTime).getTime();
        dynamicDuration = Math.round((end - start) / 60000); 
      } else if (targetClass?.durationMinutes) {
        dynamicDuration = targetClass.durationMinutes; 
      }

      await axios.put(`${API_URL}/api/schedule/end`, {
        classId: currentClassId,
        notes: notes,
        classroomLink: targetClass?.classroomLink, 
        studentGroupId: targetClass?.studentGroupId,
        whatsappGroupId: targetClass?.teacherGroupId, 
        studentName: targetClass?.title,
        startTime: targetClass?.startTime,
        durationMinutes: dynamicDuration 
      }, config);

      setIsModalOpen(false);
      setNotes('');
      setClassroomChecked(false);
      
      fetchClasses(token);
      fetchEarnings(token);
      fetchHistory(token); 
      alert('✅ Class ended successfully and hours logged!');
    } catch (error) {
      console.error('Error ending class:', error);
      alert('Failed to end class.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAttendance = async (cls, status) => {
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };

      await axios.post(`${API_URL}/api/schedule/attendance`, {
        classId: cls.id || cls._id,
        attendanceStatus: status,
        studentGroupId: cls.studentGroupId,
        title: cls.title,
        startTime: cls.startTime,
        zoomLink: cls.zoomLink || cls.meetingLink
      }, config);
      alert(`✅ Student marked as ${status}. WhatsApp message sent!`);
      fetchHistory(token); 
    } catch (error) {
      console.error('Error marking attendance:', error);
      alert('Failed to mark attendance.');
    }
  };

  const handleRequestMakeup = async (e) => {
    e.preventDefault();
    setIsRequestingMakeup(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      await axios.post(`${API_URL}/api/student/request-makeup`, {
        originalDate: selectedOriginalDate,
        preferredDate: preferredMakeupDate,
        reason: makeupRequestNotes
      }, config);
      
      alert('✅ Makeup request submitted successfully! Admin will contact you shortly.');
      setIsMakeupModalOpen(false);
      setSelectedOriginalDate('');
      setPreferredMakeupDate('');
      setMakeupRequestNotes('');
    } catch (error) {
      console.error('Error requesting makeup:', error);
      alert('❌ Failed to submit makeup request.');
    } finally {
      setIsRequestingMakeup(false);
    }
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      
      const payload = {
        studentIdentifier: planStudentIdentifier, 
        monthYear: planForm.monthYear,
        isFinalized: planForm.isFinalized,
        teacherNote: planForm.teacherNote,
        quran: { enrolled: planForm.quranEnrolled, plan: planForm.quranPlan, score: planForm.quranScore, maxPossible: maxScores.quran, completed: planForm.quranCompleted, comment: planForm.quranComment },
        arabic: { enrolled: planForm.arabicEnrolled, plan: planForm.arabicPlan, score: planForm.arabicScore, maxPossible: maxScores.arabic, completed: planForm.arabicCompleted, comment: planForm.arabicComment },
        islamicStudies: { enrolled: planForm.islamicEnrolled, plan: planForm.islamicPlan, score: planForm.islamicScore, maxPossible: maxScores.islamic, completed: planForm.islamicCompleted, comment: planForm.islamicComment }
      };

      await axios.post(`${API_URL}/api/student/reports`, payload, config);
      alert(planForm.isFinalized ? '✅ Phase 2 Graded Report submitted for Admin Approval!' : '✅ Phase 1 Draft Plan submitted for Admin Approval!');
      setIsPlanModalOpen(false);
      fetchReportStatuses(token);
    } catch (error) {
      console.error('Error saving plan:', error);
      alert(error.response?.data?.message || '❌ Failed to save study plan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInsertTemplate = () => {
    if (!planForm.templateCategory) return;
    const templateText = planForm.templateCategory === "Commendation" 
      ? FEEDBACK_TEMPLATES["Commendation"].Standard 
      : FEEDBACK_TEMPLATES[planForm.templateCategory][planForm.templateSeverity];
    
    setPlanForm(prev => ({
      ...prev,
      teacherNote: prev.teacherNote ? `${prev.teacherNote}\n\n${templateText}` : templateText
    }));
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const isClassLive = (startTime) => {
    const now = new Date();
    const classStart = new Date(startTime);
    const fifteenMinsBefore = new Date(classStart.getTime() - 15 * 60 * 1000);
    const ninetyMinsAfter = new Date(classStart.getTime() + 90 * 60 * 1000);
    return now >= fifteenMinsBefore && now <= ninetyMinsAfter;
  };

  const calculateProgress = () => {
    if (!subSummary?.subscription || subSummary.subscription.totalClassesBought === 0) return 0;
    const { classesUsed, totalClassesBought } = subSummary.subscription;
    const percentage = (classesUsed / totalClassesBought) * 100;
    return Math.min(percentage, 100); 
  };

  const getDynamicMaxScores = () => {
    let count = [planForm.quranEnrolled, planForm.arabicEnrolled, planForm.islamicEnrolled].filter(Boolean).length;
    if (count === 3) return { quran: 4, arabic: 3, islamic: 3 };
    if (count === 2) {
      if (planForm.quranEnrolled && planForm.arabicEnrolled) return { quran: 6, arabic: 4, islamic: 0 };
      if (planForm.quranEnrolled && planForm.islamicEnrolled) return { quran: 6, arabic: 0, islamic: 4 };
      if (planForm.arabicEnrolled && planForm.islamicEnrolled) return { quran: 0, arabic: 5, islamic: 5 };
    }
    if (count === 1) return { quran: 10, arabic: 10, islamic: 10 };
    return { quran: 0, arabic: 0, islamic: 0 };
  };
  
  const maxScores = getDynamicMaxScores();

  const cycleStartDate = subSummary?.subscription?.startDate ? new Date(subSummary.subscription.startDate) : null;
  const filteredHistory = cycleStartDate 
    ? history.filter(cls => new Date(cls.startTime) >= cycleStartDate)
    : history;

  const reportsData = subSummary?.monthlyReports || [];
  const finalizedReports = reportsData.filter(r => r.isFinalized);
  const activePlan = reportsData.find(r => !r.isFinalized);
  const chartData = finalizedReports.map(r => ({
    name: r.monthYear.substring(0, 3) || '',
    score: r.totalScore
  }));

  const selectedClass = classes.find(c => (c.id === currentClassId || c._id === currentClassId));

  // ✨ FIND ANY CURRENTLY LIVE CLASS
  const liveClass = classes.find(cls => cls.status !== 'completed' && isClassLive(cls.startTime));

  return (
    <div className="dashboard-container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      
      {/* 👑 STUDENT PORTAL HEADER */}
      {user?.role?.toLowerCase() !== 'teacher' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '30px', borderRadius: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.04)', marginBottom: '30px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '25px' }}>
              
              <div style={{ width: '80px', height: '80px', borderRadius: '12px', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 15px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                <img src="/logo512.png" alt="Learn With Ayman Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>

              <div>
                <h1 style={{ margin: '0 0 5px 0', color: '#2d3436', fontSize: '28px' }}>Hello, {user.name}</h1>
                <span style={{ backgroundColor: '#e8f4fd', color: '#0984e3', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Student Portal</span>
              </div>
            </div>
            <button onClick={handleLogout} style={{ border: 'none', backgroundColor: '#ff7675', color: 'white', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}>Logout</button>
          </div>

          {subSummary?.subscription?.status === 'expired' && (
            <div style={{ backgroundColor: '#ff7675', color: 'white', padding: '20px', borderRadius: '10px', marginBottom: '30px', fontWeight: 'bold', textAlign: 'center', boxShadow: '0 4px 15px rgba(255, 118, 117, 0.3)', fontSize: '16px' }}>
              ⚠️ Payment Due: Your subscription cycle has finished. Please renew your plan to continue booking classes.
            </div>
          )}
        </>
      ) : (
        <div className="dashboard-header">
          <h1>👋 Welcome, {user.name}</h1>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      )}

      {/* 🟢 LIVE CLASS HERO BANNER (Active when a class is live) */}
      {liveClass && (
        <div style={{
          backgroundColor: '#2ecc71',
          color: 'white',
          padding: '25px 30px',
          borderRadius: '15px',
          marginBottom: '30px',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          boxShadow: '0 8px 25px rgba(46, 204, 113, 0.35)',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'white', display: 'inline-block', animation: 'pulse 1.5s infinite' }}></span>
              <span style={{ fontSize: '12px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>CLASS IS LIVE NOW</span>
            </div>
            <h2 style={{ margin: '0 0 5px 0', fontSize: '24px' }}>📚 {liveClass.title || liveClass.subject}</h2>
            <p style={{ margin: 0, opacity: 0.9, fontSize: '14px' }}>Started at {new Date(liveClass.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          </div>

          {(liveClass.zoomLink || liveClass.meetingLink) ? (
            <button 
              onClick={() => {
                handleJoinClassClick(liveClass);
                window.open(liveClass.zoomLink || liveClass.meetingLink, '_blank');
              }}
              style={{
                backgroundColor: 'white',
                color: '#27ae60',
                border: 'none',
                padding: '14px 28px',
                borderRadius: '10px',
                fontSize: '16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                transition: 'transform 0.2s'
              }}>
              🎥 Join Class Now
            </button>
          ) : (
            <span style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: '10px 15px', borderRadius: '8px', fontSize: '14px' }}>
              Check WhatsApp for Link
            </span>
          )}
        </div>
      )}

      {/* 🟢 TEACHER EARNINGS DASHBOARD */}
      {user?.role?.toLowerCase() === 'teacher' && earnings && (
        <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #c3e6cb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
          <div>
            <h2 style={{ margin: '0 0 5px 0' }}>💰 Current Month Earnings</h2>
            <p style={{ margin: 0 }}>You have taught <strong>{earnings.totalHours} hours</strong> this month at <strong>${earnings.hourlyRate}/hr</strong>.</p>
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold' }}>${earnings.currentEarnings}</div>
        </div>
      )}

      {/* 🔵 STUDENT SUBSCRIPTION DASHBOARD */}
      {user?.role?.toLowerCase() !== 'teacher' && subSummary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '25px', marginBottom: '40px' }}>
          
          <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '15px', borderTop: '5px solid #0984e3', boxShadow: '0 10px 25px rgba(0,0,0,0.04)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#2d3436', fontSize: '20px', display: 'flex', justifyContent: 'space-between' }}>
              <span>📅 Current Plan</span>
              {subSummary.subscription?.status === 'active' ? (
                <span style={{ fontSize: '12px', backgroundColor: '#00b894', color: 'white', padding: '4px 10px', borderRadius: '12px', alignSelf: 'center' }}>ACTIVE</span>
              ) : (
                <span style={{ fontSize: '12px', backgroundColor: '#b2bec3', color: 'white', padding: '4px 10px', borderRadius: '12px', alignSelf: 'center' }}>INACTIVE</span>
              )}
            </h3>
            
            {subSummary.subscription ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', color: '#636e72', fontWeight: 'bold' }}>
                  <span>{subSummary.subscription.classesUsed} Completed</span>
                  <span>{subSummary.subscription.totalClassesBought} Total</span>
                </div>
                
                <div style={{ width: '100%', height: '12px', backgroundColor: '#dfe6e9', borderRadius: '10px', overflow: 'hidden', marginBottom: '20px' }}>
                  <div style={{ width: `${calculateProgress()}%`, height: '100%', backgroundColor: '#0984e3', transition: 'width 0.5s ease-in-out' }}></div>
                </div>

                <div style={{ backgroundColor: '#f5f6fa', padding: '15px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>🔄</span>
                  <div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#636e72', textTransform: 'uppercase', fontWeight: 'bold' }}>Cycle Start Date</p>
                    <p style={{ margin: 0, color: '#2d3436', fontWeight: 'bold', fontSize: '16px' }}>
                      {subSummary.subscription.startDate ? new Date(subSummary.subscription.startDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'Not Set'}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p style={{ margin: 0, color: '#b2bec3', fontStyle: 'italic' }}>No active subscription found. Please contact administration.</p>
            )}
          </div>

          <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '15px', borderTop: '5px solid #fdcb6e', boxShadow: '0 10px 25px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#2d3436', fontSize: '20px' }}>✨ Makeup Credits</h3>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '15px' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '15px', backgroundColor: '#fff3cd', color: '#d35400', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', fontWeight: 'bold' }}>
                {subSummary.makeupCount}
              </div>
              <div>
                <p style={{ margin: '0 0 5px 0', color: '#636e72', fontWeight: 'bold' }}>Available to Schedule</p>
                <p style={{ margin: 0, fontSize: '13px', color: '#b2bec3' }}>Credits remain valid for 90 days from the missed class.</p>
              </div>
            </div>
            
            {subSummary.makeupCount > 0 && (
              <>
                <div style={{ borderTop: '1px solid #f1f2f6', paddingTop: '15px', marginBottom: '15px' }}>
                  <p style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 'bold', color: '#636e72', textTransform: 'uppercase' }}>Expiring Soon:</p>
                  <ul style={{ listStyleType: 'none', padding: 0, margin: 0, fontSize: '14px' }}>
                    {subSummary.activeMakeups.slice(0, 2).map((makeup, i) => (
                      <li key={i} style={{ marginBottom: '8px', color: '#d63031', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#d63031', display: 'inline-block' }}></span>
                        Expires {new Date(makeup.expirationDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </li>
                    ))}
                  </ul>
                </div>
                <button 
                  onClick={() => setIsMakeupModalOpen(true)}
                  style={{ width: '100%', padding: '12px', backgroundColor: '#d35400', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}>
                  📅 Schedule Makeup
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ✨ STUDY PLANS & PROGRESS ANALYTICS */}
      {user?.role?.toLowerCase() !== 'teacher' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f2f6', paddingBottom: '10px', marginBottom: '20px' }}>
            <h2 style={{ margin: 0 }}>📈 Progress & Reports</h2>
            <button onClick={() => navigate('/progress')} style={{ fontSize: '14px', padding: '8px 15px', backgroundColor: '#0984e3', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              View Full History
            </button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '25px', marginBottom: '40px' }}>
            
            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '15px', boxShadow: '0 5px 15px rgba(0,0,0,0.03)' }}>
              <h3 style={{ margin: '0 0 20px 0', color: '#2d3436', fontSize: '18px' }}>Historical Performance (/10)</h3>
              {chartData.length > 0 ? (
                <div style={{ width: '100%', height: 250 }}>
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f2f6" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#b2bec3', fontSize: 12 }} />
                      <YAxis domain={[0, 10]} axisLine={false} tickLine={false} tick={{ fill: '#b2bec3', fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }} />
                      <Line type="monotone" dataKey="score" stroke="#0984e3" strokeWidth={4} dot={{ r: 6, fill: '#0984e3', stroke: 'white', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ height: '250px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b2bec3', fontStyle: 'italic' }}>
                  Analytics will appear after the first monthly report.
                </div>
              )}
            </div>

            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '15px', boxShadow: '0 5px 15px rgba(0,0,0,0.03)' }}>
              <h3 style={{ margin: '0 0 20px 0', color: '#2d3436', fontSize: '18px', display: 'flex', justifyContent: 'space-between' }}>
                <span>🎯 Active Study Plan</span>
                <span style={{ fontSize: '14px', color: '#0984e3' }}>{activePlan ? activePlan.monthYear : 'No Active Plan'}</span>
              </h3>
              
              {activePlan ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  {activePlan.quran?.enrolled && (
                    <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', borderTop: '4px solid #6c5ce7' }}>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#2d3436', textAlign: 'center' }}>Quran</h4>
                      <p style={{ margin: 0, fontSize: '13px', color: '#636e72' }}>{activePlan.quran.plan || 'Pending goals...'}</p>
                    </div>
                  )}
                  {activePlan.arabic?.enrolled && (
                    <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', borderTop: '4px solid #00b894' }}>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#2d3436', textAlign: 'center' }}>Arabic</h4>
                      <p style={{ margin: 0, fontSize: '13px', color: '#636e72' }}>{activePlan.arabic.plan || 'Pending goals...'}</p>
                    </div>
                  )}
                  {activePlan.islamicStudies?.enrolled && (
                    <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', borderTop: '4px solid #fdcb6e' }}>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#2d3436', textAlign: 'center' }}>Islamic Studies</h4>
                      <p style={{ margin: 0, fontSize: '13px', color: '#636e72' }}>{activePlan.islamicStudies.plan || 'Pending goals...'}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: '#b2bec3', fontStyle: 'italic', textAlign: 'center', marginTop: '40px' }}>Your teacher will upload this month's goals soon.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* 🗓️ UPCOMING CLASSES SCHEDULE */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>🗓️ Your Schedule</h2>
      </div>
      
      <div style={{ display: 'grid', gap: '20px', marginBottom: '40px' }}>
        {classes.length === 0 ? (
           <p style={{ fontStyle: 'italic', color: 'gray' }}>No upcoming classes found on your calendar.</p>
        ) : (
          classes.filter(cls => cls.status !== 'completed').map((cls) => {
            const isLive = isClassLive(cls.startTime);
            const classIdentifier = cls._id || cls.id;
            
            const studentLookupKey = (cls.studentGroupName || cls.title || cls.studentGroupId || '').toLowerCase();
            const planStatus = reportStatuses[studentLookupKey] || '⚪ No Plan Yet';

            return (
              <div key={classIdentifier} className="card" style={{ borderLeft: isLive ? '5px solid #2ecc71' : '5px solid #0984e3', borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.03)', backgroundColor: isLive ? '#f0fff4' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 10px 0', color: '#2d3436' }}>
                      📚 {cls.title || cls.subject}
                      {isLive && <span style={{ marginLeft: '10px', backgroundColor: '#2ecc71', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>LIVE NOW</span>}
                    </h3>
                    <p style={{ margin: '0 0 15px 0', color: '#636e72' }}><strong>⏰ Time:</strong> {new Date(cls.startTime).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  
                  {user?.role?.toLowerCase() === 'teacher' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                      <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', backgroundColor: '#f1f2f6', color: '#2d3436', fontWeight: 'bold' }}>
                        {planStatus}
                      </span>
                      <button 
                        onClick={() => {
                          setPlanStudentIdentifier(cls.studentGroupName || cls.title || cls.studentGroupId);
                          setIsPlanModalOpen(true);
                        }} 
                        style={{ backgroundColor: '#6c5ce7', color: 'white', padding: '8px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                        📝 Manage Plan & Reports
                      </button>
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                  {(cls.zoomLink || cls.meetingLink) ? (
                    <button 
                      className={isLive ? "btn-blue" : "btn-disabled"}
                      disabled={!isLive}
                      style={{ padding: '10px 20px', backgroundColor: isLive ? '#2ecc71' : '#b2bec3', cursor: isLive ? 'pointer' : 'not-allowed', border: 'none', color: 'white', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px' }}
                      onClick={() => {
                        if (isLive) {
                          handleJoinClassClick(cls);
                          window.open(cls.zoomLink || cls.meetingLink, '_blank');
                        }
                      }}
                    >
                      🎥 {isLive ? "Join Live Class Now" : "Locked (Not Class Time Yet)"}
                    </button>
                  ) : (
                    <span style={{ color: 'grey', fontStyle: 'italic', fontSize: '14px' }}>No meeting link attached.</span>
                  )}

                  {user?.role?.toLowerCase() === 'teacher' && (
                    <>
                      <button onClick={() => handleAttendance(cls, 'Late')} style={{ backgroundColor: '#fdcb6e', color: 'black', padding: '10px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>🏃‍♂️ Late</button>
                      <button onClick={() => handleAttendance(cls, 'Absent')} style={{ backgroundColor: '#636e72', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>❌ Absent</button>
                      <button onClick={() => { setCurrentClassId(classIdentifier); setIsModalOpen(true); }} style={{ backgroundColor: '#d63031', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>🛑 End Class</button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CLASS HISTORY SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #f1f2f6', paddingBottom: '10px' }}>
        <h2 style={{ margin: '0' }}>🕰️ Class History</h2>
        {user?.role?.toLowerCase() !== 'teacher' && (
          <span style={{ fontSize: '14px', color: '#636e72', fontWeight: 'bold' }}>Showing Current Cycle Only</span>
        )}
      </div>
      
      <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.03)', padding: '20px', overflowX: 'auto', marginBottom: '40px' }}>
        {loadingHistory ? (
          <p style={{ color: '#636e72' }}>Loading history...</p>
        ) : filteredHistory.length === 0 ? (
          <p style={{ fontStyle: 'italic', color: 'gray' }}>No past classes recorded in this cycle yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #dfe6e9', color: '#2d3436' }}>
                <th style={{ padding: '12px', fontSize: '14px' }}>Subject</th>
                <th style={{ padding: '12px', fontSize: '14px' }}>Date</th>
                <th style={{ padding: '12px', fontSize: '14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((cls, index) => (
                <tr key={index} style={{ borderBottom: '1px solid #f1f2f6' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#2d3436' }}>{cls.subject || 'Class Session'}</td>
                  <td style={{ padding: '12px', color: '#636e72' }}>{new Date(cls.startTime).toLocaleDateString()}</td>
                  <td style={{ padding: '12px' }}>
                    {cls.status === 'completed' ? (
                      <span style={{ backgroundColor: '#e8f8f5', color: '#27ae60', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>✅ Completed</span>
                    ) : cls.status === 'cancelled' ? (
                      <span style={{ backgroundColor: '#e8f4fd', color: '#0984e3', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>🔄 Makeup Issued</span>
                    ) : (
                      <span style={{ backgroundColor: '#f1f2f6', color: '#636e72', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>{cls.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* TEACHER STUDY PLAN MODAL */}
      {isPlanModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '15px', width: '600px', maxHeight: '90vh', overflowY: 'auto', color: '#2d3436' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f1f2f6', paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>📝 Manage Monthly Study Plan</h2>
              <button 
                onClick={fetchExistingPlan} 
                disabled={isLoadingPlan}
                style={{ backgroundColor: '#3498db', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                {isLoadingPlan ? 'Loading...' : '🔄 Load Existing Plan'}
              </button>
            </div>
            
            <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div style={{ display: 'flex', gap: '10px', backgroundColor: '#f5f6fa', padding: '10px', borderRadius: '8px' }}>
                <button type="button" onClick={() => setPlanForm({...planForm, isFinalized: false})} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: !planForm.isFinalized ? '#0984e3' : 'transparent', color: !planForm.isFinalized ? 'white' : '#636e72' }}>
                  Phase 1: Draft Goals
                </button>
                <button type="button" onClick={() => setPlanForm({...planForm, isFinalized: true})} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', backgroundColor: planForm.isFinalized ? '#d63031' : 'transparent', color: planForm.isFinalized ? 'white' : '#636e72' }}>
                  Phase 2: Final Grades
                </button>
              </div>

              <div>
                <label style={{ fontWeight: 'bold', fontSize: '14px' }}>Which subjects are they studying?</label>
                <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                  <label><input type="checkbox" checked={planForm.quranEnrolled} onChange={(e) => setPlanForm({...planForm, quranEnrolled: e.target.checked})} /> Quran (Max: {maxScores.quran})</label>
                  <label><input type="checkbox" checked={planForm.arabicEnrolled} onChange={(e) => setPlanForm({...planForm, arabicEnrolled: e.target.checked})} /> Arabic (Max: {maxScores.arabic})</label>
                  <label><input type="checkbox" checked={planForm.islamicEnrolled} onChange={(e) => setPlanForm({...planForm, islamicEnrolled: e.target.checked})} /> Islamic Studies (Max: {maxScores.islamic})</label>
                </div>
              </div>

              {planForm.quranEnrolled && (
                <div style={{ borderLeft: '4px solid #6c5ce7', paddingLeft: '15px' }}>
                  {planForm.isFinalized ? (
                    <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '10px' }}>
                      <h4 style={{ margin: '0 0 10px 0', color: '#6c5ce7' }}>📖 Quran Assessment</h4>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Target Plan:</label>
                      <input type="text" value={planForm.quranPlan} onChange={(e) => setPlanForm({...planForm, quranPlan: e.target.value})} placeholder="e.g., Memorize Surah An-Naba 1-10" style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px', backgroundColor: '#fff' }} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '10px' }}>
                        <input type="checkbox" checked={planForm.quranCompleted} onChange={(e) => setPlanForm({...planForm, quranCompleted: e.target.checked})} style={{ transform: 'scale(1.2)' }} />
                        <span style={{ fontWeight: 'bold', color: '#2d3436' }}>☑ All goals completed successfully</span>
                      </label>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Subject Notes (Optional):</label>
                      <input type="text" placeholder="e.g., Struggled slightly with Tajweed rules..." value={planForm.quranComment} onChange={(e) => setPlanForm({...planForm, quranComment: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px' }} />
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Score (out of {maxScores.quran}):</label>
                      <input type="number" step="0.5" max={maxScores.quran} value={planForm.quranScore} onChange={(e) => setPlanForm({...planForm, quranScore: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #dfe6e9', borderRadius: '4px' }} />
                    </div>
                  ) : (
                    <>
                      <label style={{ fontWeight: 'bold' }}>Quran Draft Plan:</label>
                      <input type="text" value={planForm.quranPlan} onChange={(e) => setPlanForm({...planForm, quranPlan: e.target.value})} placeholder="e.g., Memorize Surah An-Naba 1-10" style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px' }} />
                    </>
                  )}
                </div>
              )}

              {planForm.arabicEnrolled && (
                <div style={{ borderLeft: '4px solid #00b894', paddingLeft: '15px' }}>
                  {planForm.isFinalized ? (
                    <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '10px' }}>
                      <h4 style={{ margin: '0 0 10px 0', color: '#00b894' }}>🗣️ Arabic Assessment</h4>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Target Plan:</label>
                      <input type="text" value={planForm.arabicPlan} onChange={(e) => setPlanForm({...planForm, arabicPlan: e.target.value})} placeholder="e.g., Complete Lesson 10" style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px', backgroundColor: '#fff' }} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '10px' }}>
                        <input type="checkbox" checked={planForm.arabicCompleted} onChange={(e) => setPlanForm({...planForm, arabicCompleted: e.target.checked})} style={{ transform: 'scale(1.2)' }} />
                        <span style={{ fontWeight: 'bold', color: '#2d3436' }}>☑ All goals completed successfully</span>
                      </label>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Subject Notes (Optional):</label>
                      <input type="text" placeholder="e.g., Needs to focus more on vocabulary..." value={planForm.arabicComment} onChange={(e) => setPlanForm({...planForm, arabicComment: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px' }} />
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Score (out of {maxScores.arabic}):</label>
                      <input type="number" step="0.5" max={maxScores.arabic} value={planForm.arabicScore} onChange={(e) => setPlanForm({...planForm, arabicScore: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #dfe6e9', borderRadius: '4px' }} />
                    </div>
                  ) : (
                    <>
                      <label style={{ fontWeight: 'bold' }}>Arabic Draft Plan:</label>
                      <input type="text" value={planForm.arabicPlan} onChange={(e) => setPlanForm({...planForm, arabicPlan: e.target.value})} placeholder="e.g., Complete Lesson 10" style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px' }} />
                    </>
                  )}
                </div>
              )}

              {planForm.islamicEnrolled && (
                <div style={{ borderLeft: '4px solid #fdcb6e', paddingLeft: '15px' }}>
                  {planForm.isFinalized ? (
                    <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '10px' }}>
                      <h4 style={{ margin: '0 0 10px 0', color: '#fdcb6e' }}>🕌 Islamic Studies Assessment</h4>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Target Plan:</label>
                      <input type="text" value={planForm.islamicPlan} onChange={(e) => setPlanForm({...planForm, islamicPlan: e.target.value})} placeholder="e.g., Pages 40-45" style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px', backgroundColor: '#fff' }} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '10px' }}>
                        <input type="checkbox" checked={planForm.islamicCompleted} onChange={(e) => setPlanForm({...planForm, islamicCompleted: e.target.checked})} style={{ transform: 'scale(1.2)' }} />
                        <span style={{ fontWeight: 'bold', color: '#2d3436' }}>☑ All goals completed successfully</span>
                      </label>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Subject Notes (Optional):</label>
                      <input type="text" placeholder="e.g., Excellent understanding..." value={planForm.islamicComment} onChange={(e) => setPlanForm({...planForm, islamicComment: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px' }} />
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Score (out of {maxScores.islamic}):</label>
                      <input type="number" step="0.5" max={maxScores.islamic} value={planForm.islamicScore} onChange={(e) => setPlanForm({...planForm, islamicScore: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #dfe6e9', borderRadius: '4px' }} />
                    </div>
                  ) : (
                    <>
                      <label style={{ fontWeight: 'bold' }}>Islamic Studies Draft Plan:</label>
                      <input type="text" value={planForm.islamicPlan} onChange={(e) => setPlanForm({...planForm, islamicPlan: e.target.value})} placeholder="e.g., Pages 40-45" style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px' }} />
                    </>
                  )}
                </div>
              )}

              {planForm.isFinalized && (
                <div style={{ backgroundColor: '#e8f4fd', padding: '15px', borderRadius: '8px' }}>
                  <label style={{ fontWeight: 'bold', fontSize: '14px', color: '#0984e3' }}>⚡ Quick-Insert General Feedback Template</label>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <select value={planForm.templateCategory} onChange={(e) => setPlanForm({...planForm, templateCategory: e.target.value})} style={{ flex: 2, padding: '8px', borderRadius: '4px', border: '1px solid #dfe6e9' }}>
                      <option value="">-- Select Category --</option>
                      {Object.keys(FEEDBACK_TEMPLATES).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    {planForm.templateCategory && planForm.templateCategory !== "Commendation" && (
                      <select value={planForm.templateSeverity} onChange={(e) => setPlanForm({...planForm, templateSeverity: e.target.value})} style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #dfe6e9' }}>
                        <option value="Minor">Minor</option>
                        <option value="Major">Major</option>
                      </select>
                    )}
                    <button type="button" onClick={handleInsertTemplate} style={{ backgroundColor: '#0984e3', color: 'white', padding: '8px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Insert</button>
                  </div>
                  
                  <textarea 
                    value={planForm.teacherNote} 
                    onChange={(e) => setPlanForm({...planForm, teacherNote: e.target.value})} 
                    placeholder="Final Overall Teacher Report..." 
                    style={{ width: '100%', height: '120px', marginTop: '15px', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #dfe6e9' }} 
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsPlanModalOpen(false)} disabled={isSubmitting} style={{ padding: '10px 15px', cursor: 'pointer', border: '1px solid #b2bec3', borderRadius: '6px', backgroundColor: 'transparent', fontWeight: 'bold', color: '#636e72' }}>Cancel</button>
                <button type="submit" disabled={isSubmitting} style={{ padding: '10px 15px', cursor: 'pointer', backgroundColor: '#00b894', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>
                  {isSubmitting ? 'Saving...' : 'Submit to Admin Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* END CLASS MODAL */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '15px', width: '450px', color: '#2d3436' }}>
            <h2 style={{ margin: '0 0 20px 0' }}>🛑 End Class</h2>
            
            <label style={{ fontWeight: 'bold' }}>Class Notes:</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Write a brief summary of today's class..." style={{ width: '100%', height: '80px', margin: '10px 0', padding: '10px', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid #dfe6e9' }} />

            <div style={{ marginTop: '20px', padding: '15px', background: '#f5f6fa', borderRadius: '10px', border: '1px solid #dfe6e9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 'bold', color: '#2d3436' }}>Step 2: Assign Homework</span>
                <button type="button" onClick={() => window.open(selectedClass?.classroomLink || 'https://classroom.google.com', '_blank')} style={{ background: '#fdcb6e', color: '#2d3436', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>📚 Open Classroom</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '15px' }}>
                <input type="checkbox" id="hwCheck" checked={classroomChecked} onChange={(e) => setClassroomChecked(e.target.checked)} style={{ transform: 'scale(1.2)', cursor: 'pointer' }} />
                <label htmlFor="hwCheck" style={{ cursor: 'pointer', fontSize: '14px', color: '#636e72' }}>☑ I confirm I have checked/uploaded the homework.</label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '25px' }}>
              <button onClick={() => setIsModalOpen(false)} disabled={isSubmitting} style={{ padding: '10px 15px', cursor: isSubmitting ? 'not-allowed' : 'pointer', border: '1px solid #b2bec3', borderRadius: '6px', backgroundColor: 'transparent', fontWeight: 'bold', color: '#636e72' }}>Cancel</button>
              <button disabled={isSubmitting} style={{ padding: '10px 15px', cursor: isSubmitting ? 'not-allowed' : 'pointer', backgroundColor: isSubmitting ? '#b2bec3' : '#00b894', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }} onClick={handleEndClass}>
                {isSubmitting ? 'Ending Class...' : 'Submit & End Class'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REQUEST MAKEUP MODAL */}
      {isMakeupModalOpen && subSummary && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '15px', width: '450px', color: '#2d3436' }}>
            <h2 style={{ margin: '0 0 20px 0' }}>📅 Request Makeup Class</h2>
            
            <form onSubmit={handleRequestMakeup} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ fontWeight: 'bold', fontSize: '14px' }}>Which missed class are you replacing?</label>
                <select required value={selectedOriginalDate} onChange={(e) => setSelectedOriginalDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #dfe6e9', marginTop: '5px', boxSizing: 'border-box' }}>
                  <option value="">-- Select Missed Class --</option>
                  {subSummary.activeMakeups.map((makeup, i) => (
                    <option key={i} value={makeup.originalClassDate}>
                      Missed on {new Date(makeup.originalClassDate).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontWeight: 'bold', fontSize: '14px' }}>Preferred Makeup Date & Time:</label>
                <input type="datetime-local" required value={preferredMakeupDate} onChange={(e) => setPreferredMakeupDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #dfe6e9', marginTop: '5px', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontWeight: 'bold', fontSize: '14px' }}>Additional Notes (Optional):</label>
                <input type="text" placeholder="e.g., Only available after 5 PM" value={makeupRequestNotes} onChange={(e) => setMakeupRequestNotes(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #dfe6e9', marginTop: '5px', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px' }}>
                <button type="button" onClick={() => setIsMakeupModalOpen(false)} disabled={isRequestingMakeup} style={{ padding: '10px 15px', cursor: isRequestingMakeup ? 'not-allowed' : 'pointer', border: '1px solid #b2bec3', borderRadius: '6px', backgroundColor: 'transparent', fontWeight: 'bold', color: '#636e72' }}>Cancel</button>
                <button type="submit" disabled={isRequestingMakeup} style={{ padding: '10px 15px', cursor: isRequestingMakeup ? 'not-allowed' : 'pointer', backgroundColor: isRequestingMakeup ? '#b2bec3' : '#d35400', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>
                  {isRequestingMakeup ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUPPORT FOOTER */}
      <div style={{ backgroundColor: '#2d3436', color: 'white', padding: '30px', borderRadius: '15px', marginTop: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>Need Assistance?</h3>
          <p style={{ margin: 0, color: '#b2bec3', fontSize: '14px' }}>Our admin team is here to help with billing, scheduling, or technical support.</p>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <a href="https://wa.me/201064067519" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <button style={{ backgroundColor: '#25D366', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
              💬 WhatsApp Admin
            </button>
          </a>
          <a href="mailto:admin@learnwithayman.com" style={{ textDecoration: 'none' }}>
            <button style={{ backgroundColor: '#636e72', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ✉️ Email Us
            </button>
          </a>
        </div>
      </div>

    </div>
  );
}

export default Dashboard;