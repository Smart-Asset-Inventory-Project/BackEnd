// Remote PostgreSQL workflows perform multiple round trips per test.
jest.setTimeout(120000);
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: '.env.test' });
require('../helpers/test-db')();
const request = require('supertest');
const app = require('../../src/index');
const prisma = require('../../src/utils/prisma');

describe('authentication API', () => {
  const email = `integration-${Date.now()}@example.com`;
  let role;
  beforeAll(async () => {
    role = await prisma.role.upsert({ where: { name: 'CUSTODIAN' }, update: {}, create: { name: 'CUSTODIAN' } });
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  test('registers and logs in a user', async () => {
    const registered = await request(app).post('/auth/register')
      .send({ name: 'Integration User', email, password: 'Secret@123', roleId: role.id });
    expect(registered.status).toBe(201);
    const loggedIn = await request(app).post('/auth/login').send({ email, password: 'Secret@123' });
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.body.data.accessToken).toEqual(expect.any(String));
  });
});
