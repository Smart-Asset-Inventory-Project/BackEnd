process.env.NODE_ENV = 'test';
require('dotenv').config({ path: '.env.test' });
require('../helpers/test-db')();
const request = require('supertest');
const app = require('../../src/index');
const prisma = require('../../src/utils/prisma');
const bcrypt = require('bcryptjs');

describe('asset API', () => {
  let token;
  beforeAll(async () => {
    const role = await prisma.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN' } });
    await prisma.user.upsert({
      where: { email: 'admin@assethub.local' },
      update: { password: await bcrypt.hash('Admin@123', 4), roleId: role.id },
      create: { name: 'Admin', email: 'admin@assethub.local', password: await bcrypt.hash('Admin@123', 4), roleId: role.id }
    });
    const login = await request(app).post('/auth/login').send({ email: 'admin@assethub.local', password: 'Admin@123' });
    token = login.body.data && login.body.data.accessToken;
  });
  afterAll(async () => { await prisma.$disconnect(); });

  test('returns a standard paginated asset list for an authenticated user', async () => {
    const response = await request(app).get('/assets?page=1&limit=5').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual(expect.objectContaining({ page: 1, limit: 5 }));
    expect(Array.isArray(response.body.data)).toBe(true);
  });
});
