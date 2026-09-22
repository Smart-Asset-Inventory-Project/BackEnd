// Isolated local PostgreSQL cluster; never changes the installed service.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, '.test-postgres');
const data = path.join(directory, 'data');
const bin = process.env.POSTGRES_BIN || path.join(process.env.USERPROFILE, 'Desktop', 'backend', 'bin');
const port = '55432';
const run = (name, args, env = process.env) => (execFileSync(path.join(bin, name + '.exe'), args, {
  cwd: root, env, windowsHide: true, stdio: name === 'pg_ctl' && args.includes('start') ? 'ignore' : 'pipe', timeout: 60000
}) || '').toString();

try {
  if (process.argv[2] === 'stop') {
    run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    console.log('Isolated local test database stopped.');
    process.exit(0);
  }
  fs.mkdirSync(directory, { recursive: true });
  const credentials = path.join(directory, 'credentials.json');
  if (!fs.existsSync(credentials)) {
    fs.writeFileSync(credentials, JSON.stringify({ password: crypto.randomBytes(24).toString('hex') }), { flag: 'wx' });
  }
  const { password } = JSON.parse(fs.readFileSync(credentials));
  if (!fs.existsSync(path.join(data, 'PG_VERSION'))) {
    const passwordFile = path.join(directory, 'init-password');
    fs.writeFileSync(passwordFile, password);
    try {
      run('initdb', ['-D', data, '-U', 'assethub_test', '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', '--pwfile=' + passwordFile]);
    } finally { fs.unlinkSync(passwordFile); }
    fs.appendFileSync(path.join(data, 'postgresql.conf'), "\nlisten_addresses = '127.0.0.1'\nport = 55432\n");
  }
  let running = true;
  try { run('pg_ctl', ['-D', data, 'status']); } catch (_) { running = false; }
  if (!running) run('pg_ctl', ['-D', data, '-l', path.join(directory, 'server.log'), '-w', 'start']);
  const env = { ...process.env, PGPASSWORD: password };
  const args = ['-h', '127.0.0.1', '-p', port, '-U', 'assethub_test', '-d', 'postgres', '-w', '-Atc'];
  const exists = run('psql', [...args, "SELECT 1 FROM pg_database WHERE datname = 'assethub_test'"], env).trim();
  if (!exists) run('psql', [...args, 'CREATE DATABASE assethub_test'], env);
  const envFile = path.join(root, '.env.test');
  const previous = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const url = `postgresql://assethub_test:${password}@127.0.0.1:${port}/assethub_test`;
  const updated = previous.replace(/^TEST_DATABASE_URL=.*\r?\n?/gm, '');
  fs.writeFileSync(envFile, updated.trimEnd() + '\nTEST_DATABASE_URL=' + url + '\n');
  console.log('Local test PostgreSQL ready on 127.0.0.1:55432. Connection saved to ignored .env.test (not displayed).');
} catch (error) {
  console.error('Local test database setup failed:', error.stderr?.toString() || error.message);
  process.exitCode = 1;
}
