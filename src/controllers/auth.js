const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs');
const service = require('../services/auth');
const { ok } = require('../utils/response');
const validation = require('../validators/auth');
exports.login = async (req, res, next) => { try { ok(res, await service.login(validation.login.parse(req.body))); } catch (e) { next(e); } };
exports.refresh = async (req, res, next) => { try { ok(res, await service.refresh(require('zod').z.object({ refreshToken: require('zod').z.string().min(1) }).parse(req.body).refreshToken)); } catch (e) { next(e); } };
exports.me = async (req, res, next) => { try { ok(res, await service.me(req.user.sub)); } catch (e) { next(e); } };
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = validation.register.parse(req.body);
    // Public registration never accepts a caller-controlled role (privilege escalation).
    const defaultRole = await prisma.role.findUnique({ where: { name: 'CUSTODIAN' } });
    if (!defaultRole) { const e = new Error('Default role is not configured'); e.status = 503; e.code = 'CONFIGURATION_ERROR'; throw e; }
    const role = defaultRole.id;
    const user = await prisma.user.create({ data: { name, email, password: await bcrypt.hash(password, 10), roleId: role } });
    ok(res, { id: user.id, name: user.name, email: user.email, roleId: user.roleId }, 201);
  } catch (e) { next(e); }
};
