import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { JsonSettingsStore } from '../../src/modules/base/settings-store.js';

interface ExampleSettings {
  label: string;
  count: number;
}

class ExampleSettingsStore extends JsonSettingsStore<ExampleSettings> {
  constructor(directory: string) {
    super(directory, 'example.json');
  }

  protected defaults(): ExampleSettings {
    return { label: 'default', count: 0 };
  }

  protected parse(raw: Record<string, unknown>): ExampleSettings {
    return {
      label: typeof raw.label === 'string' ? raw.label : 'default',
      count: typeof raw.count === 'number' ? raw.count : 0,
    };
  }

  protected normalize(input: ExampleSettings): ExampleSettings {
    return { label: input.label.trim(), count: Math.max(0, Math.floor(input.count)) };
  }
}

const tempDirectories: string[] = [];

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'streamer-copilot-settings-store-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('JsonSettingsStore', () => {
  it('falls back to defaults for missing and corrupt files', async () => {
    const directory = await createTempDirectory();
    const store = new ExampleSettingsStore(directory);

    await expect(store.load()).resolves.toEqual({ label: 'default', count: 0 });

    await writeFile(path.join(directory, 'example.json'), '{not-json', 'utf-8');
    await expect(store.load()).resolves.toEqual({ label: 'default', count: 0 });
  });

  it('normalizes and atomically replaces the settings file without leaving temporary files', async () => {
    const directory = await createTempDirectory();
    const store = new ExampleSettingsStore(directory);

    await expect(store.save({ label: ' first ', count: 1.8 })).resolves.toEqual({ label: 'first', count: 1 });
    await expect(store.save({ label: ' second ', count: -3 })).resolves.toEqual({ label: 'second', count: 0 });

    expect(JSON.parse(await readFile(path.join(directory, 'example.json'), 'utf-8'))).toEqual({ label: 'second', count: 0 });
    expect((await readdir(directory)).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
  });
});
