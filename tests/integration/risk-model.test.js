jest.setTimeout(120000);
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: '.env.test' });
require('../helpers/test-db')();
const request = require('supertest');
const app = require('../../src/index');
const prisma = require('../../src/utils/prisma');
const { signAccess } = require('../../src/utils/jwt');
const sample = require('../../src/model/risk-model-parity.json').cases[0];
let admin, reader, outsideAsset, ownAsset;
beforeAll(async () => {
  const adminRole = await prisma.role.create({ data: { name: 'ADMIN' } });
  const permission = await prisma.permission.create({ data: { code: 'dashboard:read', name: 'Read dashboard' } });
  const readerRole = await prisma.role.create({ data: { name: 'RISK_READER', permissions: { create: { permissionId: permission.id } } } });
  const location = await prisma.location.create({ data: { name: 'Inside', code: 'IN' } });
  const outside = await prisma.location.create({ data: { name: 'Outside', code: 'OUT' } });
  const category = await prisma.assetCategory.create({ data: { name: 'Laptop', code: 'LAP' } });
  for (const [name, roleId] of [['Admin', adminRole.id], ['Reader', readerRole.id]]) {
    const user = await prisma.user.create({ data: { name, email: name + '@risk.test', password: 'unused', roleId, scopeLocationId: location.id } });
    if (name === 'Admin') admin = signAccess({ sub: user.id }); else reader = signAccess({ sub: user.id });
  }
  const data = { name: 'Laptop', categoryId: category.id, condition: 'Good', status: 'ACTIVE',
    usefulLifeYears: 5, purchaseCost: '1200', purchaseDate: new Date('2025-01-01') };
  ownAsset = await prisma.asset.create({ data: { ...data, assetTag: 'IN', locationId: location.id, warranty: { create: { startDate: new Date('2025-01-01'), endDate: new Date('2028-01-01') } } } });
  outsideAsset = await prisma.asset.create({ data: { ...data, assetTag: 'OUT', locationId: outside.id } });
});
afterAll(async () => prisma.$disconnect());
test('prediction is authenticated and returns the trained model contract', async () => {
  expect((await request(app).post('/api/risk-model/predict').send(sample.features)).status).toBe(401);
  const prediction = await request(app).post('/api/risk-model/predict').set('Authorization', 'Bearer ' + reader).send(sample.features);
  expect(prediction.status).toBe(200);
  expect(prediction.body.data.riskLevel).toBe(sample.riskLevel);
  expect(prediction.body.data.modelVersion).toBeTruthy();
  expect((await request(app).post('/api/risk-model/predict').set('Authorization', 'Bearer ' + reader).send({ ...sample.features, labor_hours: -1 })).status).toBe(400);
});
test('live asset prediction checks scope and missing labor data', async () => {
  const call = (id, body) => request(app).post('/api/risk-model/assets/' + id + '/predict').set('Authorization', 'Bearer ' + reader).send(body);
  expect((await call(outsideAsset.id, { laborHours: 2 })).status).toBe(403);
  expect((await call('missing', { laborHours: 2 })).status).toBe(404);
  expect((await call(ownAsset.id, {})).status).toBe(400);
  const result = await call(ownAsset.id, { laborHours: 2 });
  expect(result.status).toBe(200);
  expect(result.body.data.assetId).toBe(ownAsset.id);
  expect(result.body.data.features.labor_hours).toBe(2);
});
test('model status exposes metadata without trees and reader cannot train', async () => {
  const info = await request(app).get('/api/risk-model').set('Authorization', 'Bearer ' + reader);
  expect(info.status).toBe(200);
  expect(info.body.data.datasetRows).toBe(1000);
  expect(info.body.data.trees).toBeUndefined();
  expect((await request(app).post('/api/risk-model/train').set('Authorization', 'Bearer ' + reader).send({})).status).toBe(403);
});
test('Vercel uses bundled inference and disables training even for admin', async () => {
  process.env.VERCEL = '1';
  try {
    expect((await request(app).post('/api/risk-model/predict').set('Authorization', 'Bearer ' + admin).send(sample.features)).status).toBe(200);
    expect((await request(app).post('/api/risk-model/train').set('Authorization', 'Bearer ' + admin).send({})).status).toBe(409);
  } finally { delete process.env.VERCEL; }
});
