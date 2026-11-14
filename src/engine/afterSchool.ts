import { custodianOn, eligibleParents } from "./custody";
import { dateParts, parseISO, toISO, type ISODate } from "./dates";
import { parentIsHome, schoolCalendarFor } from "./gaps";
import type { AfterSchoolOption, AfterSchoolSettings, Child, FamilyPlan } from "./types";

export type AfterSchoolKind =
  | "parent"
  | "helper"
  | "wfh"
  | "leaveEarly"
  | "program"
  | "sitter"
  | "monthly"
  | "carpool"
  | "self"
  | "none";

export interface AfterSchoolDay {
  date: ISODate;
  /** Kids who are at school that day and need someone at dismissal. */
  childIds: string[];
  kind: AfterSchoolKind;
  refId: string;
  label: string;
  cost: number;
  /** School lets out early that day. */
  early: boolean;
  /** Hours of cover from dismissal to the end of the workday. */
  hours: number;
  /** Kids who don't need pickup that day, and why ("Ava: swim team"). */
  notes: string[];
  /** You drive the carpool kids this afternoon. */
  payback?: string;
}

export interface MonthlyDecision {
  month: string;
  optionId: string;
  name: string;
  enrolled: boolean;
  fee: number;
  /** What the covered afternoons would cost without the enrollment. */
  dropIn: number;
}

export interface CarpoolDecision {
  week: ISODate;
  optionId: string;
  name: string;
  used: boolean;
  saved: number;
}

export interface AfterSchoolPlan {
  days: AfterSchoolDay[];
  total: number;
  /** Everyone who needs pickup in the cheapest paid option every school day: the usual way. */
  usualWay: number;
  /** Most common cover and its typical cost, per weekday (1 = Mon … 5 = Fri). */
  week: Array<{ weekday: number; label: string; kind: AfterSchoolKind; cost: number; days: number }>;
  /** Average spend per calendar month with school days. */
  perMonth: number;
  uncovered: number;
  monthly: MonthlyDecision[];
  carpools: CarpoolDecision[];
}

/** Afternoon versions of the full-day costs: after school is about half a workday. */
const AFTERNOON = 0.5;

