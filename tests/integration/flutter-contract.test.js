jest.setTimeout(120000);
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: '.env.test' });
require('../helpers/test-db')();
const request = require('supertest');
const app = require('../../src/index');
const prisma = require('../../src/utils/prisma');
const { signAccess } = require('../../src/utils/jwt');
afterAll(async () => prisma.$disconnect());

test('malformed login/register bodies and invalid refresh tokens return client errors', async () => {
  for (const route of ['login', 'register', 'refresh']) {
    const result = await request(app).post('/api/auth/' + route).send({});
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
  }
  const result = await request(app).post('/api/auth/refresh').send({ refreshToken: 'invalid' });
  expect(result.status).toBe(401);
  expect(result.body.error.code).toBe('UNAUTHENTICATED');
});

test('tokens for deleted users and attachment-only tokens cannot read inventory', async () => {
  for (const payload of [{ sub: 'missing-user' }, { attachmentId: 'file', userId: 'missing-user' }]) {
    const result = await request(app).get('/api/assets').set('Authorization', 'Bearer ' + signAccess(payload));
    expect(result.status).toBe(401);
  }
});

test('purchase-order reads cannot bypass invoice permissions', async () => {
  const role = await prisma.role.create({ data: { name: 'VIEWER' } });
  const user = await prisma.user.create({ data: { name: 'Viewer', email: 'viewer@contract.test', password: 'unused', roleId: role.id } });
  const supplier = await prisma.supplier.create({ data: { name: 'Supplier' } });
  const order = await prisma.purchaseOrder.create({ data: { orderNumber: 'CONTRACT-PO', supplierId: supplier.id } });
  const invoice = await prisma.invoice.create({ data: { invoiceNumber: 'PRIVATE-INVOICE', purchaseOrderId: order.id, amount: 10, issueDate: new Date() } });
  const header = 'Bearer ' + signAccess({ sub: user.id });
  const result = await request(app).get('/api/purchase-orders/' + order.id).set('Authorization', header);
  expect(result.status).toBe(200);
  expect(result.body.data.invoices).toBeUndefined();
  expect((await request(app).get('/api/invoices/' + invoice.id).set('Authorization', header)).status).toBe(403);
});

test('Swagger JSON uses bearer auth and documents module endpoints', async () => {
  const result = await request(app).get('/swagger.json');
  expect(result.status).toBe(200);
  expect(result.body.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  expect(result.body.paths['/service-events'].post).toBeDefined();
});

test('scoped writers cannot modify outside stocktakes or import outside assets', async () => {
  const location = await prisma.location.create({ data: { name: 'Scope', code: 'SCOPE' } });
  const outside = await prisma.location.create({ data: { name: 'Outside', code: 'OUTSIDE' } });
  const category = await prisma.assetCategory.create({ data: { name: 'Category', code: 'CATEGORY' } });
  const permission = await prisma.permission.create({ data: { name: 'Write assets', code: 'asset:write' } });
  const role = await prisma.role.create({ data: { name: 'SCOPED_WRITER', permissions: { create: { permissionId: permission.id } } } });
  const user = await prisma.user.create({ data: { name: 'Scoped', email: 'scoped@contract.test', password: 'unused', roleId: role.id, scopeLocationId: location.id } });
  const session = await prisma.stocktakeSession.create({ data: { name: 'Outside session', locationId: outside.id, createdByUserId: user.id } });
  const asset = await prisma.asset.create({ data: { name: 'Outside asset', assetTag: 'OUTSIDE-ASSET', locationId: outside.id, categoryId: category.id } });
  const header = 'Bearer ' + signAccess({ sub: user.id });
  expect((await request(app).put('/api/stocktake-sessions/' + session.id + '/complete').set('Authorization', header).send({})).status).toBe(403);
  expect((await request(app).post('/api/stocktake-sessions/' + session.id + '/observations').set('Authorization', header).send({ assetId: asset.id, status: 'FOUND' })).status).toBe(403);
  const csv = Buffer.from('name,assetTag,categoryCode,locationCode\nImported,IMPORT-OUTSIDE,CATEGORY,OUTSIDE');
  const imported = await request(app).post('/api/assets/import').set('Authorization', header).attach('file', csv, 'scope.csv');
  expect(imported.status).toBe(200);
  expect(imported.body.data.imported).toBe(0);
  expect(imported.body.data.errors[0].message).toBe('Out of scope');
  expect(await prisma.asset.count({ where: { assetTag: 'IMPORT-OUTSIDE' } })).toBe(0);
});
