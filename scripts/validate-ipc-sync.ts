#!/usr/bin/env node
/**
 * Validates that IPC_CHANNELS in src/shared/ipc.ts and src/preload/index.cts
 * are in sync — same keys with the same string values.
 *
 * Run:  npx tsx scripts/validate-ipc-sync.ts
 * Or:   npm run validate:ipc
 *
 * Exit code 0 = in sync, 1 = drift detected.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function extractIpcChannels(filePath: string): Map<string, string> {
  const src = readFileSync(filePath, 'utf-8');

  // Match the IPC_CHANNELS object literal (handles both `export const` and plain `const`)
  const blockMatch = src.match(/(?:export\s+)?const\s+IPC_CHANNELS\s*=\s*\{([\s\S]*?)\}\s*as\s+const/);
  if (!blockMatch) {
    throw new Error(`Could not find IPC_CHANNELS object in ${filePath}`);
  }

  const body = blockMatch[1];
  const entries = new Map<string, string>();

  // Match each  key: 'value'  or  key: "value"  entry
  const entryRegex = /(\w+)\s*:\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = entryRegex.exec(body)) !== null) {
    entries.set(m[1], m[2]);
  }

  return entries;
}

// ── Main ───────────────────────────────────────────────────────────────────

const sharedPath = resolve(root, 'src/shared/ipc.ts');
const preloadPath = resolve(root, 'src/preload/index.cts');

const shared = extractIpcChannels(sharedPath);
const preload = extractIpcChannels(preloadPath);

let driftFound = false;

// Keys in shared but missing in preload
for (const [key, value] of shared) {
  if (!preload.has(key)) {
    console.error(`MISSING in preload: "${key}" (shared → "${value}")`);
    driftFound = true;
  } else if (preload.get(key) !== value) {
    console.error(`VALUE MISMATCH for "${key}": shared="${value}" vs preload="${preload.get(key)}"`);
    driftFound = true;
  }
}

// Keys in preload but missing in shared
for (const [key, value] of preload) {
  if (!shared.has(key)) {
    console.error(`EXTRA in preload (not in shared): "${key}" → "${value}"`);
    driftFound = true;
  }
}

if (driftFound) {
  console.error('\n❌ IPC_CHANNELS drift detected. Fix src/shared/ipc.ts and src/preload/index.cts to match.');
  process.exit(1);
} else {
  console.log(`✅ IPC_CHANNELS in sync — ${shared.size} channels verified.`);
  process.exit(0);
}
