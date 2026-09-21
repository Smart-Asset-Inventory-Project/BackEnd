const prisma = require('../utils/prisma');
const { ok } = require('../utils/response');
const { computeRiskScore } = require('../services/rules');
const { applyScopeFilter } = require('../utils/scope');

const pagination = req => ({
  page: Math.max(1, Number(req.query.page || 1)),
  limit: Math.min(100, Math.max(1, Number(req.query.limit || 20)))
});
const meta = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });

exports.summary = async (req, res, next) => {
  try {
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 86400000);
    const assetWhere = applyScopeFilter(req.scopeIds, {});
    const relatedAsset = req.scopeIds === null ? {} : { asset: assetWhere };
    const [totalAssets, activeAssets, maintenanceAssets, retiredAssets, totalLocations, totalCategories,
      openWorkOrders, overdueWorkOrders, dueSoonWorkOrders, expiringWarranties30d, expiringWarranties60d,
      expiringWarranties90d, totalValue] = await Promise.all([
      prisma.asset.count({ where: assetWhere }),
      prisma.asset.count({ where: { ...assetWhere, status: 'ACTIVE' } }),
      prisma.asset.count({ where: { ...assetWhere, status: 'MAINTENANCE' } }),
      prisma.asset.count({ where: { ...assetWhere, status: 'RETIRED' } }),
      prisma.location.count({ where: req.scopeIds === null ? undefined : { id: { in: req.scopeIds } } }),
      prisma.assetCategory.count({ where: req.scopeIds === null ? undefined : { assets: { some: assetWhere } } }),
      prisma.workOrder.count({ where: { ...relatedAsset, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.workOrder.count({ where: { ...relatedAsset, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { lt: now } } }),
      prisma.workOrder.count({ where: { ...relatedAsset, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { gte: now, lte: week } } }),
      prisma.warranty.count({ where: { ...relatedAsset, endDate: { gte: now, lte: new Date(now.getTime() + 30 * 86400000) } } }),
      prisma.warranty.count({ where: { ...relatedAsset, endDate: { gte: now, lte: new Date(now.getTime() + 60 * 86400000) } } }),
      prisma.warranty.count({ where: { ...relatedAsset, endDate: { gte: now, lte: new Date(now.getTime() + 90 * 86400000) } } }),
      prisma.asset.aggregate({ where: assetWhere, _sum: { value: true } })
    ]);
    ok(res, { totalAssets, activeAssets, maintenanceAssets, retiredAssets, totalLocations, totalCategories,
      openWorkOrders, overdueWorkOrders, dueSoonWorkOrders, expiringWarranties30d, expiringWarranties60d,
      expiringWarranties90d, totalValue: totalValue._sum.value || 0 });
  } catch (e) { next(e); }
};

async function groupedBy(field, relation, req, label = relation) {
  const { page, limit } = pagination(req);
  const grouped = await prisma.asset.groupBy({
    by: [field], where: { ...applyScopeFilter(req.scopeIds, {}), status: 'ACTIVE' }, _count: { _all: true }, orderBy: { _count: { [field]: 'desc' } }
  });
  const total = grouped.length;
  const rows = grouped.slice((page - 1) * limit, page * limit);
  const ids = rows.map(row => row[field]).filter(Boolean);
  const related = await prisma[relation].findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const names = new Map(related.map(row => [row.id, row.name]));
  return { rows: rows.map(row => ({
    [`${label}Id`]: row[field],
    [`${label}Name`]: names.get(row[field]) || null,
    count: row._count._all
  })), meta: meta(page, limit, total) };
}

exports.countsByLocation = async (req, res, next) => {
  try {
    const { page, limit } = pagination(req);

    // Fetch all locations for ancestor lookup
    const allLocations = await prisma.location.findMany({
      select: { id: true, name: true, type: true, parentId: true }
    });
    const locMap = new Map(allLocations.map(l => [l.id, l]));

    // Walk up the ancestor chain until we find a location of type 'building'
    function findBuildingId(locationId) {
      let current = locMap.get(locationId);
      let lastSeen = locationId;
      const visited = new Set();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        if (current.type === 'building') return current.id;
        lastSeen = current.id;
        current = current.parentId ? locMap.get(current.parentId) : null;
      }
      return lastSeen;
    }

    // Group all assets by their building ancestor
    const assets = await prisma.asset.findMany({ where: applyScopeFilter(req.scopeIds, {}), select: { locationId: true } });
    const counts = new Map();
    for (const a of assets) {
      if (!a.locationId) continue;
      const buildingId = findBuildingId(a.locationId);
      counts.set(buildingId, (counts.get(buildingId) || 0) + 1);
    }

    // Build sorted result
    const results = Array.from(counts.entries())
      .map(([buildingId, count]) => ({
        locationId: buildingId,
        locationName: locMap.get(buildingId)?.name || null,
        count
      }))
      .sort((a, b) => b.count - a.count);

    const total = results.length;
    const paged = results.slice((page - 1) * limit, page * limit);

    ok(res, paged, 200, meta(page, limit, total));
  } catch (e) { next(e); }
};

exports.countsByCategory = async (req, res, next) => {
  try { const result = await groupedBy('categoryId', 'assetCategory', req, 'category'); ok(res, result.rows, 200, result.meta); } catch (e) { next(e); }
};

exports.warrantyExpiry = async (req, res, next) => {
  try {
    const now = new Date();
    const relatedAsset = req.scopeIds === null ? {} : { asset: applyScopeFilter(req.scopeIds, {}) };
    const [within60Days, within90Days] = await Promise.all([
      prisma.warranty.findMany({ where: { ...relatedAsset, endDate: { gte: now, lte: new Date(now.getTime() + 60 * 86400000) }, asset: { ...relatedAsset.asset, status: 'ACTIVE' } }, include: { asset: true }, orderBy: { endDate: 'asc' } }),
      prisma.warranty.findMany({ where: { ...relatedAsset, endDate: { gte: now, lte: new Date(now.getTime() + 90 * 86400000) }, asset: { ...relatedAsset.asset, status: 'ACTIVE' } }, include: { asset: true }, orderBy: { endDate: 'asc' } })
    ]);
    const within30 = await prisma.warranty.findMany({ where: { ...relatedAsset, endDate: { gte: now, lte: new Date(now.getTime() + 30 * 86400000) }, asset: { ...relatedAsset.asset, status: 'ACTIVE' } }, include: { asset: true }, orderBy: { endDate: 'asc' } });
    ok(res, { within30d: within30, within60d: within60Days, within90d: within90Days });
  } catch (e) { next(e); }
};

exports.maintenanceDue = async (req, res, next) => {
  try {
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 86400000);
    const where = { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { gte: now, lte: end }, asset: { ...applyScopeFilter(req.scopeIds, {}), status: 'ACTIVE' } };
    const { page, limit } = pagination(req);
    const [data, total] = await prisma.$transaction([
      prisma.workOrder.findMany({ where, include: { asset: true }, orderBy: { dueDate: 'asc' }, skip: (page - 1) * limit, take: limit }),
      prisma.workOrder.count({ where })
    ]);
    ok(res, data, 200, meta(page, limit, total));
  } catch (e) { next(e); }
};

