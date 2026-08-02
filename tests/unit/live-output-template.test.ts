import { describe, expect, it } from 'vitest';

import { formatDotNetDate, renderClock, renderDuration } from '../../src/modules/live-outputs/template-engine.js';

describe('live output template engine', () => {
  it('renders Snaz clock and duration tokens', () => {
    const date = new Date('2026-08-02T21:05:09.125Z');
    expect(renderClock(date, {
      format: '$h:$m:$s $tt', use24Hour: false, removeLeadingHourZero: false, timeZone: 'UTC',
    })).toBe('09:05:09 PM');
    expect(renderDuration('$d:$h:$m:$s.$ms', 2 * 86_400_000 + 4 * 3_600_000 + 15 * 60_000 + 9_125, {
      doubleDigits: true, omitLeadingZeroUnits: false, useDays: true,
    })).toBe('02:04:15:09.125');
    expect(renderDuration('$h:$m:$s ($totalminutes)', 49 * 3_600_000 + 5 * 60_000, {
      doubleDigits: true, omitLeadingZeroUnits: false, useDays: false,
    })).toBe('49:05:00 (2945)');
  });

  it('renders common .NET date tokens with the configured locale and timezone', () => {
    const date = new Date('2026-08-02T15:30:00.000Z');
    expect(formatDotNetDate(date, 'dddd dd MMMM yyyy', 'en-US', 'UTC')).toBe('Sunday 02 August 2026');
    expect(formatDotNetDate(date, "dd/MM/yyyy 'at' HH:mm", 'en-US', 'UTC')).toBe('02/08/2026 at 15:30');
  });

  it('rejects an unclosed literal', () => {
    expect(() => formatDotNetDate(new Date(), "yyyy 'broken", 'en-US', 'UTC')).toThrow('Unclosed');
  });
});
