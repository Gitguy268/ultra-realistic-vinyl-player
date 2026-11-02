// Builds, serves the production build on its own port, and runs every headless
// check in turn. Usage: npm run check:browser
// Set BROWSER=msedge, firefox or webkit to run them in another engine.
import { spawn, spawnSync } from 'node:child_process';

const PORT = 4174;
const BASE_URL = `http://localhost:${PORT}/`;
// check-offline rewrites dist/sw.js to simulate a deploy, so it goes last.
const CHECKS = [
  'audio',
  'formats',
  'deck',
  'parts',
  'sfx',
  'modes',
  'storage',
  'fallback',
  'context-loss',
  'network',
  'reduced',
  'details',
  'label',
  'drop-cover',
  'finishes',
  'mobile',
  'visualizer',
  'camera',
  'winamp',
  'library',
  'keyboard',
  'loading',
  'offline',
];

function build() {
  const result = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const up = await fetch(BASE_URL).then(
      (response) => response.ok,
      () => false,
    );
    if (up) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`The preview server did not start on port ${PORT}.`);
}

build();
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore' },
);
const failed = [];
try {
  await waitForServer();
  for (const name of CHECKS) {
    process.stdout.write(`\n== check-${name} ==\n`);
    const result = spawnSync(process.execPath, [`scripts/check-${name}.js`], {
      stdio: 'inherit',
      env: { ...process.env, BASE_URL },
    });
    if (result.status !== 0) failed.push(name);
  }
} finally {
  server.kill();
}
build();
process.stdout.write(
  failed.length === 0
    ? `\nAll ${CHECKS.length} browser checks passed.\n`
    : `\nFailed: ${failed.join(', ')}\n`,
);
process.exitCode = failed.length === 0 ? 0 : 1;
