const express = require('express');
const router = express.Router();
const G = require('../controllers/groupController'); // 👥 Step 13: group courses
const { protect } = require('../middleware/authMiddleware');
const { allowRoles } = require('../middleware/roleMiddleware');

const adminOnly = allowRoles('admin');
const studentOnly = allowRoles('student');
const adminOrTeacher = allowRoles('admin', 'teacher');

router.get('/mine', protect, studentOnly, G.myGroups);
router.put('/sessions/:sessionId/recording', protect, adminOrTeacher, G.setRecording);

router.get('/', protect, adminOnly, G.listGroups);
router.post('/', protect, adminOnly, G.createGroup);
router.put('/:id', protect, adminOnly, G.updateGroup);
router.get('/:id/classes', protect, adminOnly, G.groupClasses);
router.post('/:id/cancel', protect, adminOnly, G.cancelGroupClass);
router.post('/:id/members', protect, adminOnly, G.addMember);
router.put('/:id/members/:memberId', protect, adminOnly, G.updateMember);
router.delete('/:id/members/:memberId', protect, adminOnly, G.removeMember);

module.exports = router;
