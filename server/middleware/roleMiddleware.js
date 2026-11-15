// ==========================================
// 🔐 ROLE LOCKS
// Use AFTER `protect`. Only lets the listed roles through.
// Example: router.get('/all', protect, allowRoles('admin'), getAllClasses);
// ==========================================
const allowRoles = (...roles) => (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase().trim();

  if (roles.includes(role)) {
    return next();
  }

  return res.status(403).json({ message: 'Not authorized for this action.' });
};

module.exports = { allowRoles };
