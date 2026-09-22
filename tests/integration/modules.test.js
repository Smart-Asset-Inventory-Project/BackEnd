// Remote PostgreSQL workflows perform multiple round trips per test.
jest.setTimeout(120000);
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: '.env.test' });
require('../helpers/test-db')();
const request = require('supertest');
const app = require('../../src/index');
const prisma = require('../../src/utils/prisma');
const { signAccess } = require('../../src/utils/jwt');
let token, user, location, destination, asset, category;
const suffix = Date.now().toString();
const api = (method, path, body) => request(app)[method]('/api' + path).set('Authorization', 'Bearer ' + token).send(body);
beforeAll(async () => {
  const role = await prisma.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN' } });
  user = await prisma.user.create({ data: { name: 'Module test', email: suffix + '@test.local', password: 'not-a-login-password', roleId: role.id } });
  token = signAccess({ sub: user.id });
  category = await prisma.assetCategory.create({ data: { name: 'Test category', code: 'CAT-' + suffix } });
});
afterAll(async () => prisma.$disconnect());
describe('Module 1', () => {
  test('creates locations and prevents hierarchy cycles and referenced deletion', async () => {
    const first = await api('post', '/locations', { name: 'Campus', code: 'LOC-' + suffix, type: 'campus' });
    expect(first.status).toBe(201); location = first.body.data;
    const second = await api('post', '/locations', { name: 'Room', code: 'ROOM-' + suffix, type: 'room', parentId: location.id });
    expect(second.status).toBe(201); destination = second.body.data;
    expect((await api('put', '/locations/' + location.id, { parentId: destination.id })).status).toBe(400);
    expect((await api('delete', '/locations/' + location.id)).status).toBe(409);
  });
  test('creates, updates, searches and retrieves an asset with audit history', async () => {
    const created = await api('post', '/assets', { name: 'Laptop', assetTag: 'ASSET-' + suffix, serialNumber: suffix, categoryId: category.id, locationId: location.id, condition: 'GOOD' });
    expect(created.status).toBe(201); asset = created.body.data;
    expect((await api('put', '/assets/' + asset.id, { name: 'Updated laptop' })).status).toBe(200);
    const read = await api('get', '/assets/' + asset.id);
    expect(read.body.data.name).toBe('Updated laptop');
    expect(read.body.data.location.id).toBe(location.id);
    expect((await api('get', '/assets?search=' + suffix + '&condition=GOOD')).body.data.some(x => x.id === asset.id)).toBe(true);
    expect((await api('post', '/assets', { name: 'Duplicate', assetTag: asset.assetTag, categoryId: category.id, locationId: location.id })).status).toBe(409);
    expect((await api('get', '/assets?page=bad')).status).toBe(400);
    expect(await prisma.auditLog.count({ where: { entityId: asset.id } })).toBe(2);
  });
  test('requires authentication and write permissions', async () => {
    expect((await request(app).get('/api/assets')).status).toBe(401);
    const role = await prisma.role.create({ data: { name: 'NO-PERM-' + suffix } });
    const viewer = await prisma.user.create({ data: { name: 'Viewer', email: 'viewer-' + suffix + '@test.local', password: 'unused', roleId: role.id } });
    expect((await request(app).post('/api/assets').set('Authorization', 'Bearer ' + signAccess({ sub: viewer.id })).send({})).status).toBe(403);
  });
});

describe('Module 2', () => {
  test('transfers atomically and records history', async () => {
    const response = await api('post', '/transfers', { assetId: asset.id, toLocationId: destination.id, reason: 'Test move' });
    expect(response.status).toBe(201);
    expect(response.body.data.fromLocationId).toBe(location.id);
    expect((await api('get', '/assets/' + asset.id)).body.data.locationId).toBe(destination.id);
    expect((await api('get', '/assets/' + asset.id + '/history')).body.data.some(x => x.type === 'transfer')).toBe(true);
    expect((await api('post', '/transfers', { assetId: asset.id, toLocationId: destination.id })).status).toBe(400);
    expect((await api('post', '/transfers', { assetId: asset.id, toLocationId: 'missing' })).status).toBe(404);
  });
  test('prevents duplicate custody and releases the assignment', async () => {
    const assigned = await api('post', '/custody-assignments', { assetId: asset.id, userId: user.id });
    expect(assigned.status).toBe(201);
    expect((await api('post', '/custody-assignments', { assetId: asset.id, userId: user.id })).status).toBe(409);
    expect((await api('put', '/custody-assignments/' + assigned.body.data.id, { returnedAt: new Date().toISOString(), notes: 'Returned' })).status).toBe(200);
    expect((await api('get', '/assets/' + asset.id)).body.data.assignedToUserId).toBeNull();
    expect((await api('delete', '/assets/' + asset.id)).status).toBe(409);
  });
  test('creates procurement documents and validates warranty dates', async () => {
    const supplier = await api('post', '/suppliers', { name: 'Supplier ' + suffix });
    expect(supplier.status).toBe(201);
    const order = await api('post', '/purchase-orders', { orderNumber: 'PO-' + suffix, supplierId: supplier.body.data.id, totalAmount: 100 });
    expect(order.status).toBe(201);
    expect((await api('post', '/invoices', { invoiceNumber: 'INV-' + suffix, purchaseOrderId: order.body.data.id, amount: 100, issueDate: '2026-01-01' })).status).toBe(201);
    expect((await api('post', '/purchase-orders', { orderNumber: 'bad', supplierId: 'missing' })).status).toBe(404);
    expect((await api('post', '/warranties', { assetId: asset.id, startDate: '2026-01-02', endDate: '2026-01-01' })).status).toBe(400);
    expect((await api('post', '/warranties', { assetId: asset.id, startDate: '2026-01-01', endDate: '2027-01-01' })).status).toBe(201);
  });
});

