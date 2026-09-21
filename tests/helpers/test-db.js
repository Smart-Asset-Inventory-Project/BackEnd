const { execFileSync } = require('child_process');

module.exports = function prepareTestDatabase() {
  process.env.DATABASE_URL = 'file:./test.db';
  if (process.platform === 'win32') {
    execFileSync(process.env.ComSpec, ['/d', '/s', '/c', 'npx prisma db push --skip-generate --accept-data-loss'], {
      cwd: process.cwd(), stdio: 'ignore', env: process.env
    });
  } else {
    execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate', '--accept-data-loss'], {
      cwd: process.cwd(), stdio: 'ignore', env: process.env
    });
  }
};
