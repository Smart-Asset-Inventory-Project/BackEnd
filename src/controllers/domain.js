const prisma = require('../utils/prisma');
const { transition, eventData } = require('../services/maintenance');
const { schemas } = require('../validators/domain');
const validate = require('../services/domain-validation');
const { error, pagination, scope, linked, log, transaction } = require('../services/integrity');
const { ok, fail } = require('../utils/response');
const { applyScopeFilter } = require('../utils/scope');

const includes = {
  warranty: { asset: { select: { id: true, assetTag: true, name: true, locationId: true } } },
  transfer: { asset: { include: { location: true } }, fromUser: { select: { id: true, name: true, email: true } }, toUser: { select: { id: true, name: true, email: true } } },
  maintenanceTemplate: { workOrders: { select: { id: true, status: true } } },
  workOrder: { asset: { include: { location: true } }, template: true, assignedTo: { select: { id: true, name: true, email: true } }, serviceEvents: true },
  custodyAssignment: { asset: { include: { location: true } }, user: { select: { id: true, name: true, email: true } } }
};
const models = { warranty: 'warranty', custodyAssignment: 'custodyAssignment', transfer: 'transfer', maintenanceTemplate: 'maintenanceTemplate', workOrder: 'workOrder' };
const entity = type => type.replace(/([A-Z])/g, ' $1').trim().replace(/^./, x => x.toUpperCase());
const orderFields = { custodyAssignment: { assignedAt: 'desc' }, transfer: { transferredAt: 'desc' }, warranty: { endDate: 'asc' }, workOrder: { createdAt: 'desc' }, maintenanceTemplate: { createdAt: 'desc' } };
const list = (type, where = {}) => async (req, res, next) => { try {
  const { page, limit } = pagination(req.query);
  const actualWhere = ['workOrder', 'transfer', 'custodyAssignment', 'warranty'].includes(type)
    ? { ...where, asset: applyScopeFilter(req.scopeIds, {}) }
    : { ...where };
  if (type === 'workOrder') {
    for (const field of ['status','priority','assignedToUserId']) if (req.query[field]) actualWhere[field] = req.query[field];
    if (req.query.scheduledFrom || req.query.scheduledTo) {
      const z = require('zod').z;
      const from = req.query.scheduledFrom ? z.coerce.date().parse(req.query.scheduledFrom) : undefined;
      const to = req.query.scheduledTo ? z.coerce.date().parse(req.query.scheduledTo) : undefined;
      if (from && to && from > to) throw error('scheduledFrom must precede scheduledTo');
      actualWhere.dueDate = { gte: from, lte: to };
    }
  }
  if (req.query.assetId && type !== 'maintenanceTemplate') actualWhere.assetId = req.query.assetId;
  if (type === 'custodyAssignment' && req.query.active !== undefined) actualWhere.returnedAt = require('zod').z.enum(['true','false']).parse(req.query.active) === 'true' ? null : { not: null };
  const [data, total] = await prisma.$transaction([
    prisma[models[type]].findMany({ where: actualWhere, include: includes[type], orderBy: orderFields[type], skip: (page - 1) * limit, take: limit }),
    prisma[models[type]].count({ where: actualWhere })
  ]);
  ok(res, data, 200, { page, limit, total, pages: Math.ceil(total / limit) });
} catch (e) { next(e); } };
const get = type => async (req, res, next) => { try {
  const item = await prisma[models[type]].findUnique({ where: { id: req.params.id }, include: includes[type] });
  if (!item) return fail(res, 'NOT_FOUND', 'Resource not found', 404);
  if (['workOrder', 'transfer', 'custodyAssignment', 'warranty'].includes(type) && req.scopeIds !== null && !req.scopeIds.includes(item.asset.locationId))
    return fail(res, 'FORBIDDEN', 'Out of scope', 403);
  ok(res, item);
} catch (e) { next(e); } };
const create = type => async (req, res, next) => { try {
  const data = schemas[type].parse(req.body);
  const item = await transaction(prisma, async tx => {
    if (type === 'workOrder' && data.status && data.status !== 'OPEN') throw error('New work orders must be OPEN');
    await validate(tx, type, data, req);
    if (type === 'transfer' || type === 'custodyAssignment') {
      const asset = await linked(tx, 'asset', data.assetId);
      if (asset.status === 'RETIRED') throw error('Retired assets cannot be transferred or assigned', 409);
      if (type === 'transfer') {
        await linked(tx, 'location', data.toLocationId); scope(req, data.toLocationId);
        if (asset.locationId === data.toLocationId) throw error('Asset is already at this location');
        if (data.toUserId && data.toUserId !== asset.assignedToUserId) throw error('Use custody assignments to change the custodian');
        delete data.transferredById;
        data.fromLocationId = asset.locationId; data.transferredByUserId = req.user.sub;
        data.fromUserId = asset.assignedToUserId; data.toUserId = asset.assignedToUserId;
        await tx.asset.update({ where: { id: asset.id }, data: { locationId: data.toLocationId } });
      } else {
        await linked(tx, 'user', data.userId);
        if (await tx.custodyAssignment.count({ where: { assetId: asset.id, returnedAt: null } })) throw error('Asset already has an active custody assignment', 409);
        if (data.assignedAt && data.assignedAt > new Date()) throw error('Assignment date cannot be in the future');
        await tx.asset.update({ where: { id: asset.id }, data: { assignedToUserId: data.userId } });
      }
    }
    const item = await tx[models[type]].create({ data, include: includes[type] });
    await log(tx, entity(type), item.id, 'CREATE', req, data); return item;
  });
  ok(res, item, 201);
} catch (e) { next(e); } };
const update = type => async (req, res, next) => { try {
  const item = await transaction(prisma, async tx => {
    const old = await linked(tx, models[type], req.params.id);
    await validate(tx, type, old, req);
    if (type === 'transfer') throw error('Transfer history is immutable', 409);
    let data;
    if (type === 'custodyAssignment') {
      data = require('zod').z.object({ returnedAt: require('zod').z.coerce.date(), notes: require('zod').z.string().optional().nullable() }).parse(req.body);
      if (old.returnedAt) throw error('Custody assignment is already closed', 409);
      if (data.returnedAt < old.assignedAt || data.returnedAt > new Date()) throw error('Return date must be between assignment date and now');
      await tx.asset.update({ where: { id: old.assetId }, data: { assignedToUserId: null } });
    } else data = schemas[type].partial().parse(req.body);
    if (type === 'workOrder') transition(old, data);
    await validate(tx, type, { ...old, ...data }, req);
    if (type === 'workOrder' && data.status === 'COMPLETED') {
      const event = await tx.serviceEvent.create({ data: eventData({ workOrderId: old.id, completedAt: data.completedAt }) });
      await log(tx, 'ServiceEvent', event.id, 'CREATE', req, event);
    }
    const item = await tx[models[type]].update({ where: { id: old.id }, data, include: includes[type] });
    await log(tx, entity(type), item.id, 'UPDATE', req, data); return item;
  }); ok(res, item);
} catch (e) { next(e); } };
const remove = type => async (req, res, next) => { try {
  await transaction(prisma, async tx => {
    const old = await linked(tx, models[type], req.params.id); await validate(tx, type, old, req);
    if (['transfer','custodyAssignment','workOrder'].includes(type)) throw error('History cannot be deleted; close or cancel the record', 409);
    if (type === 'maintenanceTemplate' && await tx.workOrder.count({ where: { templateId: old.id } })) throw error('Template has work orders', 409);
    await tx[models[type]].delete({ where: { id: old.id } }); await log(tx, entity(type), old.id, 'DELETE', req, old);
  }); ok(res, { deleted: true });
} catch (e) { next(e); } };
exports.list = list; exports.get = get; exports.create = create; exports.update = update; exports.remove = remove;
exports.expiring = async (req, res, next) => { try {
  const days = require('zod').z.coerce.number().int().min(1).max(3650).parse(req.query.days || 30); const end = new Date(Date.now() + days * 86400000);
  const { page, limit } = pagination(req.query);
  const where = { endDate: { lte: end, gte: new Date() }, asset: applyScopeFilter(req.scopeIds, {}) };
  const [data, total] = await prisma.$transaction([
    prisma.warranty.findMany({ where, include: includes.warranty, orderBy: { endDate: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.warranty.count({ where })
  ]);
  ok(res, data, 200, { page, limit, total, pages: Math.ceil(total / limit) });
} catch (e) { next(e); } };
exports.due = async (req, res, next) => { try {
  const now = new Date(); const nextWeek = new Date(now.getTime() + 7 * 86400000);
  const { page, limit } = pagination(req.query);
  const where = { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] }, dueDate: { gte: now, lte: nextWeek }, asset: applyScopeFilter(req.scopeIds, {}) };
  const [data, total] = await prisma.$transaction([
    prisma.workOrder.findMany({ where, include: includes.workOrder, orderBy: { dueDate: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.workOrder.count({ where })
  ]);
  ok(res, data, 200, { page, limit, total, pages: Math.ceil(total / limit) });
} catch (e) { next(e); } };
exports.history = async (req, res, next) => { try {
  const id = req.params.id;
  const [asset, custody, transfers, workOrders, warranties, retirement, audits] = await Promise.all([
    prisma.asset.findUnique({ where: { id }, select: { createdAt: true, locationId: true } }), prisma.custodyAssignment.findMany({ where: { assetId: id } }), prisma.transfer.findMany({ where: { assetId: id } }), prisma.workOrder.findMany({ where: { assetId: id }, include: { serviceEvents: true } }), prisma.warranty.findMany({ where: { assetId: id } }), prisma.retirement.findMany({ where: { assetId: id } }), prisma.auditLog.findMany({ where: { entityId: id } })
  ]);
  if (!asset) return fail(res, 'NOT_FOUND', 'Asset not found', 404);
  scope(req, asset.locationId);
  const events = [{ type: 'asset', action: 'CREATED', at: asset.createdAt }, ...custody.map(x => ({ type: 'custody', action: 'ASSIGNED', at: x.assignedAt, data: x })), ...transfers.map(x => ({ type: 'transfer', action: 'TRANSFERRED', at: x.transferredAt, data: x })), ...workOrders.map(x => ({ type: 'work-order', action: x.status, at: x.createdAt, data: x })), ...warranties.map(x => ({ type: 'warranty', action: 'CREATED', at: x.createdAt, data: x })), ...retirement.map(x => ({ type: 'retirement', action: 'RETIRED', at: x.retiredAt, data: x })), ...audits.map(x => ({ type: 'audit', action: x.action, at: x.createdAt, data: x }))].sort((a,b) => new Date(a.at) - new Date(b.at));
  ok(res, events);
} catch (e) { next(e); } };
exports.complete = async (req, res, next) => { try {
  const data = schemas.serviceEvent.omit({ workOrderId: true }).parse(req.body);
  const updated = await transaction(prisma, async tx => {
    const old = await linked(tx, 'workOrder', req.params.id);
    await validate(tx, 'workOrder', old, req);
    const change = transition(old, { status: 'COMPLETED' });
    const event = await tx.serviceEvent.create({ data: eventData({ ...data, workOrderId: old.id, completedAt: change.completedAt }) });
    await log(tx, 'ServiceEvent', event.id, 'CREATE', req, event);
    const item = await tx.workOrder.update({ where: { id: old.id }, data: change, include: includes.workOrder });
    await log(tx, 'WorkOrder', old.id, 'COMPLETE', req, data); return item;
  }); ok(res, updated);
} catch (e) { next(e); } };
exports.createServiceEvent = async (req, res, next) => { try {
  const data = schemas.serviceEvent.parse(req.body);
  const item = await transaction(prisma, async tx => {
    const order = await linked(tx, 'workOrder', data.workOrderId);
    const asset = await linked(tx, 'asset', order.assetId); scope(req, asset.locationId);
    if (order.status === 'CANCELLED') throw error('Cannot add service to cancelled work order', 409);
    const item = await tx.serviceEvent.create({ data: eventData(data) });
    await log(tx, 'ServiceEvent', item.id, 'CREATE', req, data); return item;
  }); ok(res, item, 201);
} catch (e) { next(e); } };
