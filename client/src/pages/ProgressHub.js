import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../App.css';

// 📚 Pre-written Feedback Templates (From Admin)
const feedbackTemplates = {
  commendation: "Masha'Allah, excellent progress! Through dedicated effort and the tawfiq of Allah (SWT), all learning goals for the month were successfully completed. May Allah (SWT) continue to bless your efforts.",
  absencesMinor: "Attendance Note: We noticed a few absences this month which slightly slowed our pace. Insha'Allah, with consistent attendance next month, we can fully catch up on all material.",
  absencesMajor: "Action Required: Consistent attendance is a vital trust. Due to frequent absences this month, key study goals were not met. We encourage a renewed commitment to attendance to ensure success. May Allah (SWT) grant you steadfastness.",
  homeworkMinor: "Homework Reminder: Please remember that homework reinforces our lessons. A few missed assignments this month slowed our progress slightly. Let’s aim for full completion next month!",
  homeworkMajor: "Action Required: Homework is essential for retention. Unfortunately, frequent incomplete assignments prevented us from meeting our study goals this month. With renewed focus on home revision, you will achieve your objectives.",
  focusMinor: "Focus Reminder: We noticed some difficulty maintaining focus during class this month. Staying fully engaged in upcoming sessions will help ensure all concepts are mastered and retained.",
  focusMajor: "Action Required: Active engagement is key to seeking knowledge. Unfortunately, a lack of focus in class has resulted in unmet study goals this month. We encourage better attention to ensure future success. May Allah (SWT) grant you clarity.",
  mixedAttHwMinor: "Consistency Reminder: We noticed slight gaps in both attendance and homework submission this month. Establishing a steady routine for classes and home revision will ensure we stay on schedule next month.",
  mixedAttHwMajor: "Action Required: Progress has been hindered this month by both absences and incomplete homework. Consistent attendance and independent practice are necessary trusts for success. We urge a renewed commitment to these areas to meet future goals.",
  mixedFocusPrepMinor: "Engagement Note: To fully master the current material, we need to see slightly more focus during class and consistent completion of assignments. A small increase in effort will yield great results, Insha'Allah.",
  mixedFocusPrepMajor: "Action Required: Learning requires active participation. Unfortunately, a combination of distraction in class and missed assignments has prevented us from meeting our study goals. We ask for your support in improving focus and preparation.",
  generalMinor: "Monthly Summary: This month presented a few challenges regarding general preparation and consistency. We are confident that with a fresh start and renewed intention, next month will be very productive.",
  generalMajor: "Action Required: Due to various inconsistencies this month, we were unable to meet our primary learning objectives. We strongly encourage a fresh start with renewed dedication and discipline for the month ahead. May Allah (SWT) grant you success."
};

