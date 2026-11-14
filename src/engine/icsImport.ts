import { dateParts, isValidISO, parseISO, toISO } from "./dates";

export interface ImportedClosure {
  date: string;
  title: string;
}

/** Event titles that mean "no school for students". */
const CLOSED = /no school|student holiday|holiday|break|recess|teacher work|workday|staff development|professional (development|learning)|planning day|school closed|schools closed|non-?student|records day|conference day|inservice|in-service/i;
/** Titles that look like closures but aren't full days off. */
const NOT_CLOSED = /early (release|dismissal)|half[- ]day|late start|delayed opening|first day|last day|back to school|open house|picture day|board meeting/i;
/** School days that end early. */
const EARLY = /early (release|dismissal)|half[- ]day|minimum day|early out/i;

/** Undoes RFC 5545 line folding (continuation lines start with a space or tab). */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseDate(value: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return isValidISO(iso) ? parseISO(iso) : null;
}

function unescapeText(text: string): string {
  return text.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/**
 * Reads a school district's calendar (.ics, the "subscribe" or "export"
 * file most US districts publish) and returns the weekdays that look like
 * student closures. All-day multi-day events (winter break) are expanded;
 * DTEND is exclusive for all-day events, as RFC 5545 specifies.
 */
export function parseSchoolIcs(text: string): ImportedClosure[] {
  return collect(text, (summary) => CLOSED.test(summary) && !NOT_CLOSED.test(summary));
}

/** Early-release and half days from the same .ics file: school is open, but kids need an afternoon pickup. */
export function parseEarlyReleaseIcs(text: string): ImportedClosure[] {
  return collect(text, (summary) => EARLY.test(summary));
}

function collect(text: string, keep: (summary: string) => boolean): ImportedClosure[] {
  const found = new Map<string, string>();
  let inEvent = false;
  let summary = "";
  let start: number | null = null;
  let end: number | null = null;
  let allDay = false;

  for (const line of unfold(text)) {
    if (line.startsWith("BEGIN:VEVENT")) {
      inEvent = true;
      summary = "";
      start = end = null;
      allDay = false;
      continue;
    }
    if (line.startsWith("END:VEVENT")) {
      inEvent = false;
      if (start === null || !keep(summary)) continue;
      // All-day DTEND is exclusive; timed events count only their start day.
      const last = end !== null && allDay ? Math.max(start, end - 1) : start;
      for (let d = start; d <= Math.min(last, start + 60); d++) {
        const { weekday } = dateParts(d);
        if (weekday !== 0 && weekday !== 6 && !found.has(toISO(d))) found.set(toISO(d), summary);
      }
      continue;
    }
    if (!inEvent) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const name = line.slice(0, colon).toUpperCase();
    const value = line.slice(colon + 1);
    if (name === "SUMMARY") summary = unescapeText(value);
    else if (name.startsWith("DTSTART")) {
      start = parseDate(value);
      allDay = name.includes("VALUE=DATE") || /^\d{8}$/.test(value.trim());
    } else if (name.startsWith("DTEND")) end = parseDate(value);
  }

  return [...found.entries()].map(([date, title]) => ({ date, title })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Parses pasted dates: "2027-01-29", "1/29/2027", or ranges like "3/22/2027 - 3/26/2027", one per line or comma-separated. */
export function parseDateList(text: string): string[] {
  const toDay = (raw: string): number | null => {
    const s = raw.trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) {
      const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      return isValidISO(iso) ? parseISO(iso) : null;
    }
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) {
      const iso = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
      return isValidISO(iso) ? parseISO(iso) : null;
    }
    return null;
  };
  const out = new Set<string>();
  for (const chunk of text.split(/[\n,;]+/)) {
    const parts = chunk.split(/\s+(?:-|–|to)\s+/);
    const a = toDay(parts[0] ?? "");
    if (a === null) continue;
    const b = parts[1] ? toDay(parts[1]) : a;
    for (let d = a; d <= (b ?? a) && d <= a + 60; d++) {
      const { weekday } = dateParts(d);
      if (weekday !== 0 && weekday !== 6) out.add(toISO(d));
    }
  }
  return [...out].sort();
}
