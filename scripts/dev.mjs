import { spawn } from 'node:child_process';
import net from 'node:net';

const DEFAULT_API_PORT = 3001;
const DEFAULT_FALLBACK_PORTS = [3011, 3012, 3013, 3014, 3015];

function parsePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback;
}

function isPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        resolve(false);
        return;
      }
      reject(error);
    });
    probe.once('listening', () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, '127.0.0.1');
  });
}

async function resolveApiPort() {
  const requestedPort = parsePort(process.env.PORT, DEFAULT_API_PORT);
  if (await isPortAvailable(requestedPort)) {
    return { requestedPort, apiPort: requestedPort, fallbackUsed: false };
  }

  const configuredFallback = process.env.DEV_API_FALLBACK_PORT;
  const candidates = [
    ...(configuredFallback
      ? [parsePort(configuredFallback, DEFAULT_FALLBACK_PORTS[0])]
      : []),
    ...DEFAULT_FALLBACK_PORTS,
  ].filter(
    (port, index, ports) => port !== requestedPort && ports.indexOf(port) === index,
  );

  for (const apiPort of candidates) {
    if (await isPortAvailable(apiPort)) {
      return { requestedPort, apiPort, fallbackUsed: true };
    }
  }

  throw new Error(
    `The API port ${requestedPort} is already in use and no development fallback port is available. Set PORT or DEV_API_FALLBACK_PORT to a free port.`,
  );
}

async function main() {
  const { requestedPort, apiPort, fallbackUsed } = await resolveApiPort();
  const apiOrigin = `http://127.0.0.1:${apiPort}/api/v1`;
  const childEnv = {
    ...process.env,
    PORT: String(apiPort),
  };

  if (fallbackUsed) {
    // A repository .env can still contain the default 3001 values. Override
    // those inherited by Next when the API had to move to a fallback port.
    if (!process.env.NEXT_PUBLIC_API_BASE_URL)
      childEnv.NEXT_PUBLIC_API_BASE_URL = apiOrigin;
    if (!process.env.RENDERER_API_BASE_URL) childEnv.RENDERER_API_BASE_URL = apiOrigin;
    console.warn(
      `API port ${requestedPort} is busy; starting the API on ${apiPort} and pointing CMS/renderer at ${apiOrigin}. Set DEV_API_FALLBACK_PORT to choose another fallback.`,
    );
  }

  const packageManager = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const child = spawn(packageManager, ['exec', 'turbo', 'dev'], {
    env: childEnv,
    stdio: 'inherit',
  });

  const forwardSignal = (signal) => child.kill(signal);
  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));
  child.once('error', (error) => {
    console.error(error);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

await main();
