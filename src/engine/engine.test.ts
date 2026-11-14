import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCoverageCalendar,
  careNeeds,
  decodePlan,
  encodePlan,
  gapDays,
  MinCostFlow,
  optimizePlan,
  parseDateList,
  parseSchoolIcs,
  sanitizePlan,
  typicalPlan,
  weekStartOf,
  custodianOn,
  custodyBlocks,
  decideChange,
  parentingTime,
  requestChange,
  splitCost,
  type Custody,
  type FamilyPlan,
} from "./index";
import { buildExamplePlan } from "../data/example";

/** A one-week toy family: Mon Mar 22 - Fri Mar 26, 2027 is spring break. */
const tiny = (overrides: Partial<FamilyPlan> = {}): FamilyPlan => ({
  today: "2027-03-22",
  horizonEnd: "2027-03-26",
  children: [{ id: "k", name: "Kid", age: 8, okWithWfhParent: false }],
  parents: [{ id: "p", name: "Pat", workdays: [1, 2, 3, 4, 5], holidays: [], ptoDays: 0, sickReserve: 0, wfhDays: [] }],
  helpers: [],
  paidCare: [{ id: "sit", name: "Sitter", pricing: "perFamily", pricePerDay: 100, takesSickKids: true, availableInSummer: true }],
  camps: [],
  school: { closures: ["2027-03-22", "2027-03-23", "2027-03-24", "2027-03-25", "2027-03-26"], lastDay: "2027-06-16", nextFirstDay: "2027-08-23" },
  settings: { ptoDayValue: 150, wfhPenalty: 40 },
  surprises: [],
  bookings: [],
  ...overrides,
});

test("min-cost flow only sends flow where it saves money", () => {
  const f = new MinCostFlow(4);
  f.addArc(0, 1, 2, 0);
  const cheap = f.addArc(1, 2, 1, -10);
  const pricey = f.addArc(1, 3, 1, 5);
  f.addArc(2, 3, 1, 0);
  const result = f.solve(0, 3);
  assert.equal(result.cost, -10);
  assert.equal(f.flowOn(cheap), 1);
  assert.equal(f.flowOn(pricey), 0);
});

test("gaps: weekends skipped, a parent's day off covers for free", () => {
  const plan = tiny({
    parents: [
      { id: "a", name: "A", workdays: [1, 2, 3], holidays: [], ptoDays: 0, sickReserve: 0, wfhDays: [] },
      { id: "b", name: "B", workdays: [1, 2, 3, 4, 5], holidays: ["2027-03-22"], ptoDays: 0, sickReserve: 0, wfhDays: [] },
    ],
  });
  assert.equal(careNeeds(plan).length, 5);
  // Mon: B's holiday. Thu/Fri: A doesn't work. Tue/Wed are real gaps.
  assert.deepEqual(gapDays(plan).map((g) => g.date), ["2027-03-23", "2027-03-24"]);
});

test("summer is every weekday between the last day and the next first day", () => {
  const plan = tiny({ today: "2027-06-14", horizonEnd: "2027-06-25", school: { closures: [], lastDay: "2027-06-16", nextFirstDay: "2027-06-23" } });
  assert.deepEqual(gapDays(plan).map((g) => g.date), ["2027-06-17", "2027-06-18", "2027-06-21", "2027-06-22"]);
});

test("PTO is spent only where it beats paying, and never beyond the balance", () => {
  const plan = tiny({ parents: [{ id: "p", name: "Pat", workdays: [1, 2, 3, 4, 5], holidays: [], ptoDays: 3, sickReserve: 0, wfhDays: [] }] });
  // Sitter $100/day, a PTO day is worth $150 to them: pay the sitter.
  assert.equal(optimizePlan(plan).summary.ptoUsed.p, 0);
  // Sitter $300/day: use all 3 PTO days, pay for the other 2.
  const r = optimizePlan({ ...plan, paidCare: [{ ...plan.paidCare[0], pricePerDay: 300 }] });
  assert.equal(r.summary.ptoUsed.p, 3);
  assert.equal(r.summary.paidDays, 2);
  assert.equal(r.summary.cash, 600);
});

test("a week of camp beats five paid days when it's cheaper", () => {
  const plan = tiny({
    camps: [{ id: "c", name: "Spring camp", start: "2027-03-22", end: "2027-03-26", pricePerChildWeek: 280, minAge: 5, maxAge: 12 }],
  });
  const r = optimizePlan(plan);
  assert.equal(r.campWeeks.length, 1);
  assert.equal(r.summary.cash, 280);
  assert.equal(weekStartOf("2027-03-26"), "2027-03-22");
});

