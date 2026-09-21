const prisma = require('../utils/prisma');
const audit = require('../utils/audit');
const { ok, fail } = require('../utils/response');
const { applyScopeFilter } = require('../utils/scope');

const includes = {
  warranty: { asset: { select: { id: true, assetTag: true, name: true } } },
  transfer: { asset: { include: { location: true } }, fromUser: true, toUser: true },
  maintenanceTemplate: { workOrders: { select: { id: true, status: true } } },
  workOrder: { asset: { include: { location: true } }, template: true, assignedTo: { select: { id: true, name: true, email: true } }, serviceEvents: true },
  custodyAssignment: { asset: { include: { location: true } }, user: { select: { id: true, name: true, email: true } } }
};
const models = { warranty: 'warranty', custodyAssignment: 'custodyAssignment', transfer: 'transfer', maintenanceTemplate: 'maintenanceTemplate', workOrder: 'workOrder' };
const entity = type => type.replace(/([A-Z])/g, ' $1').trim().replace(/^./, x => x.toUpperCase());
const orderFields = { custodyAssignment: { assignedAt: 'desc' }, transfer: { transferredAt: 'desc' }, warranty: { endDate: 'asc' }, workOrder: { createdAt: 'desc' }, maintenanceTemplate: { createdAt: 'desc' } };
const list = (type, where = {}) => async (req, res, next) => { try {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const actualWhere = ['workOrder', 'transfer', 'custodyAssignment'].includes(type)
    ? { ...where, asset: applyScopeFilter(req.scopeIds, {}) }
    : { ...where };
  const [data, total] = await prisma.$transaction([
    prisma[models[type]].findMany({ where: actualWhere, include: includes[type], orderBy: orderFields[type], skip: (page - 1) * limit, take: limit }),
    prisma[models[type]].count({ where: actualWhere })
  ]);
  ok(res, data, 200, { page, limit, total, pages: Math.ceil(total / limit) });
} catch (e) { next(e); } };
const get = type => async (req, res, next) => { try {
  const item = await prisma[models[type]].findUnique({ where: { id: req.params.id }, include: includes[type] });
  if (!item) return fail(res, 'NOT_FOUND', 'Resource not found', 404);
  if (['workOrder', 'transfer'].includes(type) && req.scopeIds !== null && !req.scopeIds.includes(item.asset.locationId))
    return fail(res, 'FORBIDDEN', 'Out of scope', 403);
  ok(res, item);
} catch (e) { next(e); } };
const create = type => async (req, res, next) => { try {
  const data = { ...req.body };
  if (type === 'transfer' && data.transferredById) {
    data.transferredByUserId = data.transferredById;
    delete data.transferredById;
  }
  let item;
  if (type === 'transfer') {
    const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
    if (!asset) return fail(res, 'NOT_FOUND', 'Asset not found', 404);
    if (asset.status === 'RETIRED') return fail(res, 'CONFLICT', 'Retired assets cannot be transferred', 409);
    if (!data.toLocationId) return fail(res, 'VALIDATION_ERROR', 'toLocationId is required', 400);
    data.fromLocationId = asset.locationId;
    data.transferredByUserId = req.user.sub;
    item = await prisma.$transaction(async tx => {
      const transfer = await tx.transfer.create({ data, include: includes.transfer });
      await tx.asset.update({ where: { id: transfer.assetId }, data: { locationId: transfer.toLocationId, assignedToUserId: transfer.toUserId || null } });
      return transfer;
    });
  } else if (type === 'custodyAssignment') {
    item = await prisma.$transaction(async tx => {
      await tx.custodyAssignment.updateMany({ where: { assetId: data.assetId, returnedAt: null }, data: { returnedAt: new Date() } });
      const assignment = await tx.custodyAssignment.create({ data, include: includes.custodyAssignment });
      await tx.asset.update({ where: { id: assignment.assetId }, data: { assignedToUserId: assignment.userId } });
      return assignment;
    });
  } else {
    item = await prisma[models[type]].create({ data, include: includes[type] });
  }
  await audit(entity(type), item.id, 'CREATE', req.user.sub, req.body); ok(res, item, 201);
} catch (e) { next(e); } };
const update = type => async (req, res, next) => { try { const item = await prisma[models[type]].update({ where: { id: req.params.id }, data: req.body, include: includes[type] }); await audit(entity(type), item.id, 'UPDATE', req.user.sub, req.body); ok(res, item); } catch (e) { next(e); } };
const remove = type => async (req, res, next) => { try { const item = await prisma[models[type]].delete({ where: { id: req.params.id } }); await audit(entity(type), item.id, 'DELETE', req.user.sub, item); ok(res, { deleted: true }); } catch (e) { next(e); } };
exports.list = list; exports.get = get; exports.create = create; exports.update = update; exports.remove = remove;
exports.expiring = async (req, res, next) => { try {
  const days = Math.max(1, Number(req.query.days || 30)); const end = new Date(Date.now() + days * 86400000);
  const page = Math.max(1, Number(req.query.page || 1)); const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const where = { endDate: { lte: end, gte: new Date() } };
  const [data, total] = await prisma.$transaction([
    prisma.warranty.findMany({ where, include: includes.warranty, orderBy: { endDate: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.warranty.count({ where })
  ]);
  ok(res, data, 200, { page, limit, total, pages: Math.ceil(total / limit) });
} catch (e) { next(e); } };
exports.due = async (req, res, next) => { try {
  const now = new Date(); const nextWeek = new Date(now.getTime() + 7 * 86400000);
  const page = Math.max(1, Number(req.query.page || 1)); const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
  const where = { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { gte: now, lte: nextWeek } };
  const [data, total] = await prisma.$transaction([
    prisma.workOrder.findMany({ where, include: includes.workOrder, orderBy: { dueDate: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.workOrder.count({ where })
  ]);
  ok(res, data, 200, { page, limit, total, pages: Math.ceil(total / limit) });
} catch (e) { next(e); } };
exports.history = async (req, res, next) => { try {
  const id = req.params.id;
  const [asset, custody, transfers, workOrders, warranties, retirement, audits] = await Promise.all([
    prisma.asset.findUnique({ where: { id }, select: { createdAt: true } }), prisma.custodyAssignment.findMany({ where: { assetId: id } }), prisma.transfer.findMany({ where: { assetId: id } }), prisma.workOrder.findMany({ where: { assetId: id }, include: { serviceEvents: true } }), prisma.warranty.findMany({ where: { assetId: id } }), prisma.retirement.findMany({ where: { assetId: id } }), prisma.auditLog.findMany({ where: { entityId: id } })
  ]);
  if (!asset) return fail(res, 'NOT_FOUND', 'Asset not found', 404);
  const events = [{ type: 'asset', action: 'CREATED', at: asset.createdAt }, ...custody.map(x => ({ type: 'custody', action: 'ASSIGNED', at: x.assignedAt, data: x })), ...transfers.map(x => ({ type: 'transfer', action: 'TRANSFERRED', at: x.transferredAt, data: x })), ...workOrders.map(x => ({ type: 'work-order', action: x.status, at: x.createdAt, data: x })), ...warranties.map(x => ({ type: 'warranty', action: 'CREATED', at: x.createdAt, data: x })), ...retirement.map(x => ({ type: 'retirement', action: 'RETIRED', at: x.retiredAt, data: x })), ...audits.map(x => ({ type: 'audit', action: x.action, at: x.createdAt, data: x }))].sort((a,b) => new Date(a.at) - new Date(b.at));
  ok(res, events);
} catch (e) { next(e); } };
exports.complete = async (req, res, next) => { try {
  const item = await prisma.workOrder.findUnique({ where: { id: req.params.id }, include: includes.workOrder });
  if (!item) return fail(res, 'NOT_FOUND', 'Resource not found', 404);
  const completedAt = new Date();
  if (item.status === 'COMPLETED') return fail(res, 'CONFLICT', 'Work order is already completed', 409);
  const updated = await prisma.$transaction(async tx => {
    await tx.serviceEvent.create({ data: {
      workOrderId: item.id,
      laborCost: String(req.body.laborCost || 0),
      partsCost: String(req.body.partsCost || 0),
      downtimeHours: Number(req.body.downtimeHours || 0),
      outcome: req.body.outcome || 'completed',
      notes: req.body.notes || null,
      completedAt
    } });
    return tx.workOrder.update({ where: { id: item.id }, data: { status: 'COMPLETED', completedAt }, include: includes.workOrder });
  });
  await audit('WorkOrder', item.id, 'COMPLETE', req.user.sub, req.body);
  ok(res, updated);
} catch (e) { next(e); } };
