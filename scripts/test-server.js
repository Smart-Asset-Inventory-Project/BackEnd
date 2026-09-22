// Start the manual workflow API inside the same isolated PostgreSQL setup as Jest.
require('dotenv').config({ path: '.env.test' });
process.env.NODE_ENV = 'test';
const { execFileSync } = require('child_process');
let cleanup;
let server;
let stopping = false;

async function stop(code) {
  if (stopping) return;
  stopping = true;
  if (server) await new Promise(resolve => server.close(resolve));
  await require('../src/utils/prisma').$disconnect();
  if (cleanup) await cleanup();
  process.exitCode = code;
}

async function main() {
  require('../tests/helpers/test-db')({ registerCleanup: fn => { cleanup = fn; } });
  // The helper has replaced both Prisma URLs with a random schema in the
  // explicitly configured test database before the destructive demo seed runs.
  execFileSync(process.execPath, ['prisma/seed.js'], { cwd: process.cwd(), env: process.env, stdio: 'pipe' });
  server = require('../src/index').listen(3000, '127.0.0.1', () => {
    console.log('Isolated test API ready at http://localhost:3000/api. Run docs/test-workflows.ps1 in another terminal.');
    console.log('Press Ctrl+C to stop and remove this temporary test schema.');
  });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'Port 3000 is already in use. Stop the other server before running test:server.' : 'Test API could not start.');
    stop(1).catch(() => { process.exitCode = 1; });
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  stop(0).catch(() => { console.error('Test schema cleanup failed.'); process.exitCode = 1; });
});
main().catch(async error => {
  // Avoid displaying connection URLs or child-process environment values.
  console.error(error.status !== undefined
    ? 'Test database setup or seed failed. Check the real TEST_DATABASE_URL credentials and schema creation privileges.'
    : error.message);
  try { await stop(1); } catch (_) { process.exitCode = 1; }
});