test("camps respect age limits", () => {
  const plan = tiny({
    children: [{ id: "k", name: "Kid", age: 4, okWithWfhParent: false }],
    camps: [{ id: "c", name: "Camp", start: "2027-03-22", end: "2027-03-26", pricePerChildWeek: 50, minAge: 5, maxAge: 12 }],
  });
  assert.equal(optimizePlan(plan).campWeeks.length, 0);
});

test("helper capacity and weekdays are respected", () => {
  const plan = tiny({ helpers: [{ id: "g", name: "Grandma", weekdays: [2, 3, 4], maxDays: 2, costPerDay: 0, takesSickKids: true }] });
  const r = optimizePlan(plan);
  assert.equal(r.summary.helperDays.g, 2);
  assert.equal(r.summary.paidDays, 3);
});

test("sick days: drop-in programs don't take sick kids; the PTO reserve does", () => {
  const plan = tiny({
    today: "2027-04-05",
    horizonEnd: "2027-04-09",
    school: { closures: [], lastDay: "2027-06-16", nextFirstDay: "2027-08-23" },
    parents: [{ id: "p", name: "Pat", workdays: [1, 2, 3, 4, 5], holidays: [], ptoDays: 1, sickReserve: 1, wfhDays: [] }],
    paidCare: [{ id: "drop", name: "Drop-in", pricing: "perChild", pricePerDay: 50, takesSickKids: false, availableInSummer: true }],
    surprises: [{ date: "2027-04-06", reason: "sick", childIds: ["k"] }],
  });
  const r = optimizePlan(plan);
  const day = r.days.find((d) => d.date === "2027-04-06")!;
  assert.equal(day.covers[0].kind, "pto");
  assert.equal(r.summary.reserveUsed.p, 1);
  assert.equal(r.summary.uncoveredDays, 0);
});

test("the sick-day reserve is never spent on planned closures", () => {
  const plan = tiny({
    parents: [{ id: "p", name: "Pat", workdays: [1, 2, 3, 4, 5], holidays: [], ptoDays: 2, sickReserve: 2, wfhDays: [] }],
    paidCare: [{ id: "sit", name: "Sitter", pricing: "perFamily", pricePerDay: 900, takesSickKids: true, availableInSummer: true }],
  });
  assert.equal(optimizePlan(plan).summary.ptoUsed.p, 0);
});

test("programs closed in summer aren't used in summer", () => {
  const plan = tiny({
    today: "2027-06-17",
    horizonEnd: "2027-06-18",
    school: { closures: [], lastDay: "2027-06-16", nextFirstDay: "2027-08-23" },
    paidCare: [{ id: "drop", name: "Drop-in", pricing: "perChild", pricePerDay: 50, takesSickKids: false, availableInSummer: false }],
  });
  assert.equal(optimizePlan(plan).summary.uncoveredDays, 2);
});

test("days nobody can cover are flagged, not hidden", () => {
  assert.equal(optimizePlan(tiny({ paidCare: [] })).summary.uncoveredDays, 5);
});

test("example family: optimized plan beats the typical plan and covers every day", () => {
  const plan = buildExamplePlan("2026-11-14");
  const best = optimizePlan(plan);
  const typical = typicalPlan(plan);
  assert.equal(best.summary.uncoveredDays, 0);
  assert.ok(best.summary.objective <= typical.summary.objective, `${best.summary.objective} vs ${typical.summary.objective}`);
  assert.ok(best.summary.cash < typical.summary.cash);
  for (const p of plan.parents) assert.ok(best.summary.ptoUsed[p.id] <= p.ptoDays - p.sickReserve, `${p.name} overspent PTO`);
  assert.ok(best.summary.helperDays.linda <= 12);
});

test("example family: never worse than typical, from any start date", () => {
  for (const today of ["2026-09-01", "2026-12-01", "2027-02-01", "2027-04-01", "2027-05-25"]) {
    const plan = buildExamplePlan(today);
    assert.ok(optimizePlan(plan).summary.objective <= typicalPlan(plan).summary.objective + 0.5, today);
  }
});

