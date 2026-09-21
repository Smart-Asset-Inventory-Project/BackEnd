const express = require('express');
const prisma = require('../utils/prisma');
const auth = require('../middlewares/auth');
const authorize = require('../middlewares/authorize');
const audit = require('../utils/audit');
const { ok, fail } = require('../utils/response');

const paginate = req => ({ page: Math.max(1, Number(req.query.page || 1)), limit: Math.min(100, Math.max(1, Number(req.query.limit || 20))) });

const retirements = express.Router();
retirements.use(auth);
retirements.get('/', async (req, res, next) => {
  try {
    const { page, limit } = paginate(req);
    const where = req.scopeIds === null ? {} : { asset: { locationId: { in: req.scopeIds } } };
    const [data, total] = await prisma.$transaction([
      prisma.retirement.findMany({ where, include: { asset: true }, orderBy: { retiredAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.retirement.count({ where })
    ]);
    ok(res, data, 200, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});
retirements.get('/:id', async (req, res, next) => {
  try {
    const item = await prisma.retirement.findUnique({ where: { id: req.params.id }, include: { asset: true } });
    if (!item) return fail(res, 'NOT_FOUND', 'Retirement not found', 404);
    if (req.scopeIds !== null && !req.scopeIds.includes(item.asset.locationId)) return fail(res, 'FORBIDDEN', 'Out of scope', 403);
    ok(res, item);
  } catch (error) { next(error); }
});
retirements.post('/', authorize('retirement:approve'), async (req, res, next) => {
  try {
    const { assetId, reason, residualValue } = req.body;
    if (!assetId || !reason) return fail(res, 'VALIDATION_ERROR', 'assetId and reason are required', 400);
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) return fail(res, 'NOT_FOUND', 'Asset not found', 404);
    if (asset.status === 'RETIRED') return fail(res, 'CONFLICT', 'Asset is already retired', 409);
    if (req.scopeIds !== null && !req.scopeIds.includes(asset.locationId)) return fail(res, 'FORBIDDEN', 'Out of scope', 403);
    const item = await prisma.$transaction(async tx => {
      const retirement = await tx.retirement.create({ data: { assetId, reason, residualValue: residualValue == null ? null : String(residualValue), approvedBy: req.user.sub } });
      await tx.asset.update({ where: { id: assetId }, data: { status: 'RETIRED', assignedToUserId: null } });
      await tx.custodyAssignment.updateMany({ where: { assetId, returnedAt: null }, data: { returnedAt: new Date() } });
      return retirement;
    });
    await audit('Retirement', item.id, 'CREATE', req.user.sub, req.body);
    ok(res, item, 201);
  } catch (error) { next(error); }
});

const stocktakes = express.Router();
stocktakes.use(auth);
stocktakes.get('/', async (req, res, next) => {
  try {
    const { page, limit } = paginate(req);
    const where = req.scopeIds === null ? {} : { locationId: { in: req.scopeIds } };
    const [data, total] = await prisma.$transaction([
      prisma.stocktakeSession.findMany({ where, include: { observations: true }, orderBy: { startedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.stocktakeSession.count({ where })
    ]);
    ok(res, data, 200, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});
stocktakes.post('/', authorize('asset:write'), async (req, res, next) => {
  try {
    const { name, locationId } = req.body;
    if (!name) return fail(res, 'VALIDATION_ERROR', 'name is required', 400);
    if (locationId && req.scopeIds !== null && !req.scopeIds.includes(locationId)) return fail(res, 'FORBIDDEN', 'Out of scope', 403);
    ok(res, await prisma.stocktakeSession.create({ data: { name, locationId: locationId || null, createdByUserId: req.user.sub } }), 201);
  } catch (error) { next(error); }
});
stocktakes.post('/:id/observations', authorize('asset:write'), async (req, res, next) => {
  try {
    const { assetId, status, notes } = req.body;
    if (!assetId || !status) return fail(res, 'VALIDATION_ERROR', 'assetId and status are required', 400);
    const [session, asset] = await Promise.all([
      prisma.stocktakeSession.findUnique({ where: { id: req.params.id } }),
      prisma.asset.findUnique({ where: { id: assetId } })
    ]);
    if (!session || !asset) return fail(res, 'NOT_FOUND', 'Session or asset not found', 404);
    const item = await prisma.stocktakeObservation.upsert({
      where: { sessionId_assetId: { sessionId: session.id, assetId } },
      update: { status, notes: notes || null, observedAt: new Date() },
      create: { sessionId: session.id, assetId, status, notes: notes || null }
    });
    ok(res, item, 201);
  } catch (error) { next(error); }
});
stocktakes.put('/:id/complete', authorize('asset:write'), async (req, res, next) => {
  try {
    const item = await prisma.stocktakeSession.update({ where: { id: req.params.id }, data: { status: 'COMPLETED', completedAt: new Date() }, include: { observations: true } });
    ok(res, item);
  } catch (error) { next(error); }
});

const serviceEvents = express.Router();
serviceEvents.use(auth);
serviceEvents.get('/', async (req, res, next) => {
  try {
    const { page, limit } = paginate(req);
    const where = req.query.workOrderId ? { workOrderId: req.query.workOrderId } : {};
    const [data, total] = await prisma.$transaction([
      prisma.serviceEvent.findMany({ where, include: { workOrder: { include: { asset: true } } }, orderBy: { eventDate: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.serviceEvent.count({ where })
    ]);
    ok(res, data, 200, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) { next(error); }
});

module.exports = { retirements, stocktakes, serviceEvents };
