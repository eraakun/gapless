/**
 * Date helpers that work on whole calendar days in UTC.
 *
 * Every date in the engine is an ISO `YYYY-MM-DD` string or a "day number"
 * (days since 1970-01-01). Using UTC day numbers avoids daylight-saving and
 * time-zone bugs that show up when you add days to local `Date` objects.
 */

export type ISODate = string;

const MS_PER_DAY = 86_400_000;
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dayFromYMD(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function toISO(dayNum: number): ISODate {
  return new Date(dayNum * MS_PER_DAY).toISOString().slice(0, 10);
}

export function parseISO(iso: ISODate): number {
  const match = ISO_PATTERN.exec(iso);
  if (!match) throw new Error(`Invalid date "${iso}" (expected YYYY-MM-DD)`);
  const dayNum = dayFromYMD(Number(match[1]), Number(match[2]), Number(match[3]));
  // Reject dates that silently roll over, e.g. 2026-02-31.
  if (toISO(dayNum) !== iso) throw new Error(`Invalid calendar date "${iso}"`);
  return dayNum;
}

export function isValidISO(iso: string): boolean {
  try {
    parseISO(iso);
    return true;
  } catch {
    return false;
  }
}

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekday: number; // 0 = Sunday
}

export function dateParts(dayNum: number): DateParts {
  const d = new Date(dayNum * MS_PER_DAY);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  return toISO(parseISO(iso) + days);
}

export function daysBetween(fromISO: ISODate, toISODate: ISODate): number {
  return parseISO(toISODate) - parseISO(fromISO);
}

/** Today's date in the user's local time zone, as an ISO string. */
export function localTodayISO(now: Date = new Date()): ISODate {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Calls `fn` for every (year, month) that overlaps the day range. */
export function forEachMonth(
  startDay: number,
  endDay: number,
  fn: (year: number, month: number) => void,
): void {
  const start = dateParts(startDay);
  const end = dateParts(endDay);
  let year = start.year;
  let month = start.month;
  while (year < end.year || (year === end.year && month <= end.month)) {
    fn(year, month);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