exports.kpis = async (req, res, next) => {
  try {
    // MTTR: average (completedAt - createdAt) in hours for completed work orders
    const completedWOs = await prisma.workOrder.findMany({
      where: { status: 'COMPLETED', completedAt: { not: null }, asset: applyScopeFilter(req.scopeIds, {}) },
      select: { createdAt: true, completedAt: true }
    });

    let mttrHours = 0;
    if (completedWOs.length > 0) {
      const totalHours = completedWOs.reduce((sum, wo) => {
        const diff = new Date(wo.completedAt).getTime() - new Date(wo.createdAt).getTime();
        return sum + (diff / 3600000);
      }, 0);
      mttrHours = Math.round((totalHours / completedWOs.length) * 100) / 100;
    }

    // Total downtime from ServiceEvent
    const downtimeAgg = await prisma.serviceEvent.aggregate({
      where: { workOrder: { asset: applyScopeFilter(req.scopeIds, {}) } },
      _sum: { downtimeHours: true }
    });
    const totalDowntimeHours = downtimeAgg._sum.downtimeHours || 0;

    // Preventive vs corrective work orders
    const [preventiveCount, correctiveCount] = await Promise.all([
      prisma.workOrder.count({ where: { templateId: { not: null }, asset: applyScopeFilter(req.scopeIds, {}) } }),
      prisma.workOrder.count({ where: { templateId: null, asset: applyScopeFilter(req.scopeIds, {}) } })
    ]);

    const total = preventiveCount + correctiveCount;
    const preventiveRatio = total > 0 ? Math.round((preventiveCount / total) * 100) / 100 : 0;

    ok(res, { mttrHours, totalDowntimeHours, preventiveCount, correctiveCount, preventiveRatio });
  } catch (e) { next(e); }
};

exports.riskQueue = async (req, res, next) => {
  try {
    const assets = await prisma.asset.findMany({
      where: { ...applyScopeFilter(req.scopeIds, {}), status: 'ACTIVE' },
      include: { warranty: true, workOrders: { include: { serviceEvents: true }, orderBy: { dueDate: 'asc' } } }
    });
    const ranked = assets.map(asset => {
      const risk = computeRiskScore(asset);
      return { asset: { id: asset.id, assetTag: asset.assetTag, name: asset.name }, score: risk.score, reasons: risk.reasons };
    }).filter(asset => asset.score > 0).sort((a, b) => b.score - a.score).slice(0, 50);
    const { page, limit } = pagination(req);
    ok(res, ranked.slice((page - 1) * limit, page * limit), 200, meta(page, limit, ranked.length));
  } catch (e) { next(e); }
};