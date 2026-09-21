const prisma = require('../utils/prisma');
const { fail } = require('../utils/response');
module.exports = permission => async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
    if (user && (user.role.name === 'ADMIN' || user.role.permissions.some(x => x.permission.code === permission))) return next();
    return fail(res, 'FORBIDDEN', 'Insufficient permission', 403);
  } catch (e) { next(e); }
};
