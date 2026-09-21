process.env.NODE_ENV = 'test';
require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../src/index');

describe('AssetHub API', () => {
  test('health endpoint is available', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
  });

  test('dashboard requires authentication', async () => {
    const response = await request(app).get('/dashboard/summary');
    expect(response.status).toBe(401);
  });

});
