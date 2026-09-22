const prisma = require('../utils/prisma');
const { ok, fail } = require('../utils/response');
const { error, pagination, scope, linked, log, transaction, locationRules } = require('../services/integrity');
const { z } = require('zod');
const { applyScopeFilter } = require('../utils/scope');
const { generateAssetQR } = require('../services/qrcode');

const configs = {
  location: { model: 'location', entity: 'Location', include: { parent: true, children: true },
    schema: z.object({ name: z.string().min(1), code: z.string().min(1), type: z.string().optional(), address: z.string().optional().nullable(), description: z.string().optional().nullable(), parentId: z.string().min(1).optional().nullable() }),
    permission: 'location:manage' },
  category: { model: 'assetCategory', entity: 'AssetCategory', include: { assets: { select: { id: true, assetTag: true, name: true } } },
    schema: z.object({ name: z.string().min(1), code: z.string().min(1), description: z.string().optional().nullable() }),
    permission: 'category:manage' },
  asset: { model: 'asset', entity: 'Asset', include: { category: true, location: true, assignedTo: { select: { id: true, name: true, email: true } } },
    schema: z.object({ assetTag: z.string().min(1), name: z.string().min(1), categoryId: z.string().min(1), locationId: z.string().min(1), serialNumber: z.string().min(1).optional().nullable(), model: z.string().optional().nullable(), status: z.string().optional(), value: z.number().nonnegative().optional().nullable(), purchaseCost: z.number().nonnegative().optional().nullable(), usefulLifeYears: z.number().int().positive().optional().nullable(), condition: z.string().optional().nullable(), assignedToUserId: z.string().optional().nullable(), purchaseDate: z.coerce.date().optional().nullable(), metadata: z.any().optional().nullable() }),
    permission: 'asset:write' }
};
const clean = (data, type) => {
  const out = { ...data };
  if (type === 'asset' && out.value != null) out.value = String(out.value);
  if (type === 'asset' && out.metadata != null && typeof out.metadata !== 'string') out.metadata = JSON.stringify(out.metadata);
  return out;
};
const whereFor = (type, query) => {
  const where = {};
  if (query.search) where.OR = type === 'asset'
    ? [{ name: { contains: query.search } }, { assetTag: { contains: query.search } }, { serialNumber: { contains: query.search } }]
    : [{ name: { contains: query.search } }, { code: { contains: query.search } }];
  if (type === 'asset') {
    if (query.status) where.status = query.status;
    if (query.condition) where.condition = query.condition;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.locationId) where.locationId = query.locationId;
  } else if (type === 'location' && query.parentId !== undefined) where.parentId = query.parentId || null;
  return where;
};
exports.list = type => async (req, res, next) => {
  try {
    const c = configs[type], { page, limit } = pagination(req.query);
    const baseWhere = whereFor(type, req.query);
    const where = type === 'asset'
      ? applyScopeFilter(req.scopeIds, baseWhere)
      : type === 'location' && req.scopeIds !== null
        ? { ...baseWhere, id: { in: req.scopeIds } }
        : baseWhere;
    if (type === 'location' && req.query.tree === 'true') return exports.tree(req, res, next);
    const [data, total] = await prisma.$transaction([prisma[c.model].findMany({ where, include: c.include, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }), prisma[c.model].count({ where })]);
    ok(res, data, 200, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
};
exports.tree = async (req, res, next) => { try {
  const rows = await prisma.location.findMany({
    where: req.scopeIds === null ? undefined : { id: { in: req.scopeIds } },
    include: { children: true },
    orderBy: { name: 'asc' }
  });
  const map = new Map(rows.map(x => [x.id, { ...x, children: [] }])); const roots = [];
  rows.forEach(x => x.parentId && map.has(x.parentId) ? map.get(x.parentId).children.push(map.get(x.id)) : roots.push(map.get(x.id)));
  ok(res, roots);
} catch (e) { next(e); } };
exports.get = type => async (req, res, next) => { try {
  const c = configs[type], item = await prisma[c.model].findUnique({ where: { id: req.params.id }, include: c.include });
  if (!item) return fail(res, 'NOT_FOUND', 'Resource not found', 404);
  if ((type === 'asset' || type === 'location') && req.scopeIds !== null && !req.scopeIds.includes(item.locationId || item.id))
    return fail(res, 'FORBIDDEN', 'Out of scope', 403);
  ok(res, item);
} catch (e) { next(e); } };
async function validateResource(tx, type, data, existing, req) {
  if (type === 'location') await locationRules(tx, { type: 'LOCATION', ...existing, ...data }, existing?.id, req);
  if (type === 'asset') {
    if (existing) scope(req, existing.locationId);
    scope(req, data.locationId || existing.locationId);
    if (data.locationId) await linked(tx, 'location', data.locationId);
    if (data.categoryId) await linked(tx, 'assetCategory', data.categoryId);
    if (data.assignedToUserId) await linked(tx, 'user', data.assignedToUserId);
    if (existing && data.locationId && data.locationId !== existing.locationId) throw error('Use transfers to change asset location');
    if (data.assignedToUserId !== undefined && data.assignedToUserId !== (existing?.assignedToUserId || null)) throw error('Use custody assignments to assign an asset');
  }
}
exports.create = type => async (req, res, next) => { try {
  const c = configs[type], data = clean(c.schema.parse(req.body), type);
  if (type === 'asset') data.qrCodeUrl = await generateAssetQR(data.assetTag);
  const item = await transaction(prisma, async tx => {
    await validateResource(tx, type, data, null, req);
    const item = await tx[c.model].create({ data, include: c.include });
    await log(tx, c.entity, item.id, 'CREATE', req, data);
    return item;
  });
  ok(res, item, 201);
} catch (e) { next(e); } };
exports.update = type => async (req, res, next) => { try {
  const c = configs[type], data = clean(c.schema.partial().parse(req.body), type);
  const item = await transaction(prisma, async tx => {
    const existing = await linked(tx, c.model, req.params.id);
    await validateResource(tx, type, data, existing, req);
    if (type === 'asset' && data.assetTag && data.assetTag !== existing.assetTag) data.qrCodeUrl = await generateAssetQR(data.assetTag);
    const item = await tx[c.model].update({ where: { id: existing.id }, data, include: c.include });
    await log(tx, c.entity, item.id, 'UPDATE', req, data);
    return item;
  });
  ok(res, item);
} catch (e) { next(e); } };
exports.remove = type => async (req, res, next) => { try {
  const c = configs[type];
  await transaction(prisma, async tx => {
    const item = await linked(tx, c.model, req.params.id);
    if (type === 'asset' || type === 'location') scope(req, item.locationId || item.id);
    if (type === 'location') {
      const counts = await Promise.all([
        tx.location.count({ where: { parentId: item.id } }), tx.asset.count({ where: { locationId: item.id } }),
        tx.user.count({ where: { scopeLocationId: item.id } }), tx.transfer.count({ where: { OR: [{ fromLocationId: item.id }, { toLocationId: item.id }] } }),
        tx.stocktakeSession.count({ where: { locationId: item.id } })
      ]);
      if (counts.some(Boolean)) throw error('Location is referenced by children, assets, scopes or history', 409);
    }
    if (type === 'asset') {
      for (const model of ['custodyAssignment','transfer','workOrder','warranty','retirement','attachment','stocktakeObservation','purchaseOrder']) {
        if (await tx[model].count({ where: { assetId: item.id } })) throw error('Asset has related records; retire it to preserve history', 409);
      }
    }
    await tx[c.model].delete({ where: { id: item.id } });
    await log(tx, c.entity, item.id, 'DELETE', req, item);
  });
  ok(res, { deleted: true });
} catch (e) { next(e); } };

exports.qr = type => async (req, res, next) => { try {
  if (type !== 'asset') return fail(res, 'NOT_FOUND', 'Resource not found', 404);
  const asset = await prisma.asset.findUnique({ where: { id: req.params.id }, select: { id: true, assetTag: true, locationId: true, qrCodeUrl: true } });
  if (!asset) return fail(res, 'NOT_FOUND', 'Resource not found', 404);
  if (req.scopeIds !== null && !req.scopeIds.includes(asset.locationId)) return fail(res, 'FORBIDDEN', 'Out of scope', 403);
  const qrCodeUrl = asset.qrCodeUrl || await generateAssetQR(asset.assetTag);
  if (!asset.qrCodeUrl) await prisma.asset.update({ where: { id: asset.id }, data: { qrCodeUrl } });
  if (req.query.format === 'base64') return ok(res, { base64: qrCodeUrl });
  const base64 = qrCodeUrl.split(',')[1];
  res.type('png').send(Buffer.from(base64, 'base64'));
} catch (e) { next(e); } };
