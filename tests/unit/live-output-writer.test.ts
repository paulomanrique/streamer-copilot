import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LiveOutputWriter } from '../../src/modules/live-outputs/output-writer.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('LiveOutputWriter', () => {
  it('writes UTF-8 without BOM, deduplicates content and leaves no temp files', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'streamer-copilot-live-output-'));
    tempDirectories.push(directory);
    const writer = new LiveOutputWriter(directory);

    expect(await writer.writeText('TextFiles/Time.txt', 'Olá 21:05')).toBe(true);
    const target = path.join(directory, 'TextFiles', 'Time.txt');
    const firstStat = await stat(target);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await writer.writeText('TextFiles/Time.txt', 'Olá 21:05')).toBe(false);

    const bytes = await readFile(target);
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(bytes.toString('utf-8')).toBe('Olá 21:05');
    expect((await stat(target)).mtimeMs).toBe(firstStat.mtimeMs);
    expect((await readdir(path.dirname(target))).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
  });

  it('rejects paths outside the profile', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'streamer-copilot-live-output-'));
    tempDirectories.push(directory);
    const writer = new LiveOutputWriter(directory);
    expect(() => writer.resolve('../outside.txt')).toThrow('escapes');
    expect(() => writer.resolve(path.resolve(directory, '..', 'outside.txt'))).toThrow('relative');
  });
});
