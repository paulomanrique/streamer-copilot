import { execFile as execFileCallback } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export interface SystemMetricsSnapshot {
  cpuUsage: number;
  ramMbAvailable: number;
  ramPercentInUse: number;
  ramPercentAvailable: number;
  processCount: number;
  uploadBytesPerSecond: number;
  downloadBytesPerSecond: number;
  networkInterfaces: Array<{ id: string; label: string }>;
  sampledAt: number;
  networkError: string | null;
}

interface NetworkCounter {
  received: number;
  sent: number;
  sampledAt: number;
}

export class SystemMetricsSampler {
  private previousCpu = readCpuTotals();
  private readonly previousNetwork = new Map<string, NetworkCounter>();

  async sample(networkEnabled: boolean, selectedInterface: string | null): Promise<SystemMetricsSnapshot> {
    const now = Date.now();
    const cpu = readCpuTotals();
    const totalDelta = cpu.total - this.previousCpu.total;
    const idleDelta = cpu.idle - this.previousCpu.idle;
    this.previousCpu = cpu;
    const cpuUsage = totalDelta > 0 ? Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)) : 0;
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const ramPercentAvailable = totalMemory > 0 ? freeMemory / totalMemory * 100 : 0;

    let processCount = 1;
    let uploadBytesPerSecond = 0;
    let downloadBytesPerSecond = 0;
    let networkInterfaces: Array<{ id: string; label: string }> = [];
    let networkError: string | null = null;
    try {
      const osValues = await this.readOsValues();
      processCount = osValues.processCount;
      networkInterfaces = osValues.network.map((entry) => ({ id: entry.id, label: entry.label }));
      if (networkEnabled) {
        const selected = selectedInterface
          ? osValues.network.find((entry) => entry.id === selectedInterface)
          : osValues.network.find((entry) => !/loopback|isatap|teredo|pseudo/i.test(entry.label)) ?? osValues.network[0];
        if (selected) {
          if (selected.isRate) {
            downloadBytesPerSecond = selected.received;
            uploadBytesPerSecond = selected.sent;
          } else {
            const previous = this.previousNetwork.get(selected.id);
            const elapsedSeconds = previous ? Math.max(0.001, (now - previous.sampledAt) / 1_000) : 0;
            if (previous && elapsedSeconds > 0) {
              downloadBytesPerSecond = Math.max(0, (selected.received - previous.received) / elapsedSeconds);
              uploadBytesPerSecond = Math.max(0, (selected.sent - previous.sent) / elapsedSeconds);
            }
            this.previousNetwork.set(selected.id, { received: selected.received, sent: selected.sent, sampledAt: now });
          }
        } else {
          networkError = 'No network interface is available';
        }
      }
    } catch (cause) {
      networkError = cause instanceof Error ? cause.message : String(cause);
    }

    return {
      cpuUsage,
      ramMbAvailable: freeMemory / 1024 / 1024,
      ramPercentInUse: 100 - ramPercentAvailable,
      ramPercentAvailable,
      processCount,
      uploadBytesPerSecond,
      downloadBytesPerSecond,
      networkInterfaces,
      sampledAt: now,
      networkError,
    };
  }

  private async readOsValues(): Promise<{
    processCount: number;
    network: Array<{ id: string; label: string; received: number; sent: number; isRate: boolean }>;
  }> {
    if (process.platform === 'win32') return readWindowsValues();
    if (process.platform === 'linux') return readLinuxValues();
    if (process.platform === 'darwin') return readMacValues();
    return { processCount: 1, network: [] };
  }
}

function readCpuTotals(): { idle: number; total: number } {
  return os.cpus().reduce((result, cpu) => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    return { idle: result.idle + cpu.times.idle, total: result.total + total };
  }, { idle: 0, total: 0 });
}

async function readWindowsValues() {
  const command = [
    "$network = @(Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface | ForEach-Object { [pscustomobject]@{ id = $_.Name; label = $_.Name; received = [double]$_.BytesReceivedPersec; sent = [double]$_.BytesSentPersec; isRate = $true } })",
    "$result = [pscustomobject]@{ processCount = @(Get-Process).Count; network = $network }",
    '$result | ConvertTo-Json -Compress -Depth 4',
  ].join('; ');
  const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { timeout: 5_000, windowsHide: true });
  const parsed = JSON.parse(stdout.trim()) as {
    processCount?: unknown;
    network?: unknown;
  };
  return {
    processCount: Number(parsed.processCount) || 1,
    network: normalizeNetworkRows(parsed.network, true),
  };
}

async function readLinuxValues() {
  const procEntries = await fs.readdir('/proc');
  const processCount = procEntries.filter((entry) => /^\d+$/.test(entry)).length;
  const base = '/sys/class/net';
  const interfaces = await fs.readdir(base);
  const network = await Promise.all(interfaces.map(async (id) => ({
    id,
    label: id,
    received: Number(await fs.readFile(path.join(base, id, 'statistics', 'rx_bytes'), 'utf-8')) || 0,
    sent: Number(await fs.readFile(path.join(base, id, 'statistics', 'tx_bytes'), 'utf-8')) || 0,
    isRate: false,
  })));
  return { processCount, network };
}

async function readMacValues() {
  const [{ stdout: processes }, { stdout: interfaces }] = await Promise.all([
    execFile('ps', ['-A', '-o', 'pid='], { timeout: 5_000 }),
    execFile('netstat', ['-ibn'], { timeout: 5_000 }),
  ]);
  const totals = new Map<string, { received: number; sent: number }>();
  for (const line of interfaces.split(/\r?\n/).slice(1)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 10) continue;
    const id = columns[0];
    const received = Number(columns[6]);
    const sent = Number(columns[9]);
    if (!id || !Number.isFinite(received) || !Number.isFinite(sent)) continue;
    const current = totals.get(id) ?? { received: 0, sent: 0 };
    current.received = Math.max(current.received, received);
    current.sent = Math.max(current.sent, sent);
    totals.set(id, current);
  }
  return {
    processCount: processes.split(/\r?\n/).filter((line) => line.trim()).length,
    network: [...totals].map(([id, value]) => ({ id, label: id, ...value, isRate: false })),
  };
}

function normalizeNetworkRows(value: unknown, isRate: boolean) {
  const rows = Array.isArray(value) ? value : (value && typeof value === 'object' ? [value] : []);
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const id = String(item.id ?? '');
    if (!id) return [];
    return [{
      id,
      label: String(item.label ?? id),
      received: Number(item.received) || 0,
      sent: Number(item.sent) || 0,
      isRate,
    }];
  });
}
