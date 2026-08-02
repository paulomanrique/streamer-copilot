import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Base class for per-profile JSON settings stores.
 *
 * Each module that persists settings as a JSON file under the profile
 * directory used to roll its own load/save plumbing — same readFile +
 * JSON.parse + "merge with defaults" + writeFile dance, copied four times
 * over (sounds, text, welcome, music). This class centralizes the I/O and
 * leaves each subclass to declare only what's actually module-specific:
 *
 *   - `defaults()` — the value returned when the file is missing/corrupt.
 *   - `parse(raw)` — coerces the JSON blob into a strongly-typed `T`,
 *     filling in defaults for missing or wrong-typed fields. Subclasses
 *     should never throw here; an unreadable file already falls back to
 *     `defaults()` via `load()`.
 *   - `normalize(input)` (optional) — applied before writing so saved
 *     values are trimmed / clamped / canonicalized.
 *
 * The class does **not** handle encryption — modules that store secrets
 * (e.g. OBS passwords) compose `safeStorage` separately. That decision is
 * intentional: forcing every store through a single encryption hook would
 * leak per-module concerns into the base.
 */
export abstract class JsonSettingsStore<T> {
  protected readonly filePath: string;

  constructor(profileDirectory: string, filename: string) {
    this.filePath = path.join(profileDirectory, filename);
  }

  /** Default value returned when the on-disk file is missing or unreadable. */
  protected abstract defaults(): T;

  /** Coerces a parsed JSON blob into a fully-typed `T`. Subclasses use
   *  `defaults()` to back-fill missing / wrong-typed fields. Must not throw. */
  protected abstract parse(raw: Record<string, unknown>): T;

  /** Optional normalizer run before save (trim / clamp / canonicalize). */
  protected normalize(input: T): T {
    return input;
  }

  async load(): Promise<T> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const raw = JSON.parse(data);
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return this.parse(raw as Record<string, unknown>);
      }
      return this.defaults();
    } catch {
      return this.defaults();
    }
  }

  async save(input: T): Promise<T> {
    const next = this.normalize(input);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
      await fs.rename(temporaryPath, this.filePath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
    return next;
  }
}