type Choice = Pick<AfterSchoolDay, "kind" | "refId" | "label" | "cost">;

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const clock = (hhmm: string) => {
  const m = minutes(hhmm);
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}${m % 60 ? `:${String(m % 60).padStart(2, "0")}` : ""}`;
};

/** Hours between dismissal and the end of work; early-release days add the extra hours. */
export function afternoonHours(settings: AfterSchoolSettings, early: boolean): number {
  const base = Math.max(0, (minutes(settings.workEnds) - minutes(settings.dismissal)) / 60);
  return base + (early ? settings.earlyReleaseExtraHours ?? 2 : 0);
}

/** Cash for one afternoon of a drop-in or hourly option. Monthly and carpool options are priced elsewhere. */
export function optionDayCost(o: AfterSchoolOption, kids: number, hours: number): number {
  const unit = o.billing === "hour" ? o.price * hours : o.price;
  return Math.round(o.pricing === "perChild" ? unit * kids : unit);
}

const dayOnly = (o: AfterSchoolOption) => o.kind !== "carpool" && o.billing !== "month";

function weekStart(date: ISODate): ISODate {
  const d = parseISO(date);
  return toISO(d - ((dateParts(d).weekday + 6) % 7));
}

interface Slot {
  date: ISODate;
  weekday: number;
  kids: Child[];
  early: boolean;
  hours: number;
  notes: string[];
  choices: Choice[];
  best: Choice | null;
  /** Cheapest way a parent can be there (needed to drive a carpool). */
  parentCover: Choice | null;
}

/**
 * Every school day from today to the end of the plan: who gets the kids at
 * dismissal and covers until the workday ends.
 *
 * 1. Each afternoon takes the cheapest cover available that day: a parent who
 *    is off, a helper, a work-from-home parent, leaving early, a drop-in
 *    program, or a sitter paid by the hour (more hours on early-release days).
 *    Kids who can be home alone drop out; an activity that ends before work
 *    does shortens the afternoon (cover starts when it ends), otherwise the kid drops out.
 * 2. Monthly enrollments (fixed weekdays, one fee) are taken for a month only
 *    if the fee beats paying for those afternoons one by one.
 * 3. A carpool is used for a week only if the afternoons it covers save more
 *    than driving the other family's kids on your payback days costs.
 *
 * Afternoons don't compete for limited resources, so step 1 is exactly optimal;
 * steps 2 and 3 compare each month or week as a whole against step 1.
 */
export function planAfterSchool(plan: FamilyPlan): AfterSchoolPlan | null {
  const settings = plan.afterSchool;
  if (!settings?.enabled || plan.children.length === 0) return null;
  const start = parseISO(plan.today);
  const end = parseISO(plan.horizonEnd);
  const sickOn = new Map<string, Set<string>>();
  const closedOn = new Set<string>();
  for (const s of plan.surprises) {
    if (s.reason === "sick") sickOn.set(s.date, new Set([...(sickOn.get(s.date) ?? []), ...s.childIds]));
    else closedOn.add(s.date);
  }
  const cals = plan.children.map((c) => {
    const cal = schoolCalendarFor(plan, c.schoolId);
    return { child: c, closures: new Set(cal.closures), early: new Set(cal.earlyRelease ?? []), lastDay: cal.lastDay, nextFirstDay: cal.nextFirstDay };
  });
  const dayOptions = settings.options.filter(dayOnly);

  const slots: Slot[] = [];
  for (let d = start; d <= end; d++) {
    const date = toISO(d);
    const weekday = dateParts(d).weekday;
    if (weekday === 0 || weekday === 6 || closedOn.has(date)) continue;
    const inSchool = cals.filter(
      (c) => (date <= c.lastDay || date >= c.nextFirstDay) && !c.closures.has(date) && !sickOn.get(date)?.has(c.child.id),
    );
    if (inSchool.length === 0) continue;
    const early = inSchool.some((c) => c.early.has(date));
    const notes: string[] = [];
    const kids: Child[] = [];
    // When cover has to start: at dismissal (earlier on early-release days), or when an activity ends.
    const workEnds = minutes(settings.workEnds);
    const dismissal = workEnds - afternoonHours(settings, early) * 60;
    const starts: number[] = [];
    for (const { child } of inSchool) {
      const activity = child.activities?.find((a) => a.weekdays.includes(weekday));
      if (child.homeAloneAfterSchool) notes.push(`${child.name} walks home`);
      else if (activity && (!activity.until || minutes(activity.until) >= workEnds)) notes.push(`${child.name}: ${activity.name}`);
      else if (activity) {
        notes.push(`${child.name}: ${activity.name} until ${clock(activity.until!)}`);
        kids.push(child);
        starts.push(Math.max(dismissal, minutes(activity.until!)));
      } else {
        kids.push(child);
        starts.push(dismissal);
      }
    }
    const n = kids.length;
    const hours = n ? Math.round(((workEnds - Math.min(...starts)) / 60) * 100) / 100 : 0;

    const eligible = eligibleParents(plan, date);
    const custodian = custodianOn(plan.custody, date, plan.school);
    const parents = plan.parents.filter((p) => eligible.has(p.id)).sort((a, b) => Number(b.id === custodian) - Number(a.id === custodian));
    const parentChoices: Choice[] = [];
    const choices: Choice[] = [];
    for (const p of parents) if (parentIsHome(p, date)) parentChoices.push({ kind: "parent", refId: p.id, label: `${p.name} is off`, cost: 0 });
    for (const h of plan.helpers) {
      if (h.afterSchool === false || !h.weekdays.includes(weekday) || h.unavailable?.includes(date)) continue;
      if (h.home && plan.custody && custodian !== h.home) continue;
      choices.push({ kind: "helper", refId: h.id, label: `${h.name} picks up`, cost: Math.round(h.costPerDay * AFTERNOON) });
    }
    for (const p of parents) {
      if (p.wfhDays.includes(weekday) && kids.every((k) => k.okWithWfhParent))
        parentChoices.push({ kind: "wfh", refId: p.id, label: `${p.name} works from home`, cost: Math.round(plan.settings.wfhPenalty * AFTERNOON) });
      if (p.pickupDays?.includes(weekday)) parentChoices.push({ kind: "leaveEarly", refId: p.id, label: `${p.name} leaves early`, cost: settings.leaveEarlyCost });
    }
    for (const o of dayOptions) choices.push({ kind: o.kind, refId: o.id, label: o.billing === "hour" ? `${o.name} (${hours} h)` : o.name, cost: optionDayCost(o, n, hours) });

    const cheapest = (list: Choice[]) => list.reduce<Choice | null>((b, c) => (b === null || c.cost < b.cost ? c : b), null);
    // Parents first so ties keep the free, family choice.
    const all = [...parentChoices.filter((c) => c.kind === "parent"), ...choices.filter((c) => c.kind === "helper"), ...parentChoices.filter((c) => c.kind !== "parent"), ...choices.filter((c) => c.kind !== "helper")];
    slots.push({ date, weekday, kids, early, hours, notes, choices: all, best: n === 0 ? null : cheapest(all), parentCover: cheapest(parentChoices) });
  }

  const days: AfterSchoolDay[] = slots.map((s) => {
    const base = { date: s.date, childIds: s.kids.map((k) => k.id), early: s.early, hours: s.hours, notes: s.notes };
    if (s.kids.length === 0) return { ...base, kind: "self", refId: "", label: s.notes.join(", "), cost: 0 };
    if (s.best) return { ...base, ...s.best };
    return { ...base, kind: "none", refId: "", label: "Nobody: add after-care or a sitter", cost: 0 };
  });
  const usualWay = slots.reduce((sum, s) => {
    if (s.kids.length === 0) return sum;
    const paid = dayOptions.map((o) => optionDayCost(o, s.kids.length, s.hours));
    return sum + (paid.length ? Math.min(...paid) : 0);
  }, 0);

  // 2. Monthly enrollments: per month, the single option that saves the most.
  const monthly: MonthlyDecision[] = [];
  const monthlyOptions = settings.options.filter((o) => o.kind !== "carpool" && o.billing === "month");
  if (monthlyOptions.length > 0) {
    const months = [...new Set(days.map((x) => x.date.slice(0, 7)))];
    for (const month of months) {
      let pick: { o: AfterSchoolOption; idx: number[]; fee: number; dropIn: number } | null = null;
      for (const o of monthlyOptions) {
        const wd = o.weekdays?.length ? o.weekdays : [1, 2, 3, 4, 5];
        const idx = days.flatMap((x, i) => (x.date.startsWith(month) && x.childIds.length > 0 && wd.includes(slots[i].weekday) ? [i] : []));
        if (idx.length === 0) continue;
        const kids = new Set(idx.flatMap((i) => days[i].childIds)).size;
        const fee = Math.round(o.pricing === "perChild" ? o.price * kids : o.price);
        const dropIn = idx.reduce((s, i) => s + days[i].cost, 0);
        monthly.push({ month, optionId: o.id, name: o.name, enrolled: false, fee, dropIn });
        if (fee < dropIn && (pick === null || dropIn - fee > pick.dropIn - pick.fee)) pick = { o, idx, fee, dropIn };
      }
      if (pick) {
        const chosen = pick;
        monthly.forEach((m) => {
          if (m.month === month && m.optionId === chosen.o.id) m.enrolled = true;
        });
        const share = chosen.fee / chosen.idx.length;
        let left = chosen.fee;
        chosen.idx.forEach((i, k) => {
          const cost = k === chosen.idx.length - 1 ? left : Math.round(share);
          left -= cost;
          days[i] = { ...days[i], kind: "monthly", refId: chosen.o.id, label: `${chosen.o.name} (monthly)`, cost };
        });
      }
    }
  }

  // 3. Carpools: per week, use it only if it saves money overall.
  const carpools: CarpoolDecision[] = [];
  for (const o of settings.options.filter((x) => x.kind === "carpool")) {
    const theyDrive = o.weekdays ?? [];
    const weDrive = o.payback ?? [];
    const weeks = [...new Set(days.map((x) => weekStart(x.date)))];
    for (const week of weeks) {
      const idx = days.flatMap((x, i) => (weekStart(x.date) === week ? [i] : []));
      const rides = idx.filter((i) => theyDrive.includes(slots[i].weekday) && days[i].childIds.length > 0 && days[i].kind !== "carpool");
      const paybacks = idx.filter((i) => weDrive.includes(slots[i].weekday) && !theyDrive.includes(slots[i].weekday));
      if (rides.length === 0) continue;
      const missingPayback = weDrive.some((w) => !theyDrive.includes(w) && !paybacks.some((i) => slots[i].weekday === w));
      const blocked = missingPayback || paybacks.some((i) => !slots[i].parentCover);
      let saved = rides.reduce((s, i) => s + days[i].cost, 0);
      for (const i of paybacks) if (slots[i].parentCover) saved -= slots[i].parentCover!.cost - days[i].cost;
      const used = !blocked && saved > 0;
      carpools.push({ week, optionId: o.id, name: o.name, used, saved: used ? Math.round(saved) : 0 });
      if (!used) continue;
      for (const i of rides) days[i] = { ...days[i], kind: "carpool", refId: o.id, label: `${o.name}: they drive`, cost: 0 };
      for (const i of paybacks) {
        const cover = slots[i].parentCover!;
        days[i] = { ...days[i], ...cover, label: `${cover.label}, drives the carpool`, payback: o.name };
      }
    }
  }

  const total = days.reduce((s, x) => s + x.cost, 0);
  // The usual week: the most common cover per weekday.
  const week = [1, 2, 3, 4, 5].map((weekday) => {
    const list = days.filter((_, i) => slots[i].weekday === weekday);
    const counts = new Map<string, { label: string; kind: AfterSchoolKind; n: number; cost: number }>();
    for (const x of list) {
      const e = counts.get(x.label) ?? { label: x.label, kind: x.kind, n: 0, cost: 0 };
      e.n += 1;
      e.cost += x.cost;
      counts.set(x.label, e);
    }
    const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    return { weekday, label: top?.label ?? "No school", kind: top?.kind ?? ("none" as AfterSchoolKind), cost: top ? Math.round(top.cost / top.n) : 0, days: list.length };
  });

  const months = new Set(days.map((x) => x.date.slice(0, 7)));
  return {
    days,
    total: Math.round(total),
    usualWay: Math.round(usualWay),
    week,
    perMonth: months.size ? Math.round(total / months.size) : 0,
    uncovered: days.filter((x) => x.kind === "none").length,
    monthly,
    carpools,
  };
}
