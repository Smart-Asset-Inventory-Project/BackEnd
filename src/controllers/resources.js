const prisma = require('../utils/prisma');
const { ok, fail } = require('../utils/response');
const audit = require('../utils/audit');
const { z } = require('zod');
const { applyScopeFilter } = require('../utils/scope');
const { generateAssetQR } = require('../services/qrcode');

const configs = {
  location: { model: 'location', entity: 'Location', include: { parent: true, children: true },
    schema: z.object({ name: z.string().min(1), code: z.string().min(1), type: z.string().optional(), address: z.string().optional().nullable(), description: z.string().optional().nullable(), parentId: z.string().optional().nullable() }),
    permission: 'location:manage' },
  category: { model: 'assetCategory', entity: 'AssetCategory', include: { assets: { select: { id: true, assetTag: true, name: true } } },
    schema: z.object({ name: z.string().min(1), code: z.string().min(1), description: z.string().optional().nullable() }),
    permission: 'category:manage' },
  asset: { model: 'asset', entity: 'Asset', include: { category: true, location: true, assignedTo: { select: { id: true, name: true, email: true } } },
    schema: z.object({ assetTag: z.string().min(1), name: z.string().min(1), categoryId: z.string().min(1), locationId: z.string().min(1), serialNumber: z.string().optional().nullable(), model: z.string().optional().nullable(), status: z.string().optional(), value: z.any().optional().nullable(), condition: z.string().optional().nullable(), assignedToUserId: z.string().optional().nullable(), purchaseDate: z.coerce.date().optional().nullable(), metadata: z.any().optional().nullable() }),
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
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.locationId) where.locationId = query.locationId;
  } else if (type === 'location' && query.parentId !== undefined) where.parentId = query.parentId || null;
  return where;
};
exports.list = type => async (req, res, next) => {
  try {
    const c = configs[type], page = Math.max(1, Number(req.query.page || 1)), limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
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
exports.create = type => async (req, res, next) => { try {
  const c = configs[type], parsed = c.schema.parse(req.body);
  const data = clean(parsed, type);
  if (type === 'asset') data.qrCodeUrl = await generateAssetQR(data.assetTag);
  const item = await prisma[c.model].create({ data, include: c.include });
  await audit(c.entity, item.id, 'CREATE', req.user.sub, parsed); ok(res, item, 201);
} catch (e) { next(e); } };
exports.update = type => async (req, res, next) => { try {
  const c = configs[type], parsed = c.schema.partial().parse(req.body);
  if (type === 'asset' && req.scopeIds !== null) {
    const existing = await prisma.asset.findUnique({ where: { id: req.params.id }, select: { locationId: true } });
    if (!existing) return fail(res, 'NOT_FOUND', 'Resource not found', 404);
    if (!req.scopeIds.includes(existing.locationId) || (parsed.locationId && !req.scopeIds.includes(parsed.locationId))) return fail(res, 'FORBIDDEN', 'Out of scope', 403);
  }
  const item = await prisma[c.model].update({ where: { id: req.params.id }, data: clean(parsed, type), include: c.include });
  await audit(c.entity, item.id, 'UPDATE', req.user.sub, parsed); ok(res, item);
} catch (e) { next(e); } };
exports.remove = type => async (req, res, next) => { try {
  const c = configs[type];
  if ((type === 'asset' || type === 'location') && req.scopeIds !== null) {
    const existing = await prisma[c.model].findUnique({ where: { id: req.params.id }, select: type === 'asset' ? { locationId: true } : { id: true } });
    if (!existing) return fail(res, 'NOT_FOUND', 'Resource not found', 404);
    if (!req.scopeIds.includes(existing.locationId || existing.id)) return fail(res, 'FORBIDDEN', 'Out of scope', 403);
  }
  if (type === 'location') {
    const [children, assets] = await Promise.all([
      prisma.location.count({ where: { parentId: req.params.id } }),
      prisma.asset.count({ where: { locationId: req.params.id } })
    ]);
    if (children || assets) return fail(res, 'DELETE_BLOCKED', 'Location has children or assets', 409);
  }
  if (type === 'category' && await prisma.asset.count({ where: { categoryId: req.params.id } }))
    return fail(res, 'DELETE_BLOCKED', 'Category has assets', 409);
  const item = await prisma[c.model].delete({ where: { id: req.params.id } });
  await audit(c.entity, item.id, 'DELETE', req.user.sub, item); ok(res, { deleted: true });
} catch (e) { if (e.code === 'P2003' || e.code === 'P2014') return fail(res, 'DELETE_BLOCKED', 'Resource is referenced and cannot be deleted', 409); next(e); } };

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
