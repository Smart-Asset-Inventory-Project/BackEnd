const prisma = require('./prisma');

exports.getScopeLocationIds = async userId => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true }
  });
  if (!user || user.role.name === 'ADMIN' || user.scopeLocationId === null) return null;

  const ids = [];
  const queue = [user.scopeLocationId];
  const visited = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    ids.push(id);
    const children = await prisma.location.findMany({ where: { parentId: id }, select: { id: true } });
    for (const child of children) queue.push(child.id);
  }
  return ids;
};

exports.applyScopeFilter = (scopeIds, where = {}) =>
  scopeIds === null ? where : { ...where, locationId: { in: scopeIds } };