describe('Module 3', () => {
  let order;
  test('creates template and work order and filters by technician and date', async () => {
    const template = await api('post', '/maintenance-templates', { name: 'Inspection', categoryId: category.id, triggerType: 'TIME_BASED', frequencyDays: 30, tasks: ['Inspect cables'] });
    expect(template.status).toBe(201);
    const result = await api('post', '/work-orders', { assetId: asset.id, templateId: template.body.data.id, title: 'Inspect', assignedToUserId: user.id, dueDate: '2026-10-01' });
    expect(result.status).toBe(201); order = result.body.data;
    const list = await api('get', '/work-orders?assignedToUserId=' + user.id + '&scheduledFrom=2026-09-01&scheduledTo=2026-11-01');
    expect(list.status).toBe(200);
    expect(list.body.data.some(x => x.id === order.id)).toBe(true);
    expect((await api('delete', '/maintenance-templates/' + template.body.data.id)).status).toBe(409);
  });
  test('rejects invalid transitions then completes through valid statuses', async () => {
    expect((await api('put', '/work-orders/' + order.id, { status: 'COMPLETED' })).status).toBe(400);
    for (const status of ['ASSIGNED', 'IN_PROGRESS']) expect((await api('put', '/work-orders/' + order.id, { status })).status).toBe(200);
    expect((await api('put', '/work-orders/' + order.id + '/complete', { laborCost: -1 })).status).toBe(400);
    const completed = await api('put', '/work-orders/' + order.id + '/complete', { laborCost: 100, partsCost: 50, downtimeHours: 2, outcome: 'Fixed' });
    expect(completed.status).toBe(200);
    expect(completed.body.data.completedAt).toBeTruthy();
    expect(completed.body.data.serviceEvents[0].cost).toBe('150');
    expect((await api('put', '/work-orders/' + order.id, { status: 'OPEN' })).status).toBe(409);
    expect((await api('post', '/service-events', { workOrderId: order.id, laborCost: 5, partsCost: 10, notes: 'Follow-up' })).status).toBe(201);
    expect((await api('get', '/service-events?workOrderId=' + order.id)).body.meta.total).toBe(2);
  });
});

describe('Cross-module integrity', () => {
  test('invalid tokens and out-of-scope inventory operations are rejected', async () => {
    expect((await request(app).get('/api/assets').set('Authorization', 'Bearer invalid')).status).toBe(401);
    const outside = await prisma.location.create({ data: { name: 'Outside scope', code: 'OUT-' + suffix } });
    const role = await prisma.role.create({ data: { name: 'SCOPED-' + suffix } });
    const scoped = await prisma.user.create({ data: { name: 'Scoped', email: 'scoped-' + suffix + '@test.local', password: 'unused', roleId: role.id, scopeLocationId: outside.id } });
    const scopedToken = signAccess({ sub: scoped.id });
    for (const path of ['/assets/' + asset.id, '/assets/' + asset.id + '/history']) expect((await request(app).get('/api' + path).set('Authorization', 'Bearer ' + scopedToken)).status).toBe(403);
  });
  test('concurrent custody requests create only one active assignment', async () => {
    const results = await Promise.all([api('post', '/custody-assignments', { assetId: asset.id, userId: user.id }), api('post', '/custody-assignments', { assetId: asset.id, userId: user.id })]);
    expect(results.map(x => x.status).sort()).toEqual([201,409]);
    expect(await prisma.custodyAssignment.count({ where: { assetId: asset.id, returnedAt: null } })).toBe(1);
  });
  test('transfer user projections exclude stored credentials', async () => {
    const moved = await api('post', '/transfers', { assetId: asset.id, toLocationId: location.id });
    expect(moved.status).toBe(201);
    expect(moved.body.data.toUser.id).toBe(user.id);
    expect(moved.body.data.toUser.password).toBeUndefined();
    expect(moved.body.data.toUser.refreshToken).toBeUndefined();
    expect(moved.body.data.asset.assignedToUserId).toBe(user.id);
    expect(await prisma.auditLog.count({ where: { entityId: moved.body.data.id } })).toBe(1);
  });
});
