const express = require('express');
const prisma = require('../utils/prisma');
const auth = require('../middlewares/auth');
const authorize = require('../middlewares/authorize');
const { ok, fail } = require('../utils/response');
const models = {
  suppliers: ['supplier', 'procurement:manage'], 'purchase-orders': ['purchaseOrder', 'procurement:manage'],
  invoices: ['invoice', 'procurement:manage'], attachments: ['attachment', 'asset:write'], 'audit-logs': ['auditLog', 'audit:read']
};
// Invoice details are exposed only by the permission-protected invoice routes.
const includes = { supplier: { purchaseOrders: true }, purchaseOrder: { supplier: true, asset: true }, invoice: { purchaseOrder: true }, attachment: { asset: true }, auditLog: { user: { select: { id: true, name: true, email: true } } } };
const { schemas } = require('../validators/domain');
const validate = require('../services/domain-validation');
const { pagination, transaction, linked, log, error } = require('../services/integrity');
module.exports = name => {
  const [model, permission] = models[name]; const r = express.Router(); r.use(auth);
  /** List a generic resource with standard pagination. */
  r.get('/', ['invoices', 'audit-logs'].includes(name) ? authorize(permission) : (_req, _res, next) => next(), async (req, res, next) => { try {
    const { page, limit } = pagination(req.query);
    const where = {}; if (req.query.status && ['purchaseOrder','invoice'].includes(model)) where.status = req.query.status; if (req.query.search && model === 'supplier') where.OR = ['name','email','phone'].map(field => ({ [field]: { contains: req.query.search, mode: 'insensitive' } }));
    const [data, total] = await prisma.$transaction([prisma[model].findMany({ where, include: includes[model], skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }), prisma[model].count({ where })]);
    ok(res, data, 200, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); } });
  /** Retrieve one generic resource by id. */
  r.get('/:id', ['invoices', 'audit-logs'].includes(name) ? authorize(permission) : (_req, _res, next) => next(), async (req, res, next) => { try { const item = await prisma[model].findUnique({ where: { id: req.params.id }, include: includes[model] }); if (!item) return fail(res, 'NOT_FOUND', 'Resource not found', 404); ok(res, item); } catch (e) { next(e); } });
  if (name === 'audit-logs') return r; // Audit history is read-only.
  /** Create a generic resource. */
  r.post('/', authorize(permission), async (req, res, next) => { try { const data = schemas[model] ? schemas[model].parse(req.body) : { ...req.body }; const item = await transaction(prisma, async tx => { await validate(tx, model, data, req); const item = await tx[model].create({ data, include: includes[model] }); await log(tx, model, item.id, 'CREATE', req, data); return item; }); ok(res, item, 201); } catch (e) { next(e); } });
  /** Update a generic resource. */
  r.put('/:id', authorize(permission), async (req, res, next) => { try { const data = schemas[model] ? schemas[model].partial().parse(req.body) : { ...req.body }; const item = await transaction(prisma, async tx => { const old = await linked(tx, model, req.params.id); await validate(tx, model, { ...old, ...data }, req); if (model === 'purchaseOrder' && data.supplierId && data.supplierId !== old.supplierId && await tx.invoice.count({ where: { purchaseOrderId: old.id } })) throw error('Cannot change supplier on an invoiced order', 409); const item = await tx[model].update({ where: { id: old.id }, data, include: includes[model] }); await log(tx, model, item.id, 'UPDATE', req, data); return item; }); ok(res, item); } catch (e) { next(e); } });
  /** Delete a generic resource. */
  r.delete('/:id', authorize(permission), async (req, res, next) => { try { await transaction(prisma, async tx => { const old = await linked(tx, model, req.params.id); if (model === 'supplier' && await tx.invoice.count({ where: { supplierId: old.id } })) throw error('Supplier has invoices', 409); if (model === 'purchaseOrder' && await tx.invoice.count({ where: { purchaseOrderId: old.id } })) throw error('Purchase order has invoices', 409); await tx[model].delete({ where: { id: old.id } }); await log(tx, model, old.id, 'DELETE', req, old); }); ok(res, { deleted: true }); } catch (e) { next(e); } });
  return r;
};
