const express = require('express');
const prisma = require('../utils/prisma');
const auth = require('../middlewares/auth');
const authorize = require('../middlewares/authorize');
const { ok, fail } = require('../utils/response');
const models = {
  suppliers: ['supplier', 'procurement:manage'], 'purchase-orders': ['purchaseOrder', 'procurement:manage'],
  invoices: ['invoice', 'procurement:manage'], attachments: ['attachment', 'asset:write'], 'audit-logs': ['auditLog', 'audit:read']
};
const includes = { supplier: { purchaseOrders: true }, purchaseOrder: { supplier: true, asset: true, invoices: true }, invoice: { purchaseOrder: true }, attachment: { asset: true }, auditLog: { user: { select: { id: true, name: true, email: true } } } };
const decimalFields = new Set(['totalAmount', 'amount']);
module.exports = name => {
  const [model, permission] = models[name]; const r = express.Router(); r.use(auth);
  /** List a generic resource with standard pagination. */
  r.get('/', name === 'invoices' ? authorize(permission) : (_req, _res, next) => next(), async (req, res, next) => { try {
    const page = Math.max(1, Number(req.query.page || 1)); const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const where = {}; if (req.query.status) where.status = req.query.status;
    const [data, total] = await prisma.$transaction([prisma[model].findMany({ where, include: includes[model], skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }), prisma[model].count({ where })]);
    ok(res, data, 200, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); } });
  /** Retrieve one generic resource by id. */
  r.get('/:id', name === 'invoices' ? authorize(permission) : (_req, _res, next) => next(), async (req, res, next) => { try { const item = await prisma[model].findUnique({ where: { id: req.params.id }, include: includes[model] }); if (!item) return fail(res, 'NOT_FOUND', 'Resource not found', 404); ok(res, item); } catch (e) { next(e); } });
  /** Create a generic resource. */
  r.post('/', authorize(permission), async (req, res, next) => { try { const data = { ...req.body }; for (const f of decimalFields) if (data[f] != null) data[f] = String(data[f]); ok(res, await prisma[model].create({ data, include: includes[model] }), 201); } catch (e) { next(e); } });
  /** Update a generic resource. */
  r.put('/:id', authorize(permission), async (req, res, next) => { try { const data = { ...req.body }; for (const f of decimalFields) if (data[f] != null) data[f] = String(data[f]); ok(res, await prisma[model].update({ where: { id: req.params.id }, data, include: includes[model] })); } catch (e) { next(e); } });
  /** Delete a generic resource. */
  r.delete('/:id', authorize(permission), async (req, res, next) => { try { await prisma[model].delete({ where: { id: req.params.id } }); ok(res, { deleted: true }); } catch (e) { next(e); } });
  return r;
};
