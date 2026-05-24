import { spawn } from 'node:child_process';

delete process.env.ELECTRON_RUN_AS_NODE;
process.env.VITE_DEV_SERVER_URL ??= 'http://127.0.0.1:5174';

const child = spawn(
  'npx',
  ['concurrently', '-k', 'npm:dev:renderer', 'npm:dev:electron', 'npm:dev:app'],
  { stdio: 'inherit', shell: true, env: process.env },
);

child.on('exit', (code) => process.exit(code ?? 0));