test("booked camp weeks are kept even if the optimizer wouldn't choose them", () => {
  const plan = buildExamplePlan("2026-11-14");
  plan.bookings = [{ campId: "summer", childId: "ava", weekStart: "2027-07-26" }];
  const r = optimizePlan(plan);
  assert.ok(r.campWeeks.some((w) => w.campId === "summer" && w.childId === "ava" && w.weekStart === "2027-07-26" && w.locked));
});

test("ics import: all-day ranges expand, early release is ignored, DTEND is exclusive", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20270322",
    "DTEND;VALUE=DATE:20270327",
    "SUMMARY:Spring Break - No School",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20270129",
    "SUMMARY:Teacher Work",
    " day",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20270128",
    "SUMMARY:2-Hour Early Release",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  assert.deepEqual(
    parseSchoolIcs(ics).map((c) => c.date),
    ["2027-01-29", "2027-03-22", "2027-03-23", "2027-03-24", "2027-03-25", "2027-03-26"],
  );
});

test("pasted dates: ISO, US format and ranges, weekends dropped", () => {
  assert.deepEqual(parseDateList("1/29/2027\n2027-02-01, 3/26/2027 - 3/29/2027"), ["2027-01-29", "2027-02-01", "2027-03-26", "2027-03-29"]);
});

test("ics export: one event per gap day plus registration reminders", () => {
  const plan = buildExamplePlan("2026-11-14");
  const coverage = optimizePlan(plan);
  const ics = buildCoverageCalendar(plan, coverage, new Date("2026-11-14T00:00:00Z"));
  const events = ics.split("BEGIN:VEVENT").length - 1;
  const gapEvents = coverage.days.filter((d) => !d.covers.every((c) => c.kind === "parentOff")).length;
  assert.ok(events >= gapEvents);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
});

test("share link round-trips a plan", async () => {
  const plan = buildExamplePlan("2026-11-14");
  const token = await encodePlan(plan);
  assert.deepEqual(sanitizePlan((await decodePlan(token)) as FamilyPlan), sanitizePlan(plan));
  assert.ok(token.length < JSON.stringify(plan).length, "compressed link is shorter than the JSON");
});

test("sanitize survives garbage", () => {
  const plan = sanitizePlan({ today: "nope", children: [null, { age: "x" }], parents: "bad" } as never, "2026-11-14");
  assert.equal(plan.today, "2026-11-14");
  assert.equal(plan.children.length, 1);
  assert.equal(plan.children[0].age, 6);
  assert.deepEqual(plan.parents, []);
  assert.equal(optimizePlan(plan).summary.gapDays, 0);
});

// Mon Mar 22 2027 starts the cycle. Mom (A) works Mon-Wed, Dad (B) works Thu-Fri.
const splitHomes = (extra: Partial<FamilyPlan> = {}): FamilyPlan =>
  tiny({
    parents: [
      { id: "mom", name: "Mom", workdays: [1, 2, 3], holidays: [], ptoDays: 5, sickReserve: 0, wfhDays: [] },
      { id: "dad", name: "Dad", workdays: [4, 5], holidays: [], ptoDays: 0, sickReserve: 0, wfhDays: [] },
    ],
    paidCare: [{ id: "sit", name: "Sitter", pricing: "perFamily", pricePerDay: 400, takesSickKids: true, availableInSummer: true }],
    custody: { pattern: "2-2-3", start: "2027-03-22", parentA: "mom", parentB: "dad", firstRefusal: false },
    ...extra,
  });

test("custody cycles map days to the right parent, before and after the anchor", () => {
  const c = { pattern: "2-2-3" as const, start: "2027-03-22", parentA: "a", parentB: "b", firstRefusal: false };
  // Week 1: Mon Tue A, Wed Thu B, Fri A. Week 2: Mon Tue B, Wed Thu A, Fri B.
  const week = ["2027-03-22", "2027-03-23", "2027-03-24", "2027-03-25", "2027-03-26", "2027-03-29", "2027-03-30", "2027-03-31", "2027-04-01", "2027-04-02"];
  assert.deepEqual(week.map((d) => custodianOn(c, d)), ["a", "a", "b", "b", "a", "b", "b", "a", "a", "b"]);
  // Two weeks earlier is the same point in the cycle.
  assert.equal(custodianOn(c, "2027-03-08"), "a");
  assert.equal(custodianOn({ ...c, pattern: "alternatingWeeks" }, "2027-03-15"), "b");
  assert.equal(custodianOn(undefined, "2027-03-22"), null);
});

