import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { PlatformAccount } from '../../shared/types.js';

const ACCOUNTS_DIRNAME = 'accounts';

/**
 * R6: per-profile JSON-per-account repository. Each account lives in
 * `<profile>/accounts/<id>.json` so the streamer can copy a profile folder
 * and keep all their connected accounts.
 */
export class AccountRepository {
  constructor(private readonly getProfileDirectory: () => string) {}

  private accountsDir(): string {
    const dir = this.getProfileDirectory();
    if (!dir) throw new Error('No active profile directory');
    return path.join(dir, ACCOUNTS_DIRNAME);
  }

  async list(): Promise<PlatformAccount[]> {
    const dir = this.accountsDir();
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return [];
    }
    const accounts: PlatformAccount[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(dir, entry), 'utf-8');
        const parsed = JSON.parse(raw) as PlatformAccount;
        if (parsed && typeof parsed.id === 'string' && typeof parsed.providerId === 'string') {
          accounts.push(parsed);
        }
      } catch {
        // skip corrupted files
      }
    }
    accounts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return accounts;
  }

  async get(id: string): Promise<PlatformAccount | null> {
    try {
      const raw = await fs.readFile(path.join(this.accountsDir(), `${id}.json`), 'utf-8');
      return JSON.parse(raw) as PlatformAccount;
    } catch {
      return null;
    }
  }

  async upsert(input: Omit<PlatformAccount, 'id' | 'createdAt'> & { id?: string }): Promise<PlatformAccount> {
    const id = input.id ?? randomUUID();
    const existing = input.id ? await this.get(input.id) : null;
    const account: PlatformAccount = {
      id,
      providerId: input.providerId,
      label: input.label,
      channel: input.channel,
      enabled: input.enabled,
      autoConnect: input.autoConnect,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      providerData: input.providerData,
    };
    await this.write(account);
    return account;
  }

  async write(account: PlatformAccount): Promise<void> {
    const dir = this.accountsDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${account.id}.json`), JSON.stringify(account, null, 2), 'utf-8');
  }

  async delete(id: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.accountsDir(), `${id}.json`));
    } catch {
      // ignore — already gone
    }
  }
}
