const { z } = require('zod');
const error = (message, status = 400) => Object.assign(new Error(message), { status, code: status === 409 ? 'CONFLICT' : status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : 'VALIDATION_ERROR' });
const pagination = query => z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(query);
const scope = (req, id) => { if (req.scopeIds !== null && !req.scopeIds.includes(id)) throw error('Out of scope', 403); };
async function linked(tx, model, id) {
  const item = id && await tx[model].findUnique({ where: { id } });
  if (!item) throw error(`${model} not found`, 404);
  return item;
}
const log = (tx, entityType, entityId, action, req, details) => tx.auditLog.create({ data: { entityType, entityId, action, userId: req.user.sub, details: JSON.stringify(details) } });
const transaction = (prisma, fn) => prisma.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15000 });
async function locationRules(tx, data, id, req) {
  if (id) scope(req, id);
  const rank = { campus: 0, building: 1, college: 2, floor: 3, room: 4, office: 4, location: -1 };
  const type = data.type.toLowerCase();
  if (!(type in rank)) throw error('Invalid location type');
  if (data.parentId) {
    scope(req, data.parentId);
    let parent = await linked(tx, 'location', data.parentId);
    if (rank[type] >= 0 && rank[parent.type.toLowerCase()] >= rank[type]) throw error('Parent must be above child in the location hierarchy');
    const seen = new Set(id ? [id] : []);
    while (parent) {
      if (seen.has(parent.id)) throw error('Location hierarchy cannot contain cycles');
      seen.add(parent.id);
      parent = parent.parentId ? await linked(tx, 'location', parent.parentId) : null;
    }
  } else if (req.scopeIds !== null) throw error('Scoped locations require a parent within scope', 403);
  if (id) {
    const children = await tx.location.findMany({ where: { parentId: id } });
    if (children.some(child => rank[type] >= 0 && rank[child.type.toLowerCase()] >= 0 && rank[type] >= rank[child.type.toLowerCase()])) throw error('Location type is incompatible with its children');
  }
}
module.exports = { error, pagination, scope, linked, log, transaction, locationRules };