test("with split custody, a free parent at the other house doesn't cover the day", () => {
  // Together, someone is always home: no gaps.
  assert.equal(gapDays(splitHomes({ custody: undefined })).length, 0);
  // 2-2-3: Mon/Tue with working Mom, Thu with working Dad. Wed (Dad off) and Fri (Mom off) are free.
  assert.deepEqual(gapDays(splitHomes()).map((g) => g.date), ["2027-03-22", "2027-03-23", "2027-03-25"]);
});

test("only the parent who has the kids can spend vacation days on them", () => {
  const plan = optimizePlan(splitHomes());
  const byDate = new Map(plan.days.map((d) => [d.date, d]));
  const src = (date: string) => byDate.get(date)!.covers.map((c) => c.kind + ":" + (c.refId ?? ""));
  assert.ok(src("2027-03-22").includes("pto:mom"));
  assert.ok(src("2027-03-23").includes("pto:mom"));
  // Thursday is Dad's day and he has no PTO left: Mom's PTO can't be used, so it's paid.
  assert.ok(!src("2027-03-25").some((s) => s.startsWith("pto")), "Mom's PTO used on Dad's day");
});

test("right of first refusal lets the off-duty parent take the kids", () => {
  const plan = splitHomes({ custody: { pattern: "2-2-3", start: "2027-03-22", parentA: "mom", parentB: "dad", firstRefusal: true } });
  assert.equal(gapDays(plan).length, 0);
});

test("sanitize drops a custody schedule that names a missing parent", () => {
  const bad = sanitizePlan({ ...splitHomes(), custody: { pattern: "2-2-3", start: "2027-03-22", parentA: "mom", parentB: "ghost", firstRefusal: false } }, "2027-03-22");
  assert.equal(bad.custody, undefined);
  const good = sanitizePlan(splitHomes(), "2027-03-22");
  assert.equal(good.custody?.pattern, "2-2-3");
});

// ---- Two households: holidays, summer, approved changes, cost split ----

const base: Custody = { pattern: "alternatingWeeks", start: "2026-11-02", parentA: "a", parentB: "b", firstRefusal: false };
const school = { closures: [], lastDay: "2027-06-16", nextFirstDay: "2027-08-23" };

test("holidays alternate by year: even years A gets Thanksgiving and Christmas half", () => {
  const h: Custody = { ...base, holidays: "alternate" };
  // Thanksgiving 2026 is Thu Nov 26 (even year -> A), even though the pattern gives that week to B.
  assert.equal(custodianOn(base, "2026-11-26"), "b");
  assert.equal(custodianOn(h, "2026-11-26"), "a");
  assert.equal(custodianOn(h, "2026-11-29"), "a"); // through Sunday
  assert.equal(custodianOn(h, "2026-12-24"), "a"); // first half of winter break, 2026
  assert.equal(custodianOn(h, "2026-12-28"), "b"); // second half
  assert.equal(custodianOn(h, "2027-01-04"), "b"); // still the 2026 break
  assert.equal(custodianOn(h, "2027-11-25"), "b"); // Thanksgiving 2027, odd year
  assert.equal(custodianOn(h, "2027-12-24"), "b");
});

test("summer can switch to week on, week off while the school year uses another pattern", () => {
  const c: Custody = { ...base, pattern: "primaryA", summer: "alternatingWeeks" };
  // Mon Jun 21 2027 is 33 weeks after the anchor: odd week -> B under alternating weeks.
  assert.equal(custodianOn(c, "2027-06-21"), "a"); // without school dates the summer rule can't apply
  assert.equal(custodianOn(c, "2027-06-21", school), "b");
  assert.equal(custodianOn(c, "2027-06-28", school), "a");
  assert.equal(custodianOn(c, "2027-09-01", school), "a"); // back to primaryA on a school weekday
});

test("only approved changes move a day; requester can't approve their own; decisions are final", () => {
  let c = requestChange(base, { id: "r1", date: "2026-11-04", requestedBy: "b", reason: "Grandpa's birthday" }, "2026-11-01T10:00:00Z");
  assert.equal(c.changes![0].toParent, "b");
  assert.equal(custodianOn(c, "2026-11-04"), "a", "pending must not change anything");
  c = decideChange(c, "r1", "b", "approved", "2026-11-01T11:00:00Z");
  assert.equal(c.changes![0].status, "pending", "requester approved their own request");
  c = decideChange(c, "r1", "a", "approved", "2026-11-01T12:00:00Z", "Sure");
  assert.equal(custodianOn(c, "2026-11-04"), "b");
  assert.equal(c.changes![0].decidedAt, "2026-11-01T12:00:00Z");
  assert.equal(c.changes![0].response, "Sure");
  c = decideChange(c, "r1", "a", "declined", "2026-11-02T09:00:00Z");
  assert.equal(c.changes![0].status, "approved", "a decision was flipped");
});

