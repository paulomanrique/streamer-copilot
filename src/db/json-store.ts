import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    writeFileSync(this.filePath, JSON.stringify(value, null, 2), 'utf-8');
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
