process.env.NODE_ENV = 'test';
require('dotenv').config({ path: '.env.test' });
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
require('../helpers/test-db')();
execFileSync(process.platform === 'win32' ? process.env.ComSpec : 'npx',
  process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npx prisma db seed']
    : ['prisma', 'db', 'seed'],
  { cwd: process.cwd(), stdio: 'inherit', env: process.env });

const request = require('supertest');
const app = require('../../src/index');
const prisma = require('../../src/utils/prisma');

const credentials = {
  admin: ['admin@assethub.local', 'Admin@123'],
  procurement: ['procurement@assethub.local', 'Test@123'],
  custodian: ['custodian@assethub.local', 'Test@123'],
  technician: ['technician@assethub.local', 'Test@123']
};

async function login(role) {
  const response = await request(app).post('/auth/login').send({
    email: credentials[role][0],
    password: credentials[role][1]
  });
  expect(response.status).toBe(200);
  return response.body.data.accessToken;
}

describe('brief acceptance scenarios', () => {
  afterAll(async () => prisma.$disconnect());

  test('admin imports 100+ assets and reports duplicates', async () => {
    const token = await login('admin');
    const initial = await request(app).get('/assets?limit=1').set('Authorization', `Bearer ${token}`);
    expect(initial.body.meta.total).toBe(120);
    const category = await prisma.assetCategory.findFirst();
    const location = await prisma.location.findFirst({ where: { type: 'room' } });
    const csv = [
      'name,assetTag,categoryCode,locationCode',
      `Acceptance One,ACCEPT-001,${category.code},${location.code}`,
      `Acceptance Two,ACCEPT-002,${category.code},${location.code}`,
      `Acceptance Three,ACCEPT-003,${category.code},${location.code}`,
      `Duplicate One,AST-0001,${category.code},${location.code}`,
      `Duplicate Two,AST-0002,${category.code},${location.code}`
    ].join('\n');
    const file = path.join(os.tmpdir(), `assethub-acceptance-${Date.now()}.csv`);
    fs.writeFileSync(file, csv);
    const response = await request(app).post('/assets/import')
      .set('Authorization', `Bearer ${token}`).attach('file', file);
    fs.unlinkSync(file);
    expect(response.status).toBe(200);
    expect(response.body.data.success).toHaveLength(3);
    expect(response.body.data.errors).toHaveLength(2);
    await prisma.asset.deleteMany({ where: { assetTag: { in: ['ACCEPT-001', 'ACCEPT-002', 'ACCEPT-003'] } } });
  });

  test('transfer updates asset location and history', async () => {
    const token = await login('admin');
    const asset = await prisma.asset.findFirst({ where: { assetTag: 'AST-0003' } });
    const locations = await prisma.location.findMany({ take: 2, select: { id: true } });
    const response = await request(app).post('/transfers').set('Authorization', `Bearer ${token}`).send({
      assetId: asset.id,
      fromLocationId: asset.locationId,
      toLocationId: locations.find(location => location.id !== asset.locationId).id,
      transferredById: (await prisma.user.findUnique({ where: { email: credentials.admin[0] } })).id,
      reason: 'Acceptance test'
    });
    expect(response.status).toBe(201);
    const updated = await request(app).get(`/assets/${asset.id}`).set('Authorization', `Bearer ${token}`);
    expect(updated.body.data.locationId).toBe(response.body.data.toLocationId);
    const history = await request(app).get(`/assets/${asset.id}/history`).set('Authorization', `Bearer ${token}`);
    expect(history.body.data.some(entry => entry.type === 'transfer' && entry.data.reason === 'Acceptance test')).toBe(true);
  });

  test('invoice is visible to procurement and denied to other roles', async () => {
    const procurement = await login('procurement');
    const listed = await request(app).get('/invoices').set('Authorization', `Bearer ${procurement}`);
    expect(listed.status).toBe(200);
    const invoiceId = listed.body.data[0].id;
    for (const role of ['custodian', 'technician']) {
      const response = await request(app).get(`/invoices/${invoiceId}`).set('Authorization', `Bearer ${await login(role)}`);
      expect(response.status).toBe(403);
    }
  });

  test('completing a work order creates a service event', async () => {
    const token = await login('admin');
    const workOrder = await prisma.workOrder.findFirst({ where: { templateId: { not: null }, status: { not: 'COMPLETED' } } });
    const completed = await request(app).put(`/work-orders/${workOrder.id}/complete`).set('Authorization', `Bearer ${token}`).send({
      laborCost: 100, partsCost: 50, downtimeHours: 2, outcome: 'Fixed', notes: ''
    });
    expect(completed.status).toBe(200);
    expect(completed.body.data.status).toBe('COMPLETED');
    expect(completed.body.data.completedAt).toBeTruthy();
    const serviceEvent = await prisma.serviceEvent.findFirst({ where: { workOrderId: workOrder.id }, orderBy: { createdAt: 'desc' } });
    expect(serviceEvent).toBeTruthy();
  });

  test('dashboard totals reconcile', async () => {
    const token = await login('admin');
    const summary = await request(app).get('/dashboard/summary').set('Authorization', `Bearer ${token}`);
    expect(summary.body.data.totalAssets).toBe(120);
    const categories = await request(app).get('/dashboard/counts-by-category').set('Authorization', `Bearer ${token}`).query({ limit: 100 });
    expect(categories.body.data.reduce((sum, row) => sum + row.count, 0)).toBe(100);
    const risk = await request(app).get('/dashboard/risk-queue').set('Authorization', `Bearer ${token}`);
    expect(risk.body.data.every(item => item.asset && typeof item.score === 'number' && Array.isArray(item.reasons))).toBe(true);
  });

  test('API-prefixed POST routes are mounted', async () => {
    const token = await login('admin');
    const response = await request(app)
      .post('/api/stocktake-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'API prefix smoke test' });
    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe('API prefix smoke test');
  });
});
