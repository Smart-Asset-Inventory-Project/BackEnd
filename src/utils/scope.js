const prisma = require('./prisma');

exports.getScopeLocationIds = async userId => {
  if (typeof userId !== 'string' || !userId) throw Object.assign(new Error('Invalid access token'), { status: 401, code: 'UNAUTHENTICATED' });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true }
  });
  if (!user) throw Object.assign(new Error('User no longer exists'), { status: 401, code: 'UNAUTHENTICATED' });
  if (user.role.name === 'ADMIN' || user.scopeLocationId === null) return null;

  const ids = [];
  let frontier = [user.scopeLocationId];
  const visited = new Set();
  while (frontier.length) {
    const level = [...new Set(frontier)].filter(id => !visited.has(id));
    if (!level.length) break;
    for (const id of level) { visited.add(id); ids.push(id); }
    // One round trip per hierarchy level instead of one per location.
    const children = await prisma.location.findMany({ where: { parentId: { in: level } }, select: { id: true } });
    frontier = children.map(child => child.id);
  }
  return ids;
};

exports.applyScopeFilter = (scopeIds, where = {}) =>
  scopeIds === null ? where : { AND: [where, { locationId: { in: scopeIds } }] };
