const { pagination, locationRules } = require('../../src/services/integrity');
test('pagination rejects invalid integers', () => {
  expect(() => pagination({ page: 'bad' })).toThrow();
  expect(() => pagination({ limit: -1 })).toThrow();
  expect(pagination({})).toEqual({ page: 1, limit: 20 });
});
test('hierarchy rejects cycles and reversed levels', async () => {
  const tx = { location: { findUnique: jest.fn().mockResolvedValue({ id: 'room', type: 'room', parentId: null }) } };
  await expect(locationRules(tx, { type: 'campus', parentId: 'room' }, 'campus', { scopeIds: null })).rejects.toThrow('Parent');
  tx.location.findUnique.mockResolvedValue({ id: 'self', type: 'LOCATION', parentId: null });
  await expect(locationRules(tx, { type: 'LOCATION', parentId: 'self' }, 'self', { scopeIds: null })).rejects.toThrow('cycles');
});
