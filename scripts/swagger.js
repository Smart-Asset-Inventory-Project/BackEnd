const { execFile, spawn } = require('child_process');
const http = require('http');

const port = Number(process.env.PORT || 3000);
const url = `http://localhost:${port}/swagger/`;

function isServerReady() {
  return new Promise((resolve) => {
    const request = http.get(`http://localhost:${port}/health`, (response) => {
      response.resume();
      resolve(true);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(500, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function openBrowser() {
  if (process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', url]);
  } else {
    execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url]);
  }
  console.log(`Swagger UI: ${url}`);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isServerReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function main() {
  const alreadyRunning = await isServerReady();
  const server = alreadyRunning
    ? null
    : spawn(process.execPath, ['src/index.js'], { stdio: 'inherit', env: process.env });

  if (!(await waitForServer())) {
    if (server) server.kill();
    throw new Error(`AssetHub API did not start on port ${port}`);
  }

  openBrowser();

  if (server) {
    process.on('SIGINT', () => server.kill('SIGINT'));
    process.on('SIGTERM', () => server.kill('SIGTERM'));
    server.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
