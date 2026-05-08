import type { EventLogEntry, EventLogFilters, EventLogLevel } from '../../shared/types.js';
import { LogRepository } from './log-repository.js';

const LOG_LEVEL_PRIORITY: Record<EventLogLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
};

export class LogService {
  private minLevel: EventLogLevel = 'info';

  constructor(private readonly repository: LogRepository) {}

  setMinLevel(level: EventLogLevel): void {
    this.minLevel = level;
  }

  list(filters?: EventLogFilters): EventLogEntry[] {
    return this.repository.list(filters);
  }

  deleteAll(): void {
    this.repository.deleteAll();
  }

  info(category: string, message: string, metadata?: unknown): void {
    this.log('info', category, message, metadata);
  }

  warn(category: string, message: string, metadata?: unknown): void {
    this.log('warn', category, message, metadata);
  }

  error(category: string, message: string, metadata?: unknown): void {
    this.log('error', category, message, metadata);
  }

  log(level: EventLogLevel, category: string, message: string, metadata?: unknown): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) return;

    try {
      this.repository.insert(level, category, message, metadata);
    } catch (cause) {
      const payload = metadata === undefined ? '' : ` ${JSON.stringify(metadata)}`;
      const formatted = `[log-fallback] ${level} ${category}: ${message}${payload}`;
      if (level === 'error') console.error(formatted, cause);
      else if (level === 'warn') console.warn(formatted, cause);
      else console.info(formatted, cause);
    }
  }
}
