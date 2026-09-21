const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs');
const { signAccess, signRefresh, verifyRefresh } = require('../utils/jwt');
const publicUser = u => ({
  id: u.id, name: u.name, email: u.email, roleId: u.roleId,
  role: u.role ? { id: u.role.id, name: u.role.name, permissions: (u.role.permissions || []).map(p => p.permission.code) } : null
});
const userInclude = { role: { include: { permissions: { include: { permission: true } } } } };
exports.login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email }, include: userInclude });
  if (!user || !(await bcrypt.compare(password, user.password))) { const e = new Error('Invalid email or password'); e.status = 401; e.code = 'INVALID_CREDENTIALS'; throw e; }
  const accessToken = signAccess({ sub: user.id, role: user.role.name });
  const refreshToken = signRefresh({ sub: user.id });
  await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });
  return { user: publicUser(user), accessToken, refreshToken };
};
exports.refresh = async token => {
  if (!token) { const e = new Error('Refresh token is required'); e.status = 400; e.code = 'VALIDATION_ERROR'; throw e; }
  const payload = verifyRefresh(token);
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: userInclude });
  if (!user || user.refreshToken !== token) { const e = new Error('Invalid refresh token'); e.status = 401; e.code = 'UNAUTHENTICATED'; throw e; }
  const refreshToken = signRefresh({ sub: user.id });
  await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });
  return { accessToken: signAccess({ sub: user.id, role: user.role.name }), refreshToken };
};
exports.me = async id => {
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude });
  return publicUser(user);
};
