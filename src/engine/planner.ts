import { custodianOn, eligibleParents } from "./custody";
import { dateParts, parseISO } from "./dates";
import { MinCostFlow } from "./flow";
import { careNeeds, weekStartOf, type CareNeed } from "./gaps";
import type {
  Camp,
  CampWeek,
  Child,
  Cover,
  CoveragePlan,
  DayPlan,
  FamilyPlan,
  PaidCare,
  PlanSummary,
} from "./types";

/** Cost of leaving a day with nobody: high enough that the planner always fixes it if it can. */
export const UNCOVERED_COST = 100_000;
/** A helper is out on their unavailable dates; with two homes, one tied to a parent's side only covers that parent's days. */
function helperAtHome(plan: FamilyPlan, helper: FamilyPlan["helpers"][number], date: string): boolean {
  if (helper.unavailable?.includes(date)) return false;
  if (!helper.home || !plan.custody) return true;
  return custodianOn(plan.custody, date, plan.school) === helper.home;
}

/** Tiny cost per PTO day already used by that parent, so leave is split fairly when it's a tie. */
const FAIRNESS_STEP = 0.01;

type CampKey = string;
const campKey = (campId: string, childId: string, weekStart: string): CampKey => `${campId}|${childId}|${weekStart}`;
const parseKey = (key: CampKey) => {
  const [campId, childId, weekStart] = key.split("|");
  return { campId, childId, weekStart };
};

interface Context {
  plan: FamilyPlan;
  needs: CareNeed[];
  gaps: CareNeed[];
  children: Map<string, Child>;
  camps: Map<string, Camp>;
  sickDates: Set<string>;
}

function buildContext(plan: FamilyPlan): Context {
  const needs = careNeeds(plan);
  return {
    plan,
    needs,
    gaps: needs.filter((n) => n.homeParentId === null),
    children: new Map(plan.children.map((c) => [c.id, c])),
    camps: new Map(plan.camps.map((c) => [c.id, c])),
    sickDates: new Set(plan.surprises.filter((s) => s.reason === "sick").map((s) => s.date)),
  };
}

/** Camps run on planned closures and summer days; they don't take sick kids or open for surprise closures. */
function campRunsFor(camp: Camp, child: Child, need: CareNeed): boolean {
  return (
    (need.reason === "closure" || need.reason === "summer") &&
    need.date >= camp.start &&
    need.date <= camp.end &&
    child.age >= camp.minAge &&
    child.age <= camp.maxAge
  );
}

/** Kids still needing care on a day once booked camp weeks are taken into account. */
function kidsLeft(ctx: Context, need: CareNeed, booked: Set<CampKey>): { left: string[]; atCamp: Map<string, string> } {
  const week = weekStartOf(need.date);
  const atCamp = new Map<string, string>();
  for (const childId of need.childIds) {
    const child = ctx.children.get(childId);
    if (!child) continue;
    for (const camp of ctx.camps.values()) {
      if (booked.has(campKey(camp.id, childId, week)) && campRunsFor(camp, child, need)) {
        atCamp.set(childId, camp.id);
        break;
      }
    }
  }
  return { left: need.childIds.filter((id) => !atCamp.has(id)), atCamp };
}

/** Cheapest pay-by-the-day option for these kids on this day. */
function cheapestPaid(ctx: Context, need: CareNeed, kidCount: number): { cost: number; care: PaidCare | null } {
  const sick = ctx.sickDates.has(need.date);
  let best: { cost: number; care: PaidCare | null } = { cost: UNCOVERED_COST, care: null };
  for (const care of ctx.plan.paidCare) {
    if (sick && !care.takesSickKids) continue;
    if (need.reason === "summer" && !care.availableInSummer) continue;
    const cost = care.pricing === "perChild" ? care.pricePerDay * kidCount : care.pricePerDay;
    if (cost < best.cost) best = { cost, care };
  }
  return best;
}

interface DayChoice {
  need: CareNeed;
  left: string[];
  atCamp: Map<string, string>;
  paid: { cost: number; care: PaidCare | null };
  source: { kind: "pto" | "helper" | "wfh"; refId: string; reserve?: boolean } | null;
}

interface Solved {
  objective: number;
  campCash: number;
  choices: DayChoice[];
}

/**
 * Given which camp weeks are booked, assigns every remaining gap day to the
 * best source with a min-cost flow:
 *
 *   source -> [parent PTO, parent PTO reserve, helper, parent WFH] -> day -> sink
 *
 * Paying by the day is the default for every day. An arc resource -> day
 * costs (resource cost - that day's paid cost), so flow only goes through a
 * resource where it saves money, and capacities (PTO balances, how many days
 * grandma can do) are respected exactly. PTO arcs are split into unit arcs
 * with slowly rising cost, which spreads leave fairly between parents.
 */