function ProgressHub() {
  const navigate = useNavigate();
  const [pastClasses, setPastClasses] = useState([]);
  const [userRole, setUserRole] = useState('student');
  
  // Phase 1: Planner State
  const [subjects, setSubjects] = useState({ quran: false, arabic: false, islamic: false });
  
  // Phase 2: Grading & Feedback State
  const [actualScores, setActualScores] = useState({ quran: 0, arabic: 0, islamic: 0 });
  const [feedbackText, setFeedbackText] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return navigate('/');
        
        const config = { headers: { Authorization: `Bearer ${token}` } };
        
        const profileRes = await axios.get('https://lms-backend-02zs.onrender.com/api/users/me', config)
          .catch(() => ({ data: { role: 'student' } }));
        setUserRole(profileRes.data.role);

        const classesRes = await axios.get('https://lms-backend-02zs.onrender.com/api/schedule/completed', config);
        setPastClasses(classesRes.data);
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    };
    fetchData();
  }, [navigate]);

  const calculateMaxScores = () => {
    const { quran, arabic, islamic } = subjects;
    if (quran && arabic && islamic) return { quran: 4, arabic: 3, islamic: 3 };
    if (quran && (arabic || islamic)) return { quran: 6, second: 4 };
    if (!quran && arabic && islamic) return { arabic: 5, islamic: 5 };
    return { single: 10 };
  };

  const maxScores = calculateMaxScores();

  const handleTemplateSelect = (e) => {
    const templateKey = e.target.value;
    if (templateKey && feedbackTemplates[templateKey]) {
      setFeedbackText((prev) => (prev ? prev + '\n\n' + feedbackTemplates[templateKey] : feedbackTemplates[templateKey]));
    }
    e.target.value = ''; // Reset dropdown after selection
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>📈 Progress Hub</h1>
        <button onClick={() => navigate('/dashboard')} className="btn-blue" style={{ padding: '8px 15px' }}>
          ⬅ Back to Schedule
        </button>
      </div>

      {userRole === 'teacher' || userRole === 'admin' ? (
        <div className="card">
          <h2>📝 Phase 1 & 2: Plan & Assess</h2>
          
          {/* Phase 1: Subject Selection */}
          <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #eee' }}>
            <p style={{ fontWeight: 'bold' }}>1. Select Active Subjects</p>
            <div style={{ display: 'flex', gap: '20px' }}>
              <label><input type="checkbox" onChange={(e) => setSubjects({...subjects, quran: e.target.checked})} /> Quran</label>
              <label><input type="checkbox" onChange={(e) => setSubjects({...subjects, arabic: e.target.checked})} /> Arabic</label>
              <label><input type="checkbox" onChange={(e) => setSubjects({...subjects, islamic: e.target.checked})} /> Islamic Studies</label>
            </div>
          </div>

          {/* Phase 2: Grading (Only shows if subjects are selected) */}
          {(subjects.quran || subjects.arabic || subjects.islamic) && (
            <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #eee' }}>
              <p style={{ fontWeight: 'bold' }}>2. Enter Scores (Decimals allowed, e.g., 3.5)</p>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {subjects.quran && (
                  <div>
                    <label>Quran (Max {maxScores.quran || maxScores.single}): </label>
                    <input type="number" step="0.5" min="0" max={maxScores.quran || maxScores.single} onChange={(e) => setActualScores({...actualScores, quran: e.target.value})} style={{ width: '70px' }} />
                  </div>
                )}
                {subjects.arabic && (
                  <div>
                    <label>Arabic (Max {maxScores.arabic || maxScores.second || maxScores.single}): </label>
                    <input type="number" step="0.5" min="0" max={maxScores.arabic || maxScores.second || maxScores.single} onChange={(e) => setActualScores({...actualScores, arabic: e.target.value})} style={{ width: '70px' }} />
                  </div>
                )}
                {subjects.islamic && (
                  <div>
                    <label>Islamic (Max {maxScores.islamic || maxScores.second || maxScores.single}): </label>
                    <input type="number" step="0.5" min="0" max={maxScores.islamic || maxScores.second || maxScores.single} onChange={(e) => setActualScores({...actualScores, islamic: e.target.value})} style={{ width: '70px' }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Phase 2: Smart Feedback Engine */}
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontWeight: 'bold' }}>3. Monthly Report Feedback</p>
            <select onChange={handleTemplateSelect} style={{ padding: '8px', marginBottom: '10px', width: '100%' }}>
              <option value="">-- Insert Quick Template --</option>
              <option value="commendation">⭐ Commendation (Excellent Progress)</option>
              <option value="absencesMinor">Attendance - Minor</option>
              <option value="absencesMajor">Attendance - Major</option>
              <option value="homeworkMinor">Homework - Minor</option>
              <option value="homeworkMajor">Homework - Major</option>
              <option value="focusMinor">Focus - Minor</option>
              <option value="focusMajor">Focus - Major</option>
              <option value="mixedAttHwMinor">Mixed (Att/HW) - Minor</option>
              <option value="mixedAttHwMajor">Mixed (Att/HW) - Major</option>
              <option value="mixedFocusPrepMinor">Mixed (Focus/Prep) - Minor</option>
              <option value="mixedFocusPrepMajor">Mixed (Focus/Prep) - Major</option>
              <option value="generalMinor">General Reset - Minor</option>
              <option value="generalMajor">General Reset - Major</option>
            </select>
            
            <textarea 
              value={feedbackText} 
              onChange={(e) => setFeedbackText(e.target.value)} 
              rows="6" 
              style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
              placeholder="Select a template above or type custom feedback..."
            />
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-blue" style={{ backgroundColor: '#6c757d' }}>Save as Draft</button>
            <button className="btn-blue" style={{ backgroundColor: '#28a745' }}>Submit for Admin Approval</button>
          </div>
        </div>
      ) : (
        /* STUDENT VIEW */
        <>
          <h2>Your Completed Classes</h2>
          <div style={{ display: 'grid', gap: '20px', marginTop: '20px' }}>
            {pastClasses.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', color: 'grey' }}>
                <p>No completed classes found yet.</p>
              </div>
            ) : (
              pastClasses.map((cls) => (
                <div key={cls._id} className="card" style={{ borderLeft: '5px solid #28a745' }}>
                  <h3 style={{ marginTop: 0 }}>✅ Subject: {cls.subject}</h3>
                  <p><strong>📅 Date:</strong> {new Date(cls.startTime).toLocaleDateString()}</p>
                  <hr style={{ margin: '15px 0', border: '0', borderTop: '1px solid #eee' }} />
                  <div style={{ backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '5px', marginBottom: '10px' }}>
                    <p style={{ margin: '0 0 5px 0' }}><strong>📝 Teacher's Notes:</strong></p>
                    <p style={{ margin: 0, color: '#555' }}>{cls.notes || 'No notes provided.'}</p>
                  </div>
                  <div style={{ backgroundColor: '#f8f9fa', padding: '10px', borderRadius: '5px' }}>
                    <p style={{ margin: '0 0 5px 0' }}><strong>📚 Homework Assigned:</strong></p>
                    <p style={{ margin: 0, color: '#555' }}>{cls.homework || 'No homework assigned.'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default ProgressHub;