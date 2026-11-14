import { addDaysISO, dateParts, parseISO, type ISODate } from "./dates";
import type { ChangeStatus, Custody, CustodyPattern, FamilyPlan, ScheduleChange, SchoolCalendar } from "./types";

/**
 * 14-day cycles starting on a Monday. "A" days are with Parent A, "B" with Parent B.
 * Weekends are listed so the cycle lines up, though only weekdays matter for care.
 */
const CYCLES: Record<CustodyPattern, string> = {
  // Mon..Sun, then Mon..Sun
  alternatingWeeks: "AAAAAAA" + "BBBBBBB",
  "2-2-3": "AABBAAA" + "BBAABBB",
  "2-2-5-5": "AABBAAA" + "AABBBBB",
  primaryA: "AAAAABB" + "AAAAAAA",
};

export const CUSTODY_LABELS: Record<CustodyPattern, string> = {
  alternatingWeeks: "Week on, week off",
  "2-2-3": "2-2-3 (swap every few days)",
  "2-2-5-5": "2-2-5-5 (fixed weekdays, alternate weekends)",
  primaryA: "Parent A on school days, B every other weekend",
};

function cycleSide(pattern: CustodyPattern, start: ISODate, date: ISODate): "A" | "B" {
  const offset = (((parseISO(date) - parseISO(start)) % 14) + 14) % 14;
  return CYCLES[pattern][offset] === "A" ? "A" : "B";
}

/** Thanksgiving Thursday (4th Thursday of November) of `year`. */
function thanksgiving(year: number): ISODate {
  const nov1 = `${year}-11-01`;
  const wd = dateParts(parseISO(nov1)).weekday;
  return addDaysISO(nov1, ((4 - wd + 7) % 7) + 21);
}

/**
 * The holiday rule most US parenting plans use: holidays alternate by year.
 * Even years: Parent A has Thanksgiving (Thu-Sun) and the first half of winter break
 * (Dec 20-26); Parent B has the second half (Dec 27-Jan 5). Odd years flip.
 */
function holidaySide(date: ISODate): "A" | "B" | null {
  const { year, month, day } = dateParts(parseISO(date));
  const even = (y: number) => y % 2 === 0;
  if (month === 11) {
    const thu = thanksgiving(year);
    if (date >= thu && date <= addDaysISO(thu, 3)) return even(year) ? "A" : "B";
  }
  if (month === 12 && day >= 20) return day <= 26 ? (even(year) ? "A" : "B") : even(year) ? "B" : "A";
  if (month === 1 && day <= 5) return even(year - 1) ? "B" : "A";
  return null;
}

/** Base schedule plus holiday and summer rules, before any approved changes. */
function scheduledSide(custody: Custody, date: ISODate, school?: SchoolCalendar): "A" | "B" {
  if (custody.holidays === "alternate") {
    const h = holidaySide(date);
    if (h) return h;
  }
  if (custody.summer === "alternatingWeeks" && school && date > school.lastDay && date < school.nextFirstDay) {
    return cycleSide("alternatingWeeks", custody.start, date);
  }
  return cycleSide(custody.pattern, custody.start, date);
}

/**
 * Which parent has the kids on `date`, or null when there's no custody schedule.
 * Order: an approved change, then the holiday rule, then the summer rule, then the pattern.
 */
export function custodianOn(custody: Custody | undefined, date: ISODate, school?: SchoolCalendar): string | null {
  if (!custody) return null;
  const approved = custody.changes?.filter((c) => c.date === date && c.status === "approved").at(-1);
  if (approved && (approved.toParent === custody.parentA || approved.toParent === custody.parentB)) return approved.toParent;
  return scheduledSide(custody, date, school) === "A" ? custody.parentA : custody.parentB;
}

/** Who would have the kids without any approved changes. Used to describe a request. */
export function scheduledCustodian(custody: Custody, date: ISODate, school?: SchoolCalendar): string {
  return scheduledSide(custody, date, school) === "A" ? custody.parentA : custody.parentB;
}

/**
 * The parents who may look after the kids on `date`. Without a custody schedule,
 * or with right of first refusal, that's every parent; otherwise only the custodian.
 */
export function eligibleParents(plan: FamilyPlan, date: ISODate): Set<string> {
  const custodian = custodianOn(plan.custody, date, plan.school);
  if (!custodian || plan.custody?.firstRefusal) return new Set(plan.parents.map((p) => p.id));
  return new Set([custodian]);
}

export interface CustodyBlock {
  parentId: string;
  start: ISODate;
  end: ISODate;
  /** Calendar days in the block. */
  days: number;
}

/** Consecutive runs of days with the same parent, every calendar day from `from` to `to`. */
export function custodyBlocks(plan: FamilyPlan, from: ISODate, to: ISODate): CustodyBlock[] {
  const out: CustodyBlock[] = [];
  if (!plan.custody) return out;
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    const who = custodianOn(plan.custody, d, plan.school)!;
    const last = out.at(-1);
    if (last && last.parentId === who) {
      last.end = d;
      last.days += 1;
    } else out.push({ parentId: who, start: d, end: d, days: 1 });
  }
  return out;
}

/** Calendar days each parent has the kids between `from` and `to`. */
export function parentingTime(plan: FamilyPlan, from: ISODate, to: ISODate): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of custodyBlocks(plan, from, to)) out[b.parentId] = (out[b.parentId] ?? 0) + b.days;
  return out;
}

/** A new pending request. `now` is passed in so tests and the log stay deterministic. */
export function requestChange(custody: Custody, req: { id: string; date: ISODate; requestedBy: string; reason: string }, now: string, school?: SchoolCalendar): Custody {
  const current = custodianOn(custody, req.date, school);
  const other = current === custody.parentA ? custody.parentB : custody.parentA;
  const change: ScheduleChange = { ...req, toParent: other, status: "pending", createdAt: now };
  return { ...custody, changes: [...(custody.changes ?? []), change] };
}

/**
 * Approve or decline. Only the parent who didn't make the request may decide,
 * and a decision is final: it can't be flipped later, so the log stays honest.
 */
export function decideChange(custody: Custody, id: string, decidedBy: string, status: Exclude<ChangeStatus, "pending">, now: string, response = ""): Custody {
  const changes = (custody.changes ?? []).map((c) => {
    if (c.id !== id || c.status !== "pending" || c.requestedBy === decidedBy) return c;
    return { ...c, status, decidedAt: now, response: response.trim() || undefined };
  });
  return { ...custody, changes };
}

/** Split a dollar amount by Parent A's percentage share. */
export function splitCost(custody: Custody, cash: number): Record<string, number> {
  const shareA = Math.min(100, Math.max(0, custody.costShareA ?? 50));
  const a = Math.round((cash * shareA) / 100);
  return { [custody.parentA]: a, [custody.parentB]: cash - a };
}