function solveDays(ctx: Context, booked: Set<CampKey>): Solved {
  const { plan } = ctx;
  const choices: DayChoice[] = [];
  for (const need of ctx.gaps) {
    const { left, atCamp } = kidsLeft(ctx, need, booked);
    if (left.length === 0) {
      choices.push({ need, left, atCamp, paid: { cost: 0, care: null }, source: null });
      continue;
    }
    choices.push({ need, left, atCamp, paid: cheapestPaid(ctx, need, left.length), source: null });
  }

  const open = choices.filter((c) => c.left.length > 0);
  let campCash = 0;
  for (const key of booked) {
    const camp = ctx.camps.get(parseKey(key).campId);
    if (camp) campCash += camp.pricePerChildWeek;
  }

  const S = 0;
  const T = 1;
  let next = 2;
  type Res = { node: number; kind: "pto" | "helper" | "wfh"; refId: string; reserve?: boolean; allows: (c: DayChoice) => boolean; cost: number };
  const resources: Res[] = [];
  const graphArcs: Array<{ from: number; to: number; cap: number; cost: number }> = [];
  const lambda = plan.settings.ptoDayValue;

  for (const parent of plan.parents) {
    const total = Math.max(0, Math.floor(parent.ptoDays));
    const reserve = Math.min(total, Math.max(0, Math.floor(parent.sickReserve)));
    const main = total - reserve;
    const mainNode = next++;
    const reserveNode = next++;
    const mayCover = (c: DayChoice) => eligibleParents(plan, c.need.date).has(parent.id);
    resources.push({ node: mainNode, kind: "pto", refId: parent.id, allows: mayCover, cost: 0 });
    resources.push({ node: reserveNode, kind: "pto", refId: parent.id, reserve: true, allows: (c) => c.need.surprise && mayCover(c), cost: 0 });
    for (let i = 0; i < main; i++) graphArcs.push({ from: S, to: mainNode, cap: 1, cost: lambda + FAIRNESS_STEP * i });
    for (let i = 0; i < reserve; i++) graphArcs.push({ from: S, to: reserveNode, cap: 1, cost: lambda + FAIRNESS_STEP * (main + i) });

    if (parent.wfhDays.length > 0) {
      const wfhNode = next++;
      resources.push({
        node: wfhNode,
        kind: "wfh",
        refId: parent.id,
        allows: (c) =>
          mayCover(c) &&
          parent.wfhDays.includes(dateParts(parseISO(c.need.date)).weekday) &&
          c.left.every((id) => ctx.children.get(id)?.okWithWfhParent),
        cost: 0,
      });
      graphArcs.push({ from: S, to: wfhNode, cap: open.length, cost: plan.settings.wfhPenalty });
    }
  }
  for (const helper of plan.helpers) {
    const node = next++;
    resources.push({
      node,
      kind: "helper",
      refId: helper.id,
      allows: (c) =>
        helper.weekdays.includes(dateParts(parseISO(c.need.date)).weekday) &&
        (!ctx.sickDates.has(c.need.date) || helper.takesSickKids) &&
        helperAtHome(plan, helper, c.need.date),
      cost: 0,
    });
    // A hair above the helper's cash cost, so a free helper still beats paying $0 elsewhere on ties.
    graphArcs.push({ from: S, to: node, cap: Math.max(0, Math.floor(helper.maxDays)), cost: helper.costPerDay + 0.5 });
  }

  const dayNodes = open.map(() => next++);
  const flow = new MinCostFlow(next);
  for (const a of graphArcs) flow.addArc(a.from, a.to, a.cap, a.cost);
  const usage: Array<{ arc: [number, number]; res: Res; choice: DayChoice }> = [];
  open.forEach((choice, i) => {
    flow.addArc(dayNodes[i], T, 1, 0);
    for (const res of resources) {
      if (res.allows(choice)) usage.push({ arc: flow.addArc(res.node, dayNodes[i], 1, -choice.paid.cost), res, choice });
    }
  });
  const { cost } = flow.solve(S, T);

  for (const u of usage) {
    if (flow.flowOn(u.arc) > 0) u.choice.source = { kind: u.res.kind, refId: u.res.refId, reserve: u.res.reserve };
  }
  const paidTotal = open.reduce((sum, c) => sum + c.paid.cost, 0);
  return { objective: campCash + paidTotal + cost, campCash, choices };
}

/** Every (camp, child, week) that could cover at least one gap day. */
function campCandidates(ctx: Context): CampKey[] {
  const keys = new Set<CampKey>();
  for (const need of ctx.gaps) {
    for (const childId of need.childIds) {
      const child = ctx.children.get(childId);
      if (!child) continue;
      for (const camp of ctx.camps.values()) {
        if (campRunsFor(camp, child, need)) keys.add(campKey(camp.id, childId, weekStartOf(need.date)));
      }
    }
  }
  return [...keys].sort();
}

/**
 * Chooses camp weeks by local search around the flow solver: try booking or
 * dropping each camp week (for one child, and for all eligible kids at once,
 * since a camp only frees a parent if every kid is covered), keep any change
 * that lowers the total, and repeat until nothing improves. Weeks you've
 * already booked stay booked.
 */
export function optimizePlan(plan: FamilyPlan): CoveragePlan {
  const ctx = buildContext(plan);
  const locked = new Set(plan.bookings.map((b) => campKey(b.campId, b.childId, b.weekStart)));
  const candidates = campCandidates(ctx).filter((k) => !locked.has(k));

  const groups = new Map<string, CampKey[]>();
  for (const key of candidates) {
    const { campId, weekStart } = parseKey(key);
    const g = `${campId}|${weekStart}`;
    groups.set(g, [...(groups.get(g) ?? []), key]);
  }
  const moves: CampKey[][] = [...candidates.map((k) => [k]), ...[...groups.values()].filter((g) => g.length > 1)];

  const booked = new Set(locked);
  let best = solveDays(ctx, booked);
  for (let pass = 0; pass < 8; pass++) {
    let improved = false;
    for (const move of moves) {
      const adding = move.some((k) => !booked.has(k));
      const trial = new Set(booked);
      for (const k of move) {
        if (adding) trial.add(k);
        else trial.delete(k);
      }
      const result = solveDays(ctx, trial);
      if (result.objective < best.objective - 0.5) {
        best = result;
        booked.clear();
        trial.forEach((k) => booked.add(k));
        improved = true;
      }
    }
    if (!improved) break;
  }
  return buildPlan(ctx, booked, locked, best);
}

/**
 * What most families do, for comparison: book camp for every week a camp
 * runs, spend vacation days first-come-first-served (alternating parents,
 * with nothing held back for sick days), then ask the helper, then pay.
 */
export function typicalPlan(plan: FamilyPlan): CoveragePlan {
  const ctx = buildContext(plan);
  // One camp per child per week: the cheapest one that runs that week.
  const cheapest = new Map<string, CampKey>();
  for (const key of campCandidates(ctx)) {
    const { campId, childId, weekStart } = parseKey(key);
    const slot = `${childId}|${weekStart}`;
    const current = cheapest.get(slot);
    const price = ctx.camps.get(campId)!.pricePerChildWeek;
    if (!current || price < ctx.camps.get(parseKey(current).campId)!.pricePerChildWeek) cheapest.set(slot, key);
  }
  const booked = new Set(cheapest.values());
  for (const b of plan.bookings) booked.add(campKey(b.campId, b.childId, b.weekStart));

  const pto = new Map(plan.parents.map((p) => [p.id, Math.max(0, Math.floor(p.ptoDays))]));
  const helperLeft = new Map(plan.helpers.map((h) => [h.id, Math.max(0, Math.floor(h.maxDays))]));
  let turn = 0;
  const choices: DayChoice[] = [];
  let campCash = 0;
  for (const key of booked) campCash += ctx.camps.get(parseKey(key).campId)?.pricePerChildWeek ?? 0;
  let objective = campCash;

  for (const need of ctx.gaps) {
    const { left, atCamp } = kidsLeft(ctx, need, booked);
    const sick = ctx.sickDates.has(need.date);
    const choice: DayChoice = { need, left, atCamp, paid: cheapestPaid(ctx, need, left.length), source: null };
    choices.push(choice);
    if (left.length === 0) {
      choice.paid = { cost: 0, care: null };
      continue;
    }
    const order = plan.parents.map((_, i) => plan.parents[(turn + i) % plan.parents.length]);
    const eligible = eligibleParents(plan, need.date);
    const parent = order.find((p) => eligible.has(p.id) && (pto.get(p.id) ?? 0) > 0);
    if (parent) {
      pto.set(parent.id, pto.get(parent.id)! - 1);
      choice.source = { kind: "pto", refId: parent.id };
      turn += 1;
      objective += plan.settings.ptoDayValue;
      continue;
    }
    const weekday = dateParts(parseISO(need.date)).weekday;
    const helper = plan.helpers.find(
      (h) => (helperLeft.get(h.id) ?? 0) > 0 && h.weekdays.includes(weekday) && (!sick || h.takesSickKids) && helperAtHome(plan, h, need.date),
    );
    if (helper) {
      helperLeft.set(helper.id, helperLeft.get(helper.id)! - 1);
      choice.source = { kind: "helper", refId: helper.id };
      objective += helper.costPerDay;
      continue;
    }
    objective += choice.paid.cost;
  }
  return buildPlan(ctx, booked, new Set(), { objective, campCash, choices });
}

function buildPlan(ctx: Context, booked: Set<CampKey>, locked: Set<CampKey>, solved: Solved): CoveragePlan {
  const { plan } = ctx;
  const parentName = new Map(plan.parents.map((p) => [p.id, p.name]));
  const helperById = new Map(plan.helpers.map((h) => [h.id, h]));
  const choiceByDate = new Map(solved.choices.map((c) => [c.need.date, c]));

  const summary: PlanSummary = {
    cash: 0,
    ptoUsed: Object.fromEntries(plan.parents.map((p) => [p.id, 0])),
    reserveUsed: Object.fromEntries(plan.parents.map((p) => [p.id, 0])),
    helperDays: Object.fromEntries(plan.helpers.map((h) => [h.id, 0])),
    wfhDays: 0,
    paidDays: 0,
    campWeeks: 0,
    gapDays: ctx.gaps.length,
    freeParentDays: 0,
    uncoveredDays: 0,
    objective: Math.round(solved.objective * 100) / 100,
  };

  const campWeeks: CampWeek[] = [...booked]
    .map((key) => {
      const { campId, childId, weekStart } = parseKey(key);
      return { campId, childId, weekStart, price: ctx.camps.get(campId)?.pricePerChildWeek ?? 0, locked: locked.has(key) };
    })
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.childId.localeCompare(b.childId));
  summary.campWeeks = campWeeks.length;
  summary.cash += campWeeks.reduce((sum, w) => sum + w.price, 0);

  // Under a custody schedule, say so when the other parent steps in (right of first refusal).
  const rofr = (date: string, parentId: string) => {
    const custodian = custodianOn(plan.custody, date, plan.school);
    return custodian && custodian !== parentId ? " (first refusal)" : "";
  };

  const days: DayPlan[] = ctx.needs.map((need) => {
    const covers: Cover[] = [];
    if (need.homeParentId) {
      summary.freeParentDays += 1;
      covers.push({ kind: "parentOff", refId: need.homeParentId, label: `${parentName.get(need.homeParentId)} is off${rofr(need.date, need.homeParentId)}`, childIds: need.childIds, cash: 0 });
      return { date: need.date, reason: need.reason, childIds: need.childIds, covers };
    }
    const choice = choiceByDate.get(need.date)!;
    const byCamp = new Map<string, string[]>();
    choice.atCamp.forEach((campId, childId) => byCamp.set(campId, [...(byCamp.get(campId) ?? []), childId]));
    byCamp.forEach((kids, campId) =>
      covers.push({ kind: "camp", refId: campId, label: ctx.camps.get(campId)?.name ?? "Camp", childIds: kids, cash: 0 }),
    );

    if (choice.left.length > 0) {
      const src = choice.source;
      if (src?.kind === "pto") {
        if (src.reserve) summary.reserveUsed[src.refId] += 1;
        else summary.ptoUsed[src.refId] += 1;
        covers.push({ kind: "pto", refId: src.refId, label: `${parentName.get(src.refId)} takes PTO${rofr(need.date, src.refId)}`, childIds: choice.left, cash: 0 });
      } else if (src?.kind === "helper") {
        const helper = helperById.get(src.refId)!;
        summary.helperDays[src.refId] += 1;
        summary.cash += helper.costPerDay;
        covers.push({ kind: "helper", refId: src.refId, label: helper.name, childIds: choice.left, cash: helper.costPerDay });
      } else if (src?.kind === "wfh") {
        summary.wfhDays += 1;
        covers.push({ kind: "wfh", refId: src.refId, label: `${parentName.get(src.refId)} works from home`, childIds: choice.left, cash: 0 });
      } else if (choice.paid.care) {
        summary.paidDays += 1;
        summary.cash += choice.paid.cost;
        covers.push({ kind: "paid", refId: choice.paid.care.id, label: choice.paid.care.name, childIds: choice.left, cash: choice.paid.cost });
      } else {
        summary.uncoveredDays += 1;
        covers.push({ kind: "uncovered", refId: "", label: "Nobody available", childIds: choice.left, cash: 0 });
      }
    }
    return { date: need.date, reason: need.reason, childIds: need.childIds, covers };
  });

  summary.cash = Math.round(summary.cash * 100) / 100;
  return { days, campWeeks, summary };
}
