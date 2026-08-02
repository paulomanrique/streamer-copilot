import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export class LiveOutputWriter {
  private readonly hashes = new Map<string, string>();
  private readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly profileDirectory: string) {}

  resolve(relativePath: string): string {
    if (path.isAbsolute(relativePath)) throw new Error('Live output path must be relative to the profile');
    const root = path.resolve(this.profileDirectory);
    const target = path.resolve(root, relativePath);
    if (target === root || !target.startsWith(`${root}${path.sep}`)) {
      throw new Error('Live output path escapes the active profile');
    }
    return target;
  }

  writeText(relativePath: string, content: string): Promise<void> {
    return this.write(relativePath, Buffer.from(content, 'utf-8'));
  }

  writeJson(relativePath: string, value: unknown): Promise<void> {
    return this.writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  writeBuffer(relativePath: string, content: Buffer): Promise<void> {
    return this.write(relativePath, content);
  }

  clearCache(): void {
    this.hashes.clear();
  }

  async flush(): Promise<void> {
    await Promise.allSettled(this.pending.values());
  }

  private write(relativePath: string, content: Buffer): Promise<void> {
    const target = this.resolve(relativePath);
    const hash = createHash('sha256').update(content).digest('hex');
    const previous = this.pending.get(target) ?? Promise.resolve();
    const next = previous.then(async () => {
      if (this.hashes.get(target) === hash) return;
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporary, content);
        try {
          await fs.rename(temporary, target);
        } catch (cause) {
          const code = (cause as NodeJS.ErrnoException).code;
          if (process.platform !== 'win32' || (code !== 'EPERM' && code !== 'EEXIST' && code !== 'EBUSY')) throw cause;
          await fs.writeFile(target, content);
          await fs.rm(temporary, { force: true });
        }
        this.hashes.set(target, hash);
      } catch (cause) {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
        throw cause;
      }
    });
    this.pending.set(target, next);
    void next.finally(() => {
      if (this.pending.get(target) === next) this.pending.delete(target);
    }).catch(() => undefined);
    return next;
  }
}
