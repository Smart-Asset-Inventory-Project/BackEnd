jest.mock('../../src/utils/prisma', () => ({
  user: { findUnique: jest.fn() }, location: { findMany: jest.fn() }
}));
const prisma = require('../../src/utils/prisma');
const { getScopeLocationIds, applyScopeFilter } = require('../../src/utils/scope');
beforeEach(() => jest.clearAllMocks());
test('scope traversal batches siblings and terminates cycles', async () => {
  prisma.user.findUnique.mockResolvedValue({ role: { name: 'CUSTODIAN' }, scopeLocationId: 'root' });
  prisma.location.findMany
    .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
    .mockResolvedValueOnce([{ id: 'root' }, { id: 'c' }, { id: 'c' }])
    .mockResolvedValueOnce([]);
  expect(await getScopeLocationIds('user')).toEqual(['root', 'a', 'b', 'c']);
  expect(prisma.location.findMany).toHaveBeenCalledTimes(3);
  expect(prisma.location.findMany.mock.calls[1][0].where).toEqual({ parentId: { in: ['a', 'b'] } });
});
test('admin scope bypass and explicit location filters remain intact', async () => {
  prisma.user.findUnique.mockResolvedValue({ role: { name: 'ADMIN' }, scopeLocationId: 'root' });
  expect(await getScopeLocationIds('admin')).toBeNull();
  expect(prisma.location.findMany).not.toHaveBeenCalled();
  expect(applyScopeFilter(['root'], { locationId: 'outside' })).toEqual({ AND: [{ locationId: 'outside' }, { locationId: { in: ['root'] } }] });
});
