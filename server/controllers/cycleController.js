const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { buildCycle } = require('../utils/cycleCalc');

// ==========================================
// 🔄 STEP 17: CALCULATED CYCLE (Admin, student wallet)
// ==========================================

// @route GET /api/users/:id/cycle
const getStudentCycle = asyncHandler(async (req, res) => {
  const student = await User.findById(req.params.id);
  if (!student || student.role !== 'student') {
    res.status(404);
    throw new Error('Student not found.');
  }
  const result = await buildCycle(student);
  res.status(200).json(result);
});

module.exports = { getStudentCycle };
