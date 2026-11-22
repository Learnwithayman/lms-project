import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import '../App.css';
import ScheduleEditor from '../components/ScheduleEditor'; // 🗓️ Step 19: easier My Schedule editor

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
  const [nextClassCountdown, setNextClassCountdown] = useState('');

  // ⏰ LATE FLOW (Step 2): progress saved on the server + a 1-second clock for the countdowns
  const [lateProgress, setLateProgress] = useState({});
  const [lateBusy, setLateBusy] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // ⏸️ STUDENT PAUSE (Step 3): students who are away / paused
  const [awayStudents, setAwayStudents] = useState([]);

  // 📋 PLAN & REPORT DEADLINES (Step 5): progress bars, class cards, red panel
  const [myDuties, setMyDuties] = useState(null);
  const [openDutyList, setOpenDutyList] = useState(null);
  const openAsReportRef = useRef(false);

  const navigate = useNavigate();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentClassId, setCurrentClassId] = useState(null);
  const [notes, setNotes] = useState('');
  const [classroomChecked, setClassroomChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isMakeupModalOpen, setIsMakeupModalOpen] = useState(false);
  // 🔁 STEP 7: makeup self-booking (students) + 🗓️ My Schedule (teachers)
  const [makeupInfo, setMakeupInfo] = useState(null);
  const [bookTeacherId, setBookTeacherId] = useState('');
  const [bookStudentId, setBookStudentId] = useState(''); // 👪 which child the makeup is for (brothers / sisters on one link)
  const [freeSlots, setFreeSlots] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [postponingId, setPostponingId] = useState(null);
  const [mySchedule, setMySchedule] = useState(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState({ weekly: [], blocked: [], extra: [] });
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

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

  // ✨ FRONTEND AUTO-LOAD
  useEffect(() => {
    const loadPlanSilently = async () => {
      setIsLoadingPlan(true);
      try {
        const token = localStorage.getItem('token');
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const res = await axios.get(`${API_URL}/api/student/reports/${planStudentIdentifier}/${planForm.monthYear}`, config);
        const forceReport = openAsReportRef.current; // 📋 Step 5: opened from a "Report required" card
        
        if (res.data) {
          const r = res.data;
          setPlanForm(prev => ({
            ...prev,
            isFinalized: forceReport || r.isFinalized || false,
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
        } else {
          setPlanForm(prev => ({
            ...prev,
            isFinalized: forceReport,
            quranEnrolled: false, quranPlan: '', quranScore: '', quranCompleted: false, quranComment: '',
            arabicEnrolled: false, arabicPlan: '', arabicScore: '', arabicCompleted: false, arabicComment: '',
            islamicEnrolled: false, islamicPlan: '', islamicScore: '', islamicCompleted: false, islamicComment: '',
            teacherNote: '',
            templateCategory: '',
            templateSeverity: 'Minor'
          }));
        }
      } catch (error) {
        console.error("Silent auto-load failed:", error);
      } finally {
        setIsLoadingPlan(false);
      }
    };

    if (isPlanModalOpen && planStudentIdentifier) {
      loadPlanSilently();
    }
  }, [isPlanModalOpen, planForm.monthYear, planStudentIdentifier]);

  // ✨ LIVE COUNTDOWN TIMER
  useEffect(() => {
    if (classes.length === 0) return;

    const upcomingClasses = classes.filter(cls => cls.status !== 'completed' && new Date(cls.startTime) > new Date());
    if (upcomingClasses.length === 0) {
      setNextClassCountdown('');
      return;
    }

    const nextClassTime = new Date(upcomingClasses[0].startTime).getTime();

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = nextClassTime - now;

      if (distance < 0) {
        setNextClassCountdown('Class is Live Now!');
        clearInterval(interval);
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setNextClassCountdown(`${days > 0 ? days + 'd ' : ''}${hours}h ${minutes}m ${seconds}s`);
    }, 1000);

    return () => clearInterval(interval);
  }, [classes]);

  const getRecentMonths = () => {
    const months = [];
    const date = new Date();
    for (let i = 0; i < 6; i++) {
      const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      months.push(monthName);
      date.setMonth(date.getMonth() - 1);
    }
    return months;
  };
  const recentMonths = getRecentMonths();

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
      fetchLateProgress(token);
      fetchAwayStudents(token);
      fetchMyDuties(token);
      fetchMySchedule(token);
    } else {
      fetchSubSummary(token);
    }
  }, [navigate]);

  // ⏸️ Step 3: paused / away students → "Student away until…" on their classes
  const fetchAwayStudents = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/schedule/away-students`, config);
      setAwayStudents(res.data || []);
    } catch (error) {
      console.error("Failed to fetch away students:", error);
    }
  };

  // 📋 Step 5: plan / report duties for this teacher
  const fetchMyDuties = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/student/my-duties`, config);
      setMyDuties(res.data || null);
    } catch (error) {
      console.error("Failed to fetch plan/report duties:", error);
    }
  };

  // 'YYYY-MM' → the month text the plan form uses (same format as the month list)
  const monthTextOf = (key) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  // Clicking a "Plan required" / "Report required" card opens the form on the right month and phase
  const openDutyCard = (cls, card) => {
    openAsReportRef.current = card.kind === 'report';
    setPlanStudentIdentifier(cls.studentGroupName || cls.title || cls.studentGroupId);
    setPlanForm(prev => ({ ...prev, monthYear: monthTextOf(card.monthKey), isFinalized: card.kind === 'report' }));
    setIsPlanModalOpen(true);
  };

  const findAwayStudent = (cls) => {
    const code = (cls.studentGroupId || '').replace('https://chat.whatsapp.com/', '').trim();
    const clsName = (cls.studentGroupName || '').toLowerCase().trim();
    return awayStudents.find(s => {
      if (code && s.code && s.code.length > 5 && (code.includes(s.code) || s.code.includes(code))) return true;
      // 🔗 Group fix: any code in the class against any saved code (invite link or old ID)
      if ((cls.studentCodes || []).some(c => (s.codes || []).some(m => m.length > 5 && (c.includes(m) || m.includes(c))))) return true;
      const n = (s.name || '').toLowerCase().trim();
      return clsName && n && (clsName === n || clsName.includes(n) || n.includes(clsName));
    });
  };

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

  // ⏰ LATE FLOW: 1-second clock (teachers only) so countdowns and unlocks update live
  useEffect(() => {
    if (user?.role?.toLowerCase() !== 'teacher') return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [user]);

  const fetchLateProgress = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/schedule/late-progress`, config);
      const map = {};
      (res.data || []).forEach(p => { map[p.classId] = p; });
      setLateProgress(map);
    } catch (error) {
      console.error("Failed to fetch late progress:", error);
    }
  };

  const lateRequestBody = (cls) => ({
    classId: cls.id || cls._id,
    startTime: cls.startTime,
    studentGroupId: cls.studentGroupId,
    studentGroupName: cls.studentGroupName,
    title: cls.title,
    zoomLink: cls.zoomLink || cls.meetingLink
  });

  // ⏰ Send late reminder 1 (minute 3), 2 (minute 8) or 3 (minute 13). The class stays on the dashboard.
  const handleLateReminder = async (cls, step) => {
    const label = step === 1 ? 'the first late reminder' : step === 2 ? 'the second late reminder' : 'the FINAL late reminder';
    if (!window.confirm(`Send ${label} to ${cls.title || 'the student'}'s group?`)) return;
    const classKey = cls.id || cls._id;
    setLateBusy(classKey);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.post(`${API_URL}/api/schedule/late-reminder`, { ...lateRequestBody(cls), step }, config);
      if (res.data.progress) setLateProgress(prev => ({ ...prev, [classKey]: res.data.progress }));
    } catch (error) {
      console.error('Error sending late reminder:', error);
      alert(error.response?.data?.message || '❌ Failed to send the late reminder.');
    } finally {
      setLateBusy(null);
    }
  };

  // ✅ Student joined → "class has started" message to the student group (so parents know)
  const handleStudentJoined = async (cls) => {
    if (!window.confirm(`Confirm that ${cls.title || 'the student'} has joined? A "class has started" message will be sent to the student group.`)) return;
    const classKey = cls.id || cls._id;
    setLateBusy(classKey);
    try {
      const token = localStorage.getItem('token');
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.post(`${API_URL}/api/schedule/student-joined`, lateRequestBody(cls), config);
      if (res.data.progress) setLateProgress(prev => ({ ...prev, [classKey]: res.data.progress }));
    } catch (error) {
      console.error('Error marking student joined:', error);
      alert(error.response?.data?.message || '❌ Failed to mark the student as joined.');
    } finally {
      setLateBusy(null);
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
          isFinalized: r.isFinalized || false,
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
        alert(`ℹ️ No existing plan found for ${planForm.monthYear}. You can create one now.`);
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
    if (status === 'Absent' || status === 'Late') {
      const confirmAction = window.confirm(`Are you sure you want to record ${cls.title || 'this student'} as ${status.toUpperCase()}?`);
      if (!confirmAction) return; 
    }

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

      // ⏰ Step 2 fix: only Absent removes the class. Late keeps it on the dashboard.
      if (status === 'Absent') {
        setClasses(prevClasses => prevClasses.filter(c => (c.id || c._id) !== (cls.id || cls._id)));
      }
      
    } catch (error) {
      console.error('Error marking attendance:', error);
      alert('Failed to mark attendance.');
    }
  };

  // ==========================================
  // 🔁 STEP 7: POSTPONE + MAKEUP SELF-BOOKING (students)
  // ==========================================
  const authConfig = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

  const loadFreeSlots = async (teacherId, studentId = bookStudentId) => {
    setBookTeacherId(teacherId);
    setFreeSlots(null);
    setSelectedSlot('');
    if (!teacherId) return;
    try {
      const res = await axios.get(`${API_URL}/api/schedule/free-slots?teacherId=${teacherId}${studentId ? `&studentId=${studentId}` : ''}`, authConfig());
      setFreeSlots(res.data);
    } catch (error) {
      setFreeSlots({ error: error.response?.data?.message || 'Could not load free times.' });
    }
  };

  const openBooking = async (preferredTeacherId = null, preferredStudentId = null) => {
    setIsMakeupModalOpen(true);
    setMakeupInfo(null);
    setFreeSlots(null);
    setSelectedSlot('');
    try {
      const res = await axios.get(`${API_URL}/api/schedule/makeup-info`, authConfig());
      setMakeupInfo(res.data);
      // 👪 the child: the one just postponed, else me if I have credits, else the first child with credits
      const children = res.data.children || [];
      const child = preferredStudentId || (children.some(c => c.id === res.data.meId) ? res.data.meId : (children[0]?.id || res.data.meId || ''));
      setBookStudentId(child);
      const teachers = res.data.teachers || [];
      const pick = preferredTeacherId || (teachers.length === 1 ? teachers[0].id : '');
      if (pick) loadFreeSlots(pick, child);
    } catch (error) {
      setMakeupInfo({ error: error.response?.data?.message || 'Could not load your makeup credits.' });
    }
  };

  const handlePostpone = async (cls) => {
    if (!window.confirm(`Postpone "${cls.title}"?\n\nYou will get a makeup credit and choose a new time with your teacher.`)) return;
    setPostponingId(cls.id);
    try {
      let res;
      try {
        res = await axios.post(`${API_URL}/api/schedule/postpone`, { eventId: cls.id }, authConfig());
      } catch (error) {
        // 👪 A class of several children (brothers / sisters): ask which child, then postpone for that child
        const choices = error.response?.status === 409 ? (error.response.data?.choices || []) : [];
        if (!choices.length) throw error;
        const answer = window.prompt(`Which child is this class for?\n\n${choices.map((c, i) => `${i + 1}) ${c.name}`).join('\n')}\n\nType the number:`);
        const chosen = choices[Number(answer) - 1];
        if (!chosen) return;
        res = await axios.post(`${API_URL}/api/schedule/postpone`, { eventId: cls.id, studentId: chosen.id }, authConfig());
      }
      const token = localStorage.getItem('token');
      fetchClasses(token);
      fetchSubSummary(token);
      if (res.data.fresh) {
        openBooking(res.data.teacherId, res.data.studentId);
      } else {
        alert("✅ Class postponed.\n\nYour teacher is updating their schedule. You will get a WhatsApp message when you can choose your new time.");
      }
    } catch (error) {
      alert(`❌ ${error.response?.data?.message || 'Could not postpone this class.'}`);
    } finally {
      setPostponingId(null);
    }
  };

  const handleBookSlot = async () => {
    if (!selectedSlot || !bookTeacherId) return;
    setIsBooking(true);
    try {
      const booked = await axios.post(`${API_URL}/api/schedule/book-makeup`, { teacherId: bookTeacherId, start: selectedSlot, studentId: bookStudentId || undefined }, authConfig());
      alert(`✅ ${(makeupInfo?.children || []).length > 1 && booked.data.studentName ? `${booked.data.studentName}'s` : 'Your'} makeup class is booked for ${new Date(selectedSlot).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}!`);
      setIsMakeupModalOpen(false);
      const token = localStorage.getItem('token');
      fetchClasses(token);
      fetchSubSummary(token);
    } catch (error) {
      alert(`❌ ${error.response?.data?.message || 'Could not book this time.'}`);
      if (error.response?.status === 409) loadFreeSlots(bookTeacherId);
    } finally {
      setIsBooking(false);
    }
  };

  // ==========================================
  // 🗓️ STEP 7: MY SCHEDULE (teachers)
  // ==========================================

  const fetchMySchedule = async (token) => {
    try {
      const res = await axios.get(`${API_URL}/api/schedule/my-availability`, { headers: { Authorization: `Bearer ${token}` } });
      setMySchedule(res.data);
    } catch (error) {
      console.error('Failed to fetch my schedule:', error);
    }
  };

  const openScheduleEditor = () => {
    const av = mySchedule?.availability || {};
    setScheduleDraft({ weekly: [...(av.weekly || [])], blocked: [...(av.blocked || [])], extra: [...(av.extra || [])] });
    setIsScheduleOpen(true);
  };

  const handleSaveSchedule = async () => {
    setIsSavingSchedule(true);
    try {
      const res = await axios.put(`${API_URL}/api/schedule/my-availability`, scheduleDraft, authConfig());
      setMySchedule(res.data);
      setIsScheduleOpen(false);
      alert(res.data.notified?.length ? `✅ Schedule saved. ${res.data.notified.join(', ')} can now choose a new time.` : '✅ Schedule saved.');
    } catch (error) {
      alert(`❌ ${error.response?.data?.message || 'Could not save your schedule.'}`);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleConfirmSchedule = async () => {
    try {
      const res = await axios.post(`${API_URL}/api/schedule/my-availability/confirm`, {}, authConfig());
      setMySchedule(res.data);
      alert(res.data.notified?.length ? `✅ Thank you! ${res.data.notified.join(', ')} can now choose a new time.` : '✅ Thank you! Your hours are confirmed for this week.');
    } catch (error) {
      alert(`❌ ${error.response?.data?.message || 'Could not confirm your schedule.'}`);
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
      alert(planForm.isFinalized ? `✅ Phase 2 Graded Report for ${planForm.monthYear} submitted for Admin Approval!` : `✅ Phase 1 Draft Plan for ${planForm.monthYear} submitted for Admin Approval!`);
      
      setIsPlanModalOpen(false);

      const cleanPlanName = planStudentIdentifier.split('-')[0].trim().toLowerCase();
      setReportStatuses(prev => ({
        ...prev,
        [cleanPlanName]: planForm.isFinalized ? '🟡 Phase 2 Pending' : '🔵 Phase 1 Drafted',
        [planStudentIdentifier.toLowerCase()]: planForm.isFinalized ? '🟡 Phase 2 Pending' : '🔵 Phase 1 Drafted'
      }));

      fetchReportStatuses(token); 
      fetchMyDuties(token); // 📋 Step 5: refresh progress after saving
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
  const liveClass = classes.find(cls => cls.status !== 'completed' && isClassLive(cls.startTime));

  return (
    <div className="dashboard-container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      
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

          {/* 🔄 Step 17: shown only when PayPal shows this cycle is not paid yet (the cycle itself always renews) */}
          {subSummary?.cycle?.paymentDue && (
            <div style={{ backgroundColor: '#ff7675', color: 'white', padding: '20px', borderRadius: '10px', marginBottom: '30px', fontWeight: 'bold', textAlign: 'center', boxShadow: '0 4px 15px rgba(255, 118, 117, 0.3)', fontSize: '16px' }}>
              {subSummary.cycle.billingType === 'class_package'
                ? '⚠️ Payment Due: Your class package is complete. Please renew your package to continue.'
                : '⚠️ Payment Due: The payment for your current cycle has not been received yet.'}
              {subSummary.cycle.billingType === 'subscription' && (
                <div style={{ fontWeight: 'normal', fontSize: '14px', marginTop: '6px' }}>PayPal will try your subscription payment again. Please make sure your PayPal account can be charged.</div>
              )}
              {subSummary.cycle.payLink && (
                <div style={{ marginTop: '12px' }}>
                  <a href={subSummary.cycle.payLink} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', backgroundColor: 'white', color: '#d63031', padding: '10px 22px', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold' }}>💳 Pay here</a>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="dashboard-header">
          <h1>👋 Welcome, {user.name}</h1>
          <button onClick={handleLogout} className="logout-btn">Logout</button>
        </div>
      )}

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

      {user?.role?.toLowerCase() === 'teacher' && earnings && (
        <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #c3e6cb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
          <div>
            <h2 style={{ margin: '0 0 5px 0' }}>💰 Current Month Earnings</h2>
            <p style={{ margin: 0 }}>You have taught <strong>{earnings.totalHours} hours</strong> this month at <strong>${earnings.hourlyRate}/hr</strong>.</p>
          </div>
          <div style={{ fontSize: '36px', fontWeight: 'bold' }}>${earnings.currentEarnings}</div>
        </div>
      )}

      {/* 🗓️ MY SCHEDULE (Step 7): weekly check + students waiting for an update */}
      {user?.role?.toLowerCase() === 'teacher' && mySchedule && (() => {
        const waiting = mySchedule.waitingStudents || [];
        const needsAction = !mySchedule.fresh || waiting.length > 0;
        return (
          <div style={{ backgroundColor: needsAction ? '#fff3cd' : 'white', border: needsAction ? '2px solid #f39c12' : '1px solid #dfe6e9', padding: '15px 20px', borderRadius: '10px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ color: '#2d3436' }}>
              {waiting.length > 0 ? (
                <strong>🔁 {waiting.join(', ')} postponed and {waiting.length === 1 ? 'is' : 'are'} waiting for your schedule update.</strong>
              ) : !mySchedule.fresh ? (
                <strong>🗓️ Weekly schedule check: please review your free hours for this week.</strong>
              ) : (
                <strong>🗓️ My Schedule</strong>
              )}
              <div style={{ fontSize: '12px', color: '#636e72', marginTop: '4px' }}>
                {mySchedule.availability?.confirmedAt ? `Last confirmed: ${new Date(mySchedule.availability.confirmedAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not set yet. Please add your free hours.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={openScheduleEditor} style={{ backgroundColor: '#0984e3', color: 'white', padding: '9px 14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>🗓️ My Schedule</button>
              {needsAction && (
                <button onClick={handleConfirmSchedule} style={{ backgroundColor: '#00b894', color: 'white', padding: '9px 14px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {waiting.length > 0 ? '✅ Schedule updated' : '✅ My hours are correct'}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* 📋 PLAN & REPORT DEADLINES (Step 5): red panel + progress bars */}
      {user?.role?.toLowerCase() === 'teacher' && myDuties && (
        <div style={{ marginBottom: '20px' }}>
          {myDuties.panel?.length > 0 && (
            <div style={{ backgroundColor: '#fdecea', border: '2px solid #d63031', color: '#c0392b', padding: '15px 20px', borderRadius: '10px', marginBottom: '15px' }}>
              {myDuties.panel.map((p, i) => (
                <p key={i} style={{ margin: i ? '8px 0 0 0' : 0, fontWeight: 'bold' }}>
                  🚨 Immediate action required: {p.kind === 'plan'
                    ? `study plans for ${p.month} are missing for: ${p.students.join(', ')}. Please save them now.`
                    : `the ${p.month} report for ${p.students[0]} is missing. Please save it now.`}
                </p>
              ))}
            </div>
          )}
          {[
            { id: 'plans', on: myDuties.progress?.plansOn, icon: '📋', label: 'Plans', data: myDuties.progress?.plans },
            { id: 'reports', on: myDuties.progress?.reportsOn, icon: '📝', label: 'Reports', data: myDuties.progress?.reports }
          ].filter(b => b.on && b.data && b.data.total > 0).map(b => {
            const pct = Math.round((b.data.done / b.data.total) * 100);
            const complete = b.data.done === b.data.total;
            return (
              <div key={b.id} onClick={() => setOpenDutyList(openDutyList === b.id ? null : b.id)} style={{ backgroundColor: 'white', padding: '12px 16px', borderRadius: '10px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', cursor: complete ? 'default' : 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '14px', color: '#2d3436', marginBottom: '8px', gap: '10px', flexWrap: 'wrap' }}>
                  <span>{b.icon} {b.label} for {myDuties.progress.month}: {b.data.done} of {b.data.total} saved</span>
                  <span style={{ color: complete ? '#00b894' : '#636e72', fontSize: '12px' }}>{complete ? '✅ All done' : (openDutyList === b.id ? '▲ Hide' : '▼ Show missing')}</span>
                </div>
                <div style={{ height: '8px', backgroundColor: '#f1f2f6', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', backgroundColor: complete ? '#00b894' : '#0984e3' }}></div>
                </div>
                {openDutyList === b.id && !complete && (
                  <p style={{ margin: '10px 0 0 0', fontSize: '13px', color: '#636e72' }}>Missing: {b.data.missing.join(', ')}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {user?.role?.toLowerCase() !== 'teacher' && subSummary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '25px', marginBottom: '40px' }}>
          
          <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '15px', borderTop: '5px solid #0984e3', boxShadow: '0 10px 25px rgba(0,0,0,0.04)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#2d3436', fontSize: '20px', display: 'flex', justifyContent: 'space-between' }}>
              <span>📅 Current Plan</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                {/* ✨ NEW PAYPAL BADGES */}
                {user.paypal?.billingType === 'subscription' && (
                  <span style={{ fontSize: '11px', backgroundColor: '#0984e3', color: 'white', padding: '4px 10px', borderRadius: '12px', alignSelf: 'center' }}>🔄 PayPal Auto-Subscription</span>
                )}
                {user.paypal?.billingType === 'recurring_invoice' && (
                  <span style={{ fontSize: '11px', backgroundColor: '#8e44ad', color: 'white', padding: '4px 10px', borderRadius: '12px', alignSelf: 'center' }}>🧾 PayPal Recurring Invoice</span>
                )}
                
                {subSummary.subscription?.status === 'active' ? (
                  <span style={{ fontSize: '12px', backgroundColor: '#00b894', color: 'white', padding: '4px 10px', borderRadius: '12px', alignSelf: 'center' }}>ACTIVE</span>
                ) : (
                  <span style={{ fontSize: '12px', backgroundColor: '#b2bec3', color: 'white', padding: '4px 10px', borderRadius: '12px', alignSelf: 'center' }}>INACTIVE</span>
                )}
              </div>
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

                {/* 🔄 Step 17: classes left in this cycle */}
                {subSummary.cycle?.mode === 'calculated' && (
                  <p style={{ margin: '-10px 0 15px 0', fontSize: '13px', color: '#636e72' }}>
                    {subSummary.cycle.remaining} {subSummary.cycle.remaining === 1 ? 'class' : 'classes'} left{subSummary.cycle.cycleEnd ? ` · ${subSummary.cycle.billingType === 'class_package' ? 'last class of this package' : 'cycle ends'} ${new Date(subSummary.cycle.cycleEnd).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}` : ''}
                  </p>
                )}

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
                  onClick={() => openBooking()}
                  style={{ width: '100%', padding: '12px', backgroundColor: '#d35400', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}>
                  📅 Schedule Makeup
                </button>
              </>
            )}
          </div>
        </div>
      )}

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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>🗓️ Your Schedule</h2>
      </div>
      
      <div style={{ display: 'grid', gap: '20px', marginBottom: '40px' }}>
        {classes.length === 0 ? (
           <p style={{ fontStyle: 'italic', color: 'gray' }}>No upcoming classes found on your calendar.</p>
        ) : (
          classes.filter(cls => cls.status !== 'completed').map((cls, idx) => {
            const isLive = isClassLive(cls.startTime);
            const classIdentifier = cls._id || cls.id;
            
            // The Fuzzy Matcher
            const rawIdentifier = (cls.studentGroupName || cls.title || cls.studentGroupId || '').toLowerCase();
            const cleanKey = rawIdentifier.split('-')[0].trim();
            
            let planStatus = reportStatuses[cleanKey] || reportStatuses[rawIdentifier];
            
            if (!planStatus && Object.keys(reportStatuses).length > 0) {
              const matchedDbName = Object.keys(reportStatuses).find(dbName => 
                cleanKey.length > 2 && dbName.includes(cleanKey)
              );
              if (matchedDbName) {
                planStatus = reportStatuses[matchedDbName];
              } else {
                planStatus = '⚪ No Plan Yet';
              }
            } else if (!planStatus) {
              planStatus = '⚪ No Plan Yet';
            }

            // ✨ Determine exact start and end times dynamically
            const startDateObj = new Date(cls.startTime);
            const endDateObj = cls.endTime ? new Date(cls.endTime) : new Date(startDateObj.getTime() + (cls.durationMinutes || 60) * 60000);
            const isNextClass = idx === 0 && !isLive && startDateObj > new Date();

            // ⏰ LATE FLOW (Step 2): clock fixed to the class start
            const LATE_STEP_MIN = { 1: 3, 2: 8, 3: 13 };
            const startMs = startDateObj.getTime();
            const minutesIn = (nowTick - startMs) / 60000;
            const lateKey = cls.id || cls._id;
            const lp = lateProgress[lateKey];
            const sentSteps = lp?.reminders ? lp.reminders.map(r => r.step) : [];
            const lastLateStep = sentSteps.length ? Math.max(...sentSteps) : 0;
            const lastLateSent = lp?.reminders?.find(r => r.step === lastLateStep)?.sentAt;
            const studentJoined = !!lp?.joinedAt;
            const lateUnlockMs = startMs + LATE_STEP_MIN[1] * 60000;
            const nextLateStep = lastLateStep < 3 ? lastLateStep + 1 : null;
            const nextLateUnlockMs = nextLateStep ? startMs + LATE_STEP_MIN[nextLateStep] * 60000 : null;
            const showLateBanner = lastLateStep > 0 || studentJoined;
            const isLateBusy = lateBusy === lateKey;
            const fmtCountdown = (ms) => {
              const s = Math.max(0, Math.ceil(ms / 1000));
              return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
            };
            const fmtClock = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div key={classIdentifier} className="card" style={{ borderLeft: isLive ? '5px solid #2ecc71' : '5px solid #0984e3', borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.03)', backgroundColor: isLive ? '#f0fff4' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 10px 0', color: '#2d3436' }}>
                      📚 {cls.title || cls.subject}
                      {isLive && <span style={{ marginLeft: '10px', backgroundColor: '#2ecc71', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>LIVE NOW</span>}
                    </h3>
                    
                    {/* ✨ EXACT START AND END TIMES DISPLAY */}
                    <p style={{ margin: '0 0 15px 0', color: '#636e72', fontSize: '15px' }}>
                      <strong>🗓️ Date:</strong> {startDateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}<br/>
                      <strong>⏰ Exact Time:</strong> {startDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {endDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    
                    {/* ✨ LIVE COUNTDOWN TIMER (Only for the immediate next class) */}
                    {/* ⏸️ STUDENT AWAY BADGE (Step 3) */}
                    {user?.role?.toLowerCase() === 'teacher' && (() => {
                      const away = findAwayStudent(cls);
                      if (!away) return null;
                      const until = away.returnDate ? new Date(away.returnDate).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', day: 'numeric' }) : '?';
                      return (
                        <div style={{ display: 'inline-block', backgroundColor: '#f4ecf7', color: '#6c3483', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', marginBottom: '15px', marginRight: '10px', border: '1px solid #d2b4de' }}>
                          {away.kind === 'away' ? '🧳 Student away' : '⏸️ Student paused'} until {until}. No need to wait for this class.
                        </div>
                      );
                    })()}

                    {/* 📋 PLAN / REPORT REQUIRED CARDS (Step 5) */}
                    {user?.role?.toLowerCase() === 'teacher' && (myDuties?.cards?.[cls.id] || []).map((card, cardIdx) => (
                      <button key={cardIdx} onClick={() => openDutyCard(cls, card)} title="Open the form for this month" style={{ display: 'inline-block', backgroundColor: card.kind === 'plan' ? '#e8f4fd' : '#fdecea', color: card.kind === 'plan' ? '#0984e3' : '#d63031', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', marginBottom: '15px', marginRight: '10px', border: card.kind === 'plan' ? '1px solid #74b9ff' : '1px solid #ff7675', cursor: 'pointer' }}>
                        {card.kind === 'plan' ? '📋 Plan required' : '📝 Report required'} ({card.month})
                      </button>
                    ))}

                    {isNextClass && nextClassCountdown && (
                      <div style={{ display: 'inline-block', backgroundColor: '#fff3cd', color: '#d35400', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', marginBottom: '15px', border: '1px solid #ffe69c' }}>
                        ⏳ Starts in: {nextClassCountdown}
                      </div>
                    )}
                  </div>
                  
                  {user?.role?.toLowerCase() === 'teacher' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                      <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', backgroundColor: '#f1f2f6', color: '#2d3436', fontWeight: 'bold' }}>
                        {planStatus}
                      </span>
                      <button 
                        onClick={() => {
                          openAsReportRef.current = false;
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
                      {!showLateBanner && (
                        nowTick < lateUnlockMs ? (
                          <button disabled style={{ backgroundColor: '#dfe6e9', color: '#636e72', padding: '10px 15px', border: 'none', borderRadius: '6px', cursor: 'not-allowed', fontWeight: 'bold' }}>
                            {isLive ? `⏳ Late available in ${fmtCountdown(lateUnlockMs - nowTick)}` : '🏃‍♂️ Late'}
                          </button>
                        ) : (
                          <button onClick={() => handleLateReminder(cls, 1)} disabled={isLateBusy} style={{ backgroundColor: '#fdcb6e', color: 'black', padding: '10px 15px', border: 'none', borderRadius: '6px', cursor: isLateBusy ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>🏃‍♂️ Late</button>
                        )
                      )}
                      <button onClick={() => handleAttendance(cls, 'Absent')} style={{ backgroundColor: '#636e72', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>❌ Absent</button>
                      <button onClick={() => { setCurrentClassId(classIdentifier); setIsModalOpen(true); }} style={{ backgroundColor: '#d63031', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>🛑 End Class</button>
                    </>
                  )}

                  {/* 🔁 STEP 7: student postpone (5+ hours before the class) */}
                  {user?.role?.toLowerCase() === 'student' && cls.id && (
                    startDateObj.getTime() - nowTick >= 5 * 60 * 60 * 1000 ? (
                      <button onClick={() => handlePostpone(cls)} disabled={postponingId === cls.id} style={{ backgroundColor: '#6c5ce7', color: 'white', padding: '10px 15px', border: 'none', borderRadius: '6px', cursor: postponingId === cls.id ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                        {postponingId === cls.id ? 'Postponing...' : '🔁 Postpone'}
                      </button>
                    ) : (
                      <span title="Classes can be postponed online up to 5 hours before they start. For an emergency, please contact the admin." style={{ color: '#b2bec3', fontSize: '13px', fontWeight: 'bold' }}>🔒 Postpone closed (under 5 hours)</span>
                    )
                  )}
                </div>

                {/* ⏰ LATE FLOW BANNER (Step 2) */}
                {user?.role?.toLowerCase() === 'teacher' && showLateBanner && (
                  studentJoined ? (
                    <div style={{ marginTop: '15px', padding: '12px 15px', borderRadius: '8px', backgroundColor: '#eafaf1', border: '1px solid #2ecc71', color: '#1e8449', fontWeight: 'bold', fontSize: '14px' }}>
                      ✅ Student has joined. "Class has started" message sent at {fmtClock(lp.joinedAt)}.
                    </div>
                  ) : minutesIn >= 15 ? (
                    <div style={{ marginTop: '15px', padding: '12px 15px', borderRadius: '8px', backgroundColor: '#fdecea', border: '1px solid #d63031', color: '#c0392b', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <strong>⛔ 15 minutes have passed. Please record this class as Absent.</strong>
                      <button onClick={() => handleStudentJoined(cls)} disabled={isLateBusy} style={{ backgroundColor: '#2ecc71', color: 'white', padding: '8px 12px', border: 'none', borderRadius: '6px', cursor: isLateBusy ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>✅ Student has joined</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: '15px', padding: '12px 15px', borderRadius: '8px', backgroundColor: '#fff8e1', border: '1px solid #fdcb6e', color: '#7d6608', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <strong>📨 Late reminder {lastLateStep} of 3 sent{lastLateSent ? ` at ${fmtClock(lastLateSent)}` : ''}.</strong><br/>
                        {nextLateStep
                          ? (nowTick < nextLateUnlockMs ? `⏳ Reminder ${nextLateStep} available in ${fmtCountdown(nextLateUnlockMs - nowTick)}` : `Reminder ${nextLateStep} is ready to send.`)
                          : `⏳ Waiting period ends in ${fmtCountdown(startMs + 15 * 60000 - nowTick)}`}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {nextLateStep && nowTick >= nextLateUnlockMs && (
                          <button onClick={() => handleLateReminder(cls, nextLateStep)} disabled={isLateBusy} style={{ backgroundColor: '#fdcb6e', color: 'black', padding: '8px 12px', border: 'none', borderRadius: '6px', cursor: isLateBusy ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                            📨 Send reminder {nextLateStep}
                          </button>
                        )}
                        <button onClick={() => handleStudentJoined(cls)} disabled={isLateBusy} style={{ backgroundColor: '#2ecc71', color: 'white', padding: '8px 12px', border: 'none', borderRadius: '6px', cursor: isLateBusy ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>✅ Student has joined</button>
                      </div>
                    </div>
                  )
                )}
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #f1f2f6', paddingBottom: '10px' }}>
        <h2 style={{ margin: '0' }}>🕰 Class History</h2>
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
                {isLoadingPlan ? 'Loading...' : '🔄 Refresh Plan'}
              </button>
            </div>
            
            <form onSubmit={handleSavePlan} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              <div style={{ backgroundColor: '#f1f2f6', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#2d3436' }}>📅 Select Report / Plan Month:</label>
                <select 
                  value={planForm.monthYear} 
                  onChange={(e) => setPlanForm({...planForm, monthYear: e.target.value})}
                  style={{ padding: '8px', borderRadius: '6px', border: '1px solid #dfe6e9', backgroundColor: 'white', fontWeight: 'bold', fontSize: '14px' }}
                >
                  {[...new Set([planForm.monthYear, ...recentMonths])].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <span style={{ fontSize: '11px', color: '#636e72' }}>Select past months (e.g., September) to submit missed reports.</span>
              </div>

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
                      <textarea value={planForm.quranPlan} onChange={(e) => setPlanForm({...planForm, quranPlan: e.target.value})} placeholder="e.g., Memorize Surah An-Naba 1-10" style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px', backgroundColor: '#fff', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '10px' }}>
                        <input type="checkbox" checked={planForm.quranCompleted} onChange={(e) => setPlanForm({...planForm, quranCompleted: e.target.checked})} style={{ transform: 'scale(1.2)' }} />
                        <span style={{ fontWeight: 'bold', color: '#2d3436' }}>☑ All goals completed successfully</span>
                      </label>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Subject Notes (Optional):</label>
                      <textarea placeholder="e.g., Struggled slightly with Tajweed rules..." value={planForm.quranComment} onChange={(e) => setPlanForm({...planForm, quranComment: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }} />
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Score (out of {maxScores.quran}):</label>
                      <input type="number" step="0.5" max={maxScores.quran} value={planForm.quranScore} onChange={(e) => setPlanForm({...planForm, quranScore: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #dfe6e9', borderRadius: '4px' }} />
                    </div>
                  ) : (
                    <>
                      <label style={{ fontWeight: 'bold' }}>Quran Draft Plan:</label>
                      <textarea value={planForm.quranPlan} onChange={(e) => setPlanForm({...planForm, quranPlan: e.target.value})} placeholder="e.g., Memorize Surah An-Naba 1-10" style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }} />
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
                      <textarea value={planForm.arabicPlan} onChange={(e) => setPlanForm({...planForm, arabicPlan: e.target.value})} placeholder="e.g., Complete Lesson 10" style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px', backgroundColor: '#fff', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '10px' }}>
                        <input type="checkbox" checked={planForm.arabicCompleted} onChange={(e) => setPlanForm({...planForm, arabicCompleted: e.target.checked})} style={{ transform: 'scale(1.2)' }} />
                        <span style={{ fontWeight: 'bold', color: '#2d3436' }}>☑ All goals completed successfully</span>
                      </label>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Subject Notes (Optional):</label>
                      <textarea placeholder="e.g., Needs to focus more on vocabulary..." value={planForm.arabicComment} onChange={(e) => setPlanForm({...planForm, arabicComment: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }} />
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Score (out of {maxScores.arabic}):</label>
                      <input type="number" step="0.5" max={maxScores.arabic} value={planForm.arabicScore} onChange={(e) => setPlanForm({...planForm, arabicScore: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #dfe6e9', borderRadius: '4px' }} />
                    </div>
                  ) : (
                    <>
                      <label style={{ fontWeight: 'bold' }}>Arabic Draft Plan:</label>
                      <textarea value={planForm.arabicPlan} onChange={(e) => setPlanForm({...planForm, arabicPlan: e.target.value})} placeholder="e.g., Complete Lesson 10" style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }} />
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
                      <textarea value={planForm.islamicPlan} onChange={(e) => setPlanForm({...planForm, islamicPlan: e.target.value})} placeholder="e.g., Pages 40-45" style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px', backgroundColor: '#fff', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '10px' }}>
                        <input type="checkbox" checked={planForm.islamicCompleted} onChange={(e) => setPlanForm({...planForm, islamicCompleted: e.target.checked})} style={{ transform: 'scale(1.2)' }} />
                        <span style={{ fontWeight: 'bold', color: '#2d3436' }}>☑ All goals completed successfully</span>
                      </label>
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Subject Notes (Optional):</label>
                      <textarea placeholder="e.g., Excellent understanding..." value={planForm.islamicComment} onChange={(e) => setPlanForm({...planForm, islamicComment: e.target.value})} style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }} />
                      <label style={{ fontWeight: 'bold', fontSize: '13px' }}>Score (out of {maxScores.islamic}):</label>
                      <input type="number" step="0.5" max={maxScores.islamic} value={planForm.islamicScore} onChange={(e) => setPlanForm({...planForm, islamicScore: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #dfe6e9', borderRadius: '4px' }} />
                    </div>
                  ) : (
                    <>
                      <label style={{ fontWeight: 'bold' }}>Islamic Studies Draft Plan:</label>
                      <textarea value={planForm.islamicPlan} onChange={(e) => setPlanForm({...planForm, islamicPlan: e.target.value})} placeholder="e.g., Pages 40-45" style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #dfe6e9', borderRadius: '4px', minHeight: '60px', resize: 'vertical', fontFamily: 'inherit' }} />
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
                    style={{ width: '100%', minHeight: '120px', marginTop: '15px', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #dfe6e9', resize: 'vertical', fontFamily: 'inherit' }} 
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
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Write a brief summary of today's class..." style={{ width: '100%', height: '80px', margin: '10px 0', padding: '10px', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid #dfe6e9', resize: 'vertical', fontFamily: 'inherit' }} />

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

      {/* 📅 STEP 7: BOOK A MAKEUP CLASS (students) */}
      {isMakeupModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '15px', width: '520px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#2d3436' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2 style={{ margin: 0 }}>📅 Book a makeup class</h2>
              <button onClick={() => setIsMakeupModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            </div>

            {!makeupInfo ? <p>Loading...</p> : makeupInfo.error ? <p style={{ color: '#d63031' }}>{makeupInfo.error}</p> : (
              <>
                {/* 👪 Brothers / sisters on one group link: choose the child, each child's own credits */}
                {(makeupInfo.children || []).length > 1 && (
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '14px' }}>👪 Makeup for:</label>
                    <select value={bookStudentId} onChange={(e) => { setBookStudentId(e.target.value); if (bookTeacherId) loadFreeSlots(bookTeacherId, e.target.value); }} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dfe6e9', marginTop: '5px' }}>
                      {makeupInfo.children.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                {(() => {
                  const family = (makeupInfo.children || []).length > 1;
                  const mine = family ? makeupInfo.credits.filter(c => c.studentId === bookStudentId) : makeupInfo.credits;
                  const childName = family ? (makeupInfo.children.find(c => c.id === bookStudentId)?.name || '') : '';
                  return (
                    <p style={{ margin: '0 0 15px 0', color: '#636e72' }}>
                      🎒 {family ? <><strong>{childName}</strong> has</> : 'You have'} <strong>{mine.length}</strong> makeup credit{mine.length === 1 ? '' : 's'}.
                      {mine[0] && ` The first expires on ${new Date(mine[0].expirationDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.`}
                    </p>
                  );
                })()}

                {makeupInfo.credits.length > 0 && makeupInfo.teachers.length > 1 && (
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '14px' }}>Choose your teacher:</label>
                    <select value={bookTeacherId} onChange={(e) => loadFreeSlots(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #dfe6e9', marginTop: '5px' }}>
                      <option value="">-- Select teacher --</option>
                      {makeupInfo.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}

                {makeupInfo.credits.length > 0 && makeupInfo.teachers.length === 0 && (
                  <p style={{ color: '#d35400' }}>We couldn't find your teacher automatically. Please contact the admin to book your makeup class.</p>
                )}

                {bookTeacherId && (
                  !freeSlots ? <p>Loading free times...</p>
                  : freeSlots.error ? <p style={{ color: '#d63031' }}>{freeSlots.error}</p>
                  : freeSlots.noCredit ? <p style={{ color: '#636e72' }}>You have no makeup credit to use.</p>
                  : !freeSlots.fresh ? <p style={{ color: '#d35400', fontWeight: 'bold' }}>⏳ Your teacher is updating their schedule. You will get a WhatsApp message when you can choose a time.</p>
                  : freeSlots.slots.length === 0 ? <p style={{ color: '#d35400', fontWeight: 'bold' }}>No free times yet, the admin will help you. 🌿</p>
                  : (() => {
                    const groups = {};
                    freeSlots.slots.forEach(slot => {
                      const k = new Date(slot).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
                      (groups[k] = groups[k] || []).push(slot);
                    });
                    return (
                      <>
                        <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#636e72' }}>Times are shown in your own time zone. Choose one:</p>
                        {Object.entries(groups).map(([dayLabel, daySlots]) => (
                          <div key={dayLabel} style={{ marginBottom: '12px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '6px' }}>{dayLabel}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {daySlots.map(slot => (
                                <button key={slot} type="button" onClick={() => setSelectedSlot(slot)} style={{ padding: '6px 10px', borderRadius: '6px', border: selectedSlot === slot ? '2px solid #00b894' : '1px solid #dfe6e9', backgroundColor: selectedSlot === slot ? '#eafaf1' : 'white', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                                  {new Date(slot).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        <button onClick={handleBookSlot} disabled={!selectedSlot || isBooking} style={{ width: '100%', marginTop: '10px', padding: '12px', backgroundColor: !selectedSlot || isBooking ? '#b2bec3' : '#00b894', color: 'white', border: 'none', borderRadius: '8px', cursor: !selectedSlot || isBooking ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                          {isBooking ? 'Booking...' : selectedSlot ? `✅ Book ${new Date(selectedSlot).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Choose a time'}
                        </button>
                      </>
                    );
                  })()
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 🗓️ STEP 7: MY SCHEDULE EDITOR (teachers) */}
      {isScheduleOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '15px', width: '560px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#2d3436' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
              <h2 style={{ margin: 0 }}>🗓️ My Schedule</h2>
              <button onClick={() => setIsScheduleOpen(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            </div>
            <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#636e72' }}>Your working hours with Learn With Ayman, in <strong>Cairo time</strong>. Classes already on your calendar are blocked automatically. Please keep this updated every week.</p>

            {/* 🗓️ Step 19: easier editor (day cards, edit in place, copy a day, overnight as one row) */}
            <ScheduleEditor value={scheduleDraft} onChange={setScheduleDraft} />

            <button onClick={handleSaveSchedule} disabled={isSavingSchedule} style={{ width: '100%', padding: '12px', backgroundColor: isSavingSchedule ? '#b2bec3' : '#0984e3', color: 'white', border: 'none', borderRadius: '8px', cursor: isSavingSchedule ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
              {isSavingSchedule ? 'Saving...' : '💾 Save my schedule'}
            </button>
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