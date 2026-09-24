import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import '../App.css';

const API_URL = process.env.REACT_APP_API_URL || 'https://lms-backend-02zs.onrender.com';

function ProgressHistory() {
  const [reports, setReports] = useState([]);
  const [legacyReports, setLegacyReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState('total'); // 'total' or 'subjects'
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/');
    
    const userData = JSON.parse(localStorage.getItem('user'));
    if (userData?.role?.toLowerCase() === 'teacher') {
      alert("Access Denied: Teachers cannot view parent hubs.");
      return navigate('/dashboard');
    }

    fetchReports(token);
    fetchLegacyReports(token, userData._id);
  }, [navigate]);

  const fetchReports = async (token) => {
    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/student/subscription-summary`, config);
      
      // Filter ONLY finalized and approved reports
      const approvedReports = res.data.monthlyReports.filter(
        (r) => r.isFinalized && r.approvalStatus === 'approved'
      );
      
      setReports(approvedReports);
    } catch (error) {
      console.error("Failed to fetch reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLegacyReports = async (token, userId) => {
    try {
      // Re-fetch the specific user to grab their legacy PDFs array
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.get(`${API_URL}/api/users`, config);
      const currentUser = res.data.find(u => u._id === userId);
      if (currentUser && currentUser.legacyReports) {
        setLegacyReports(currentUser.legacyReports);
      }
    } catch (error) {
      console.error("Failed to fetch legacy reports:", error);
    }
  };

  const handlePrintPDF = (reportId) => {
    window.print();
  };

  // ✨ NEW: Connected Grade Appeal function
  const handleAppeal = async (monthYear) => {
    const reason = window.prompt(`Please briefly explain why you are appealing the grade for ${monthYear}:`);
    if (reason) {
      try {
        const token = localStorage.getItem('token');
        const config = { headers: { Authorization: `Bearer ${token}` } };
        await axios.post(`${API_URL}/api/student/appeal-report`, { monthYear, reason }, config);
        
        alert(`✅ Appeal submitted for ${monthYear}. Our admin team has been notified and will review it shortly.`);
      } catch (error) {
        console.error("Error submitting appeal:", error);
        alert('❌ Failed to submit appeal. Please try again.');
      }
    }
  };

  const generateShareImage = () => {
    alert("Generating your Bragging Rights image to share on WhatsApp! (Canvas integration pending)");
  };

  // Format data for Recharts
  const chartData = reports.map(r => ({
    month: r.monthYear.substring(0, 3), 
    totalScore: r.totalScore,
    quranScore: r.quran?.enrolled ? (r.quran.score / r.quran.maxPossible) * 10 : null, 
    arabicScore: r.arabic?.enrolled ? (r.arabic.score / r.arabic.maxPossible) * 10 : null,
    islamicScore: r.islamicStudies?.enrolled ? (r.islamicStudies.score / r.islamicStudies.maxPossible) * 10 : null,
  }));

  return (
    <div className="dashboard-container" style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div>
          <h1 style={{ margin: '0 0 5px 0', color: '#2d3436' }}>📈 Progress History</h1>
          <p style={{ margin: 0, color: '#636e72' }}>Your complete academic journey at Learn with Ayman.</p>
        </div>
        <button onClick={() => navigate('/dashboard')} style={{ backgroundColor: '#f1f2f6', color: '#2d3436', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
          ⬅ Back to Dashboard
        </button>
      </div>

      {/* THE INTERACTIVE PERFORMANCE TRACKER */}
      <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.04)', marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#2d3436' }}>Performance Analytics</h2>
          <div style={{ display: 'flex', gap: '10px', backgroundColor: '#f5f6fa', padding: '5px', borderRadius: '8px' }}>
            <button 
              onClick={() => setChartMode('total')} 
              style={{ border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', backgroundColor: chartMode === 'total' ? '#0984e3' : 'transparent', color: chartMode === 'total' ? 'white' : '#636e72' }}>
              Total Score
            </button>
            <button 
              onClick={() => setChartMode('subjects')} 
              style={{ border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold', backgroundColor: chartMode === 'subjects' ? '#6c5ce7' : 'transparent', color: chartMode === 'subjects' ? 'white' : '#636e72' }}>
              Subject Breakdown
            </button>
          </div>
        </div>

        {loading ? (
          <p style={{ color: '#636e72', textAlign: 'center', padding: '40px 0' }}>Loading analytics...</p>
        ) : reports.length === 0 ? (
          <p style={{ color: '#b2bec3', textAlign: 'center', padding: '40px 0', fontStyle: 'italic' }}>Analytics will appear after your first monthly report is approved.</p>
        ) : (
          <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f2f6" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#b2bec3', fontSize: 14, fontWeight: 'bold' }} />
                <YAxis domain={[0, 10]} axisLine={false} tickLine={false} tick={{ fill: '#b2bec3', fontSize: 14 }} />
                <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                
                {chartMode === 'total' ? (
                  <Line type="monotone" dataKey="totalScore" name="Total Score (/10)" stroke="#0984e3" strokeWidth={4} dot={{ r: 6, fill: '#0984e3', stroke: 'white', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                ) : (
                  <>
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Line type="monotone" dataKey="quranScore" name="Quran (Normalized)" stroke="#6c5ce7" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="arabicScore" name="Arabic (Normalized)" stroke="#00b894" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="islamicScore" name="Islamic Studies (Normalized)" stroke="#fdcb6e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* NEW & LEGACY REPORT VAULT */}
      <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', color: '#2d3436', borderBottom: '2px solid #dfe6e9', paddingBottom: '10px' }}>📄 Official Report Vault</h2>
      
      <div style={{ display: 'grid', gap: '20px' }}>
        {reports.length === 0 && legacyReports.length === 0 && !loading && (
          <p style={{ color: '#b2bec3', fontStyle: 'italic' }}>No official reports available yet.</p>
        )}

        {/* 1. Map through the new LMS-generated Reports */}
        {reports.slice().reverse().map((report, idx) => (
          <div key={`new-${idx}`} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', borderLeft: report.totalScore === 10 ? '5px solid #fdcb6e' : '5px solid #0984e3' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f2f6', paddingBottom: '15px', marginBottom: '15px' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', color: '#2d3436', fontSize: '22px' }}>
                  {report.monthYear} Official Report 
                  {report.totalScore === 10 && <span style={{ marginLeft: '10px' }}>🏆</span>}
                </h3>
                <p style={{ margin: 0, color: '#636e72', fontWeight: 'bold' }}>Signed: Learn with Ayman Support Team</p>
              </div>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: report.totalScore === 10 ? '#d35400' : '#0984e3' }}>
                {report.totalScore}/10
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
              {report.quran?.enrolled && (
                <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: '#6c5ce7' }}>Quran ({report.quran.score}/{report.quran.maxPossible})</h4>
                  <p style={{ margin: 0, fontSize: '13px', color: '#2d3436' }}>{report.quran.plan}</p>
                </div>
              )}
              {report.arabic?.enrolled && (
                <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: '#00b894' }}>Arabic ({report.arabic.score}/{report.arabic.maxPossible})</h4>
                  <p style={{ margin: 0, fontSize: '13px', color: '#2d3436' }}>{report.arabic.plan}</p>
                </div>
              )}
              {report.islamicStudies?.enrolled && (
                <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: '#fdcb6e' }}>Islamic Studies ({report.islamicStudies.score}/{report.islamicStudies.maxPossible})</h4>
                  <p style={{ margin: 0, fontSize: '13px', color: '#2d3436' }}>{report.islamicStudies.plan}</p>
                </div>
              )}
            </div>

            <div style={{ backgroundColor: '#e8f4fd', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 5px 0', color: '#0984e3' }}>Admin & Teacher Notes:</h4>
              <p style={{ margin: 0, fontSize: '14px', color: '#2d3436', whiteSpace: 'pre-wrap' }}>{report.teacherNote}</p>
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={() => handlePrintPDF(report._id)} style={{ padding: '8px 15px', backgroundColor: '#2d3436', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                🖨️ Download PDF
              </button>
              
              <button onClick={() => handleAppeal(report.monthYear)} style={{ padding: '8px 15px', backgroundColor: 'transparent', color: '#d63031', border: '1px solid #d63031', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                ⚖️ Appeal Grade
              </button>

              {report.totalScore === 10 && (
                <button onClick={generateShareImage} style={{ padding: '8px 15px', backgroundColor: '#25D366', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginLeft: 'auto' }}>
                  📱 Share on WhatsApp
                </button>
              )}
            </div>
          </div>
        ))}

        {/* 2. Map through the Legacy Google Drive PDFs */}
        {legacyReports.slice().reverse().map((report, idx) => (
          <div key={`legacy-${idx}`} style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '12px', border: '1px solid #dfe6e9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: '0 0 5px 0', color: '#2d3436', fontSize: '18px' }}>📂 {report.monthYear} Official Report</h3>
              <span style={{ fontSize: '12px', backgroundColor: '#b2bec3', color: 'white', padding: '3px 8px', borderRadius: '12px', fontWeight: 'bold' }}>LEGACY PDF</span>
            </div>
            <button onClick={() => window.open(report.pdfLink, '_blank')} style={{ padding: '8px 15px', backgroundColor: '#0984e3', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
              View Document ↗
            </button>
          </div>
        ))}
      </div>
      
    </div>
  );
}

export default ProgressHistory;