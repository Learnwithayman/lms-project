const ProgressReport = require('../models/ProgressReport');

// Helper function to calculate max scores based on active subjects
const calculateMaxScores = (hasQuran, hasArabic, hasIslamic) => {
    let qMax = 0, aMax = 0, iMax = 0;
    const totalSubjects = (hasQuran ? 1 : 0) + (hasArabic ? 1 : 0) + (hasIslamic ? 1 : 0);

    if (totalSubjects === 3) {
        // Scenario A: The Full Package
        qMax = 4; aMax = 3; iMax = 3;
    } else if (totalSubjects === 2) {
        // Scenario B & C: Two Subjects
        if (hasQuran && hasArabic) { qMax = 6; aMax = 4; }
        else if (hasQuran && hasIslamic) { qMax = 6; iMax = 4; }
        else if (hasArabic && hasIslamic) { aMax = 5; iMax = 5; }
    } else if (totalSubjects === 1) {
        // Scenario D: One Subject
        if (hasQuran) qMax = 10;
        else if (hasArabic) aMax = 10;
        else if (hasIslamic) iMax = 10;
    }
    
    return { qMax, aMax, iMax };
};

// @desc    Phase 1: Teacher creates a new Monthly Plan (Goals Only)
// @route   POST /api/progress/plan
// @access  Private (Teacher)
const createPlan = async (req, res) => {
    try {
        const { studentId, month, year, quranGoals, arabicGoals, islamicGoals } = req.body;
        
        // Check which subjects were actually given goals
        const hasQuran = !!quranGoals;
        const hasArabic = !!arabicGoals;
        const hasIslamic = !!islamicGoals;

        // Auto-calculate the maximum scores
        const { qMax, aMax, iMax } = calculateMaxScores(hasQuran, hasArabic, hasIslamic);

        // Create the Phase 1 Report
        const report = await ProgressReport.create({
            student: studentId,
            teacher: req.user._id,
            month,
            year,
            status: 'Plan_Active', // Starts as Phase 1
            quran: { goals: quranGoals || '', maxScore: qMax },
            arabic: { goals: arabicGoals || '', maxScore: aMax },
            islamicStudies: { goals: islamicGoals || '', maxScore: iMax }
        });

        res.status(201).json(report);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error creating plan' });
    }
};

// @desc    Phase 2: Teacher submits grades at the end of the month
// @route   PUT /api/progress/report/:id
// @access  Private (Teacher)
const submitReportGrades = async (req, res) => {
    try {
        const report = await ProgressReport.findById(req.params.id);
        
        if (!report) return res.status(404).json({ message: 'Report not found' });
        if (report.teacher.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(401).json({ message: 'Not authorized' });
        }

        const { quran, arabic, islamicStudies, teacherFeedback } = req.body;

        // Update the fields with the teacher's assessment
        if (quran) {
            report.quran.statusText = quran.statusText;
            report.quran.score = quran.score;
        }
        if (arabic) {
            report.arabic.statusText = arabic.statusText;
            report.arabic.score = arabic.score;
        }
        if (islamicStudies) {
            report.islamicStudies.statusText = islamicStudies.statusText;
            report.islamicStudies.score = islamicStudies.score;
        }

        // Calculate the absolute total score (Decimals allowed!)
        report.totalScore = 
            (quran?.score || 0) + 
            (arabic?.score || 0) + 
            (islamicStudies?.score || 0);

        report.teacherFeedback = teacherFeedback;
        report.status = 'Pending_Admin_Approval'; // Locks it for Admin Review!

        const updatedReport = await report.save();
        res.status(200).json(updatedReport);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error submitting grades' });
    }
};

// @desc    Get all approved reports for the logged-in student
// @route   GET /api/progress/my-reports
// @access  Private (Student)
const getMyReports = async (req, res) => {
    try {
        // Only return reports that have been fully approved by Admin
        const reports = await ProgressReport.find({ 
            student: req.user._id,
            status: 'Approved' 
        }).sort({ createdAt: -1 });

        res.status(200).json(reports);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error fetching reports' });
    }
};

module.exports = {
    createPlan,
    submitReportGrades,
    getMyReports
};