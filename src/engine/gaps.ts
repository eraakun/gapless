import { dateParts, parseISO, toISO, type ISODate } from "./dates";
import type { FamilyPlan, GapDay, Parent } from "./types";
import { custodianOn, eligibleParents } from "./custody";

export function isWeekend(dayNum: number): boolean {
  const { weekday } = dateParts(dayNum);
  return weekday === 0 || weekday === 6;
}

export function parentIsHome(parent: Parent, date: ISODate): boolean {
  const { weekday } = dateParts(parseISO(date));
  return !parent.workdays.includes(weekday) || parent.holidays.includes(date);
}

/** The calendar a kid follows: their own school's, or the family's main school. */
export function schoolCalendarFor(plan: FamilyPlan, schoolId?: string): FamilyPlan["school"] {
  return (schoolId && plan.otherSchools?.find((s) => s.id === schoolId)?.calendar) || plan.school;
}

/** Monday of the week containing `date`. Camps bill by these weeks. */
export function weekStartOf(date: ISODate): ISODate {
  const day = parseISO(date);
  const { weekday } = dateParts(day);
  const offset = weekday === 0 ? 6 : weekday - 1;
  return toISO(day - offset);
}

export interface CareNeed {
  date: ISODate;
  childIds: string[];
  reason: GapDay["reason"];
  surprise: boolean;
  /** A parent who is home that day, if any. */
  homeParentId: string | null;
}

/**
 * Every weekday from today to the end of the plan when at least one kid has
 * no school (or is sick). Days when a parent is off work are covered for
 * free; the rest are the gaps the planner has to fill.
 */
export function careNeeds(plan: FamilyPlan): CareNeed[] {
  const start = parseISO(plan.today);
  const end = parseISO(plan.horizonEnd);
  const surprises = new Map(plan.surprises.map((s) => [s.date, s]));
  const allKids = plan.children.map((c) => c.id);
  // Each kid follows their own school's calendar (the main one unless they go elsewhere).
  const calendars = plan.children.map((c) => {
    const cal = schoolCalendarFor(plan, c.schoolId);
    return { id: c.id, closures: new Set(cal.closures), lastDay: parseISO(cal.lastDay), nextFirst: parseISO(cal.nextFirstDay) };
  });
  const out: CareNeed[] = [];

  for (let day = start; day <= end; day++) {
    if (isWeekend(day)) continue;
    const date = toISO(day);
    const surprise = surprises.get(date);
    let childIds: string[] = [];
    let reason: CareNeed["reason"] | null = null;

    for (const cal of calendars) {
      if (day > cal.lastDay && day < cal.nextFirst) {
        childIds.push(cal.id);
        reason = "summer";
      } else if (cal.closures.has(date)) {
        childIds.push(cal.id);
        if (reason === null) reason = "closure";
      }
    }
    if (surprise) {
      // A snow day closes school for everyone; a sick day adds one kid.
      const extra = surprise.childIds.filter((id) => allKids.includes(id));
      childIds = [...new Set([...childIds, ...extra])];
      if (reason === null) reason = surprise.reason;
    }
    if (reason === null || childIds.length === 0) continue;

    // With a custody schedule, only the parent who has the kids that day counts
    // (or either parent, under right of first refusal).
    // The parent who has the kids comes first; the other parent only steps in if the custodian works.
    const eligible = eligibleParents(plan, date);
    const custodian = custodianOn(plan.custody, date, plan.school);
    const ordered = [...plan.parents].sort((a, b) => Number(b.id === custodian) - Number(a.id === custodian));
    const home = ordered.find((p) => eligible.has(p.id) && parentIsHome(p, date));
    out.push({ date, childIds, reason, surprise: !!surprise, homeParentId: home?.id ?? null });
  }
  return out;
}

/** Only the days that actually need a decision: kids home, every parent working. */
export function gapDays(plan: FamilyPlan): GapDay[] {
  return careNeeds(plan)
    .filter((n) => n.homeParentId === null)
    .map(({ date, childIds, reason, surprise }) => ({ date, childIds, reason, surprise }));
}
