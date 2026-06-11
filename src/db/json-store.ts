import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Synchronous JSON file store. Reads and writes a typed value to a single file.
 * Directory is created automatically on first write.
 */
export class JsonStore<T> {
  constructor(
    private readonly filePath: string,
    private readonly defaultValue: T,
  ) {}

  read(): T {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return structuredClone(this.defaultValue);
    }
  }

  write(value: T): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    // Write to a temp file and rename over the target so a crash or power loss
    // mid-write can never leave a truncated/corrupt config — rename is atomic
    // on the same volume. All profile config flows through here, so this guards
    // every per-profile JSON store.
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8');
    renameSync(tmp, this.filePath);
  }

  exists(): boolean {
    try {
      readFileSync(this.filePath);
      return true;
    } catch {
      return false;
    }
  }
}
