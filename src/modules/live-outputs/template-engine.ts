import type { AppLanguage } from '../../shared/types.js';

export function applyTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values)
    .sort(([a], [b]) => b.length - a.length)
    .reduce((output, [token, value]) => output.replaceAll(token, value), template);
}

export function renderClock(
  date: Date,
  options: { format: string; use24Hour: boolean; removeLeadingHourZero: boolean; timeZone: string },
): string {
  const parts = dateParts(date, 'en-US', options.timeZone, !options.use24Hour);
  let hour = options.use24Hour ? parts.hour24 : parts.hour12;
  if (!options.removeLeadingHourZero) hour = hour.padStart(2, '0');
  return applyTemplate(options.format, {
    '$h': hour,
    '$m': parts.minute.padStart(2, '0'),
    '$s': parts.second.padStart(2, '0'),
    '$tt': options.use24Hour ? '' : parts.dayPeriod,
  });
}

export function renderDuration(
  format: string,
  milliseconds: number,
  options: { doubleDigits: boolean; omitLeadingZeroUnits: boolean; useDays: boolean },
): string {
  const totalMilliseconds = Math.max(0, Math.floor(milliseconds));
  const totalSeconds = Math.floor(totalMilliseconds / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = options.useDays ? Math.floor(totalSeconds / 3_600) % 24 : Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  const pad = (value: number) => options.doubleDigits ? String(value).padStart(2, '0') : String(value);
  let normalizedFormat = format;
  if (options.omitLeadingZeroUnits) {
    if (days === 0) normalizedFormat = trimLeadingToken(normalizedFormat, '$d');
    if (!normalizedFormat.includes('$d') && hours === 0) normalizedFormat = trimLeadingToken(normalizedFormat, '$h');
    if (!normalizedFormat.includes('$h') && minutes === 0) normalizedFormat = trimLeadingToken(normalizedFormat, '$m');
  }
  return applyTemplate(normalizedFormat, {
    '$totalminutes': String(Math.floor(totalSeconds / 60)),
    '$ms': String(totalMilliseconds % 1_000).padStart(3, '0'),
    '$d': pad(days),
    '$h': pad(hours),
    '$m': pad(minutes),
    '$s': pad(seconds),
  });
}

function trimLeadingToken(format: string, token: string): string {
  const escaped = token.replace('$', '\\$');
  return format.replace(new RegExp(`^\\s*${escaped}\\s*(?:[:|/\\-]\\s*)?`), '');
}

export function formatDotNetDate(
  date: Date,
  format: string,
  locale: 'system' | AppLanguage,
  timeZone: string,
): string {
  const resolvedLocale = locale === 'system' ? undefined : locale;
  const parts = dateParts(date, resolvedLocale, timeZone, true);
  const monthLong = intlPart(date, resolvedLocale, timeZone, { month: 'long' });
  const monthShort = intlPart(date, resolvedLocale, timeZone, { month: 'short' });
  const weekdayLong = intlPart(date, resolvedLocale, timeZone, { weekday: 'long' });
  const weekdayShort = intlPart(date, resolvedLocale, timeZone, { weekday: 'short' });
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  const tokens: Record<string, string> = {
    yyyy: parts.year.padStart(4, '0'),
    yyy: parts.year.padStart(3, '0'),
    yy: parts.year.slice(-2).padStart(2, '0'),
    y: String(Number(parts.year)),
    MMMM: monthLong,
    MMM: monthShort,
    MM: parts.month.padStart(2, '0'),
    M: String(Number(parts.month)),
    dddd: weekdayLong,
    ddd: weekdayShort,
    dd: parts.day.padStart(2, '0'),
    d: String(Number(parts.day)),
    HH: parts.hour24.padStart(2, '0'),
    H: String(Number(parts.hour24)),
    hh: parts.hour12.padStart(2, '0'),
    h: String(Number(parts.hour12)),
    mm: parts.minute.padStart(2, '0'),
    m: String(Number(parts.minute)),
    ss: parts.second.padStart(2, '0'),
    s: String(Number(parts.second)),
    fff: milliseconds,
    ff: milliseconds.slice(0, 2),
    f: milliseconds.slice(0, 1),
    tt: parts.dayPeriod,
    t: parts.dayPeriod.slice(0, 1),
  };

  let output = '';
  for (let index = 0; index < format.length;) {
    const char = format[index];
    if (char === '\\' && index + 1 < format.length) {
      output += format[index + 1];
      index += 2;
      continue;
    }
    if (char === "'" || char === '"') {
      const quote = char;
      const end = format.indexOf(quote, index + 1);
      if (end < 0) throw new Error(`Unclosed date-format literal at ${index}`);
      output += format.slice(index + 1, end);
      index = end + 1;
      continue;
    }
    const token = Object.keys(tokens).find((candidate) => format.startsWith(candidate, index));
    if (token) {
      output += tokens[token];
      index += token.length;
      continue;
    }
    output += char;
    index += 1;
  }
  return output;
}

function intlPart(
  date: Date,
  locale: string | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: timeZone === 'system' ? undefined : timeZone }).format(date);
}

function dateParts(date: Date, locale: string | undefined, timeZone: string, hour12: boolean) {
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: timeZone === 'system' ? undefined : timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12,
  });
  const raw = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const hourValue = Number(raw.hour ?? '0');
  const hour24 = hour12
    ? String(((hourValue % 12) + ((raw.dayPeriod ?? '').toLowerCase().startsWith('p') ? 12 : 0)) % 24)
    : String(hourValue % 24);
  const hour12Value = hourValue === 0 ? 12 : ((hourValue - 1) % 12) + 1;
  return {
    year: raw.year ?? String(date.getFullYear()),
    month: raw.month ?? String(date.getMonth() + 1),
    day: raw.day ?? String(date.getDate()),
    hour24,
    hour12: String(hour12Value),
    minute: raw.minute ?? String(date.getMinutes()),
    second: raw.second ?? String(date.getSeconds()),
    dayPeriod: raw.dayPeriod ?? (hourValue >= 12 ? 'PM' : 'AM'),
  };
}