test("a declined request leaves the schedule alone", () => {
  let c = requestChange(base, { id: "r2", date: "2026-11-09", requestedBy: "a", reason: "" }, "t0");
  c = decideChange(c, "r2", "b", "declined", "t1", "I have them that week");
  assert.equal(custodianOn(c, "2026-11-09"), "b");
});

test("approved change shifts who covers a gap day", () => {
  const plan = (custody: Custody): FamilyPlan => ({
    ...tiny({
      parents: [
        { id: "a", name: "Mom", workdays: [1, 2, 3, 4, 5], holidays: [], ptoDays: 0, sickReserve: 0, wfhDays: [] },
        { id: "b", name: "Dad", workdays: [], holidays: [], ptoDays: 0, sickReserve: 0, wfhDays: [] },
      ],
    }),
    custody,
  });
  const c: Custody = { ...base, start: "2027-03-22" }; // spring break week is Mom's
  assert.equal(gapDays(plan(c)).length, 5);
  let moved = requestChange(c, { id: "x", date: "2027-03-24", requestedBy: "b", reason: "I'm free" }, "t0");
  moved = decideChange(moved, "x", "a", "approved", "t1");
  assert.deepEqual(gapDays(plan(moved)).map((g) => g.date), ["2027-03-22", "2027-03-23", "2027-03-25", "2027-03-26"]);
});

test("first refusal: the custodian at home comes first, and the stand-in is labeled", () => {
  const p = tiny({
    parents: [
      { id: "a", name: "Mom", workdays: [], holidays: [], ptoDays: 0, sickReserve: 0, wfhDays: [] },
      { id: "b", name: "Dad", workdays: [1, 2, 3, 4, 5], holidays: [], ptoDays: 3, sickReserve: 0, wfhDays: [] },
    ],
    custody: { ...base, start: "2027-03-22", firstRefusal: true },
  });
  const day = optimizePlan(p).days[0];
  assert.equal(day.covers[0].label, "Mom is off");
  const flipped = optimizePlan({ ...p, parents: [{ ...p.parents[0], workdays: [1, 2, 3, 4, 5] }, { ...p.parents[1], workdays: [] }] }).days[0];
  assert.equal(flipped.covers[0].label, "Dad is off (first refusal)");
});

test("parenting time blocks and day counts add up", () => {
  const p = { ...tiny(), custody: base };
  const blocks = custodyBlocks(p, "2026-11-02", "2026-11-29");
  assert.deepEqual(blocks.map((b) => [b.parentId, b.start, b.days]), [["a", "2026-11-02", 7], ["b", "2026-11-09", 7], ["a", "2026-11-16", 7], ["b", "2026-11-23", 7]]);
  assert.deepEqual(parentingTime(p, "2026-11-02", "2026-11-29"), { a: 14, b: 14 });
});

test("cost split follows Parent A's share and never loses a dollar", () => {
  assert.deepEqual(splitCost({ ...base, costShareA: 60 }, 1001), { a: 601, b: 400 });
  assert.deepEqual(splitCost(base, 100), { a: 50, b: 50 });
});

test("sanitize keeps valid change requests and drops forged ones", () => {
  const p = sanitizePlan(
    {
      ...splitHomes(),
      custody: {
        ...splitHomes().custody!,
        holidays: "alternate",
        costShareA: 250,
        changes: [
          { id: "ok", date: "2027-03-24", toParent: "dad", requestedBy: "dad", reason: "x", status: "approved", createdAt: "t", decidedAt: "t2" },
          { id: "bad", date: "2027-03-24", toParent: "ghost", requestedBy: "dad", reason: "x", status: "approved", createdAt: "t" },
          { id: "weird", date: "not-a-date", toParent: "dad", requestedBy: "mom", reason: "x", status: "approved", createdAt: "t" },
        ],
      },
    } as FamilyPlan,
    "2027-03-22",
  );
  assert.deepEqual(p.custody!.changes!.map((c) => c.id), ["ok"]);
  assert.equal(p.custody!.costShareA, 100);
  assert.equal(p.custody!.holidays, "alternate");
});
