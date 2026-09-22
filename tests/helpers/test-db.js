const { execFileSync } = require('child_process');
const fs = require('fs');
module.exports = function prepareTestDatabase({ registerCleanup = global.afterAll } = {}) {
  const target = process.env.TEST_DATABASE_URL;
  if (!target) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database; production and SQLite are never used for tests.');
  const url = new URL(target);
  if (decodeURIComponent(url.username) === 'TEST_USER' || decodeURIComponent(url.password) === 'TEST_PASSWORD') {
    throw new Error('TEST_USER and TEST_PASSWORD are documentation placeholders. Set TEST_DATABASE_URL to real credentials for a separate disposable PostgreSQL database.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/test/i.test(url.pathname)) throw new Error('TEST_DATABASE_URL must name a PostgreSQL database containing test.');
  for (const file of ['.env', '.env.local']) {
    if (!fs.existsSync(file)) continue;
    const env = require('dotenv').parse(fs.readFileSync(file));
    for (const key of ['DATABASE_URL', 'DATABASE_URL_UNPOOLED']) {
      if (!env[key]) continue;
      const prod = new URL(env[key]);
      if (prod.hostname.replace('-pooler', '') === url.hostname.replace('-pooler', '') && prod.pathname === url.pathname) throw new Error('Test database must differ from application database.');
    }
  }
  const schema = 'assethub_test_' + require('crypto').randomBytes(12).toString('hex');
  url.searchParams.set('schema', schema);
  // Allow a suspended Neon compute time to wake up without overriding explicit settings.
  if (!url.searchParams.has('connect_timeout')) url.searchParams.set('connect_timeout', '30');
  if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '30');
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_URL_UNPOOLED = url.toString();
  registerCleanup(async () => {
    const { PrismaClient } = require('@prisma/client');
    const cleanup = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    try { await cleanup.$executeRawUnsafe('DROP SCHEMA "' + schema + '" CASCADE'); }
    finally { await cleanup.$disconnect(); }
  });
  process.env.JWT_SECRET = 'isolated-test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'isolated-test-refresh-secret';
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'push', '--skip-generate'], { cwd: process.cwd(), stdio: 'pipe', env: process.env });
};
