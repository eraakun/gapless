import { test } from "node:test";
import assert from "node:assert/strict";
import { dateParts, optimizePlan, parseISO, typicalPlan } from "../engine";
import { DISTRICTS } from "./districts";
import { buildQuickPlan } from "./quickStart";
import { buildCoParentExample } from "./example";
import { interpret, applyActions, parseDates, planAfterSchool, buildTasks, draftMessage, messageLink, planB, careNeeds, custodianOn, explainDay, fsaEstimate, gapDays, parentingTime, parseEarlyReleaseIcs, parseSchoolIcs, sanitizePlan, scenarioPlans, tasksToIcs, LEAD_DAYS, FSA_LIMIT_PER_YEAR } from "../engine";
import { buildExamplePlan } from "./example";

test("every district calendar lists unique weekdays inside its school year", () => {
  for (const d of DISTRICTS) {
    const { closures, lastDay, nextFirstDay } = d.calendar;
    assert.equal(new Set(closures).size, closures.length, `${d.id} has duplicate dates`);
    assert.ok(lastDay < nextFirstDay, `${d.id} summer is inverted`);
    for (const c of closures) {
      const wd = dateParts(parseISO(c)).weekday;
      assert.ok(wd >= 1 && wd <= 5, `${d.id} ${c} is a weekend`);
      assert.ok(c >= "2026-08-01" && c <= lastDay, `${d.id} ${c} is outside the school year`);
    }
  }
});

test("district closure counts match the published calendars", () => {
  const count = (id: string) => DISTRICTS.find((d) => d.id === id)!.calendar.closures.length;
  // NYC: 1+1+1+2+7 winter+1+5 midwinter+1+1+7 spring+1+1+1+1 = 31
  assert.equal(count("nyc"), 31);
  // LAUSD: 4 singles + 5 Thanksgiving + 15 winter + 1 + 1 + 5 spring + 1 + 1 = 33
  assert.equal(count("lausd"), 33);
  // CPS: 6 fall singles + 5 Thanksgiving + 10 winter + 4 Jan/Feb singles + 1 + 5 spring + 2 + 1 = 34
  assert.equal(count("cps"), 34);
  // Miami-Dade: 4 fall singles + 5 Thanksgiving + 1 + 10 winter + 3 Jan/Feb singles + 1 + 5 spring + 1 + 1 = 31
  assert.equal(count("mdcps"), 31);
  // Houston: 4 fall singles + 5 Thanksgiving + 10 winter + 3 Jan/Feb singles + 5 spring + 2 = 29 (Memorial Day falls in summer)
  assert.equal(count("hisd"), 29);
});

test("quick start builds a plan the optimizer fully covers and never makes worse", () => {
  for (const d of DISTRICTS) {
    const plan = buildQuickPlan({ districtId: d.id, kidAges: [6, 10], parents: [{ workdays: [1, 2, 3, 4, 5], ptoDays: 10 }, { workdays: [1, 2, 3], ptoDays: 8 }] }, "2026-11-14");
    if (!plan) throw new Error(`no plan for ${d.id}`);
    assert.ok(gapDays(plan).length > 0, `${d.id} should have gap days`);
    const best = optimizePlan(plan);
    const typical = typicalPlan(plan);
    assert.equal(best.summary.uncoveredDays, 0, `${d.id} left days uncovered`);
    assert.ok(best.summary.objective <= typical.summary.objective + 1e-6, `${d.id} optimizer worse than typical`);
  }
});

test("quick start rejects bad input instead of throwing", () => {
  assert.equal(buildQuickPlan({ districtId: "nope", kidAges: [6], parents: [{ workdays: [1], ptoDays: 1 }] }, "2026-11-14"), null);
  assert.equal(buildQuickPlan({ districtId: "nyc", kidAges: [], parents: [{ workdays: [1], ptoDays: 1 }] }, "2026-11-14"), null);
  assert.equal(buildQuickPlan({ districtId: "nyc", kidAges: [40], parents: [{ workdays: [1], ptoDays: 1 }] }, "2026-11-14"), null);
});

test("co-parenting example: fully covered, beats typical, one pending request, real split", () => {
  for (const today of ["2026-11-14", "2027-02-03", "2027-05-20"]) {
    const plan = buildCoParentExample(today);
    const best = optimizePlan(plan);
    assert.equal(best.summary.uncoveredDays, 0, today);
    assert.ok(best.summary.objective <= typicalPlan(plan).summary.objective + 1e-6, today);
    const ask = plan.custody!.changes![0];
    assert.equal(ask.status, "pending");
    assert.equal(custodianOn(plan.custody, ask.date, plan.school), "dana", "pending request must not move the day");
    const t = parentingTime(plan, plan.today, plan.horizonEnd);
    assert.ok(t.dana > 0 && t.marcus > 0);
  }
});

test("reminders: every PTO, helper, paid and camp day in the plan has a task, due with notice", () => {
  const plan = buildExamplePlan("2026-11-14");
  const best = optimizePlan(plan);
  const tasks = buildTasks(plan, best);
  const covered = (kind: string) => new Set(tasks.filter((t) => t.kind === kind).flatMap((t) => t.dates));
  for (const day of best.days) {
    for (const c of day.covers) {
      if (c.kind === "pto" || c.kind === "helper" || c.kind === "paid") assert.ok(covered(c.kind).has(day.date), `${c.kind} ${day.date} has no task`);
    }
  }
  const pto = tasks.filter((t) => t.kind === "pto");
  assert.ok(pto.length > 0);
  for (const t of pto) assert.ok(t.due <= t.dates[0] && t.due < t.dates[0]);
  assert.equal(pto[0].due, addDays(pto[0].dates[0], -LEAD_DAYS.pto));
  // Sorted by due date.
  assert.deepEqual(tasks.map((t) => t.due), [...tasks.map((t) => t.due)].sort());
  // Camp registration is due on the camp's own deadline.
  for (const t of tasks.filter((t) => t.kind === "camp")) {
    const camp = plan.camps.find((c) => t.id === `camp-${c.id}`)!;
    assert.equal(t.due, camp.registerBy);
  }
});

test("reminders: booked camps drop off; co-parent requests show up; ics has one event per task", () => {
  const co = buildCoParentExample("2026-11-14");
  const best = optimizePlan(co);
  const tasks = buildTasks(co, best);
  assert.ok(tasks.some((t) => t.kind === "custody"));
  const ics = tasksToIcs(tasks, new Date("2026-11-14T00:00:00Z"));
  assert.equal(ics.split("BEGIN:VEVENT").length - 1, tasks.length);
  assert.ok(ics.includes("TRIGGER:PT9H"));
  const plan = buildExamplePlan("2026-11-14");
  const b = optimizePlan(plan);
  const booked = { ...plan, bookings: b.campWeeks.map((w) => ({ campId: w.campId, childId: w.childId, weekStart: w.weekStart })) };
  assert.ok(!buildTasks(booked, optimizePlan(booked)).some((t) => t.kind === "camp"));
});

test("what-if scenarios change exactly what they say and still plan cleanly", () => {
  const plan = buildExamplePlan("2026-11-14");
  const sc = scenarioPlans(plan);
  const byId = new Map(sc.map((s) => [s.id, s]));
  assert.deepEqual([...byId.keys()].sort(), ["no-camps", "no-helpers", "pricier", "save-pto", "sick-week"]);
  assert.equal(byId.get("no-helpers")!.plan.helpers.length, 0);
  assert.deepEqual(byId.get("save-pto")!.plan.parents.map((p) => p.ptoDays), [4, 7]);
  assert.equal(byId.get("pricier")!.plan.paidCare[1].pricePerDay, Math.round(198 * 1.2));
  const sick = byId.get("sick-week")!.plan.surprises;
  assert.equal(sick.length, 5);
  assert.ok(sick.every((s) => s.childIds[0] === "leo" && s.date.startsWith("2027-02")));
  for (const s of sc) {
    const r = optimizePlan(s.plan);
    assert.ok(Number.isFinite(r.summary.objective), s.id);
  }
});

test("quick start can add a grandparent and custom prices", () => {
  const plan = buildQuickPlan(
    { districtId: "cps", kidAges: [7], parents: [{ workdays: [1, 2, 3, 4, 5], ptoDays: 5 }], helper: { name: "Nana", weekdays: [2, 4], maxDays: 10 }, sitterPerDay: 150, summerCampPerWeek: 250 },
    "2026-11-14",
  );
  if (!plan) throw new Error("no plan");
  assert.equal(plan.helpers[0].name, "Nana");
  assert.equal(plan.paidCare[0].pricePerDay, 150);
  assert.equal(plan.camps[0].pricePerChildWeek, 250);
  assert.ok(optimizePlan(plan).summary.helperDays["helper-1"] > 0);
});

test("checked-off reminders survive sanitize", () => {
  const p = sanitizePlan({ ...buildExamplePlan("2026-11-14"), doneTasks: ["a", "a", "b"] }, "2026-11-14");
  assert.deepEqual(p.doneTasks, ["a", "b"]);
});

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

test("quick start parents get the usual employer holidays, so no vacation is spent on Christmas", () => {
  const plan = buildQuickPlan({ districtId: "cps", kidAges: [6, 10], parents: [{ workdays: [1, 2, 3, 4, 5], ptoDays: 10 }, { workdays: [1, 2, 3, 4, 5], ptoDays: 10 }] }, "2026-11-14");
  if (!plan) throw new Error("no plan");
  const best = optimizePlan(plan);
  const xmas = best.days.find((d) => d.date === "2026-12-25");
  assert.ok(!xmas || xmas.covers.every((c) => c.kind === "parentOff"), "Christmas should be a parent's day off");
});

// ---- Closing the known gaps ----

test("each kid follows their own school's calendar", () => {
  const plan = buildExamplePlan("2026-11-14");
  const nyc = DISTRICTS.find((d) => d.id === "nyc")!;
  const split = { ...plan, otherSchools: [{ id: "ms", name: "Middle school", calendar: nyc.calendar }], children: plan.children.map((c) => (c.id === "ava" ? { ...c, schoolId: "ms" } : c)) };
  const needs = new Map(careNeeds(split).map((g) => [g.date, g.childIds]));
  const all = new Map(careNeeds(plan).map((g) => [g.date, g.childIds]));
  // Feb 17, 2027 is NYC midwinter recess but a school day in Fairfax: only Ava (NYC calendar) needs care.
  assert.ok(!all.has("2027-02-17"));
  assert.deepEqual(needs.get("2027-02-17"), ["ava"]);
  // Jan 29, 2027 is an FCPS teacher workday: Leo (FCPS) needs care, Ava (NYC) is in school.
  assert.deepEqual(all.get("2027-01-29"), ["ava", "leo"]);
  assert.deepEqual(needs.get("2027-01-29"), ["leo"]);
  // Summer: NYC runs to Jun 28, Fairfax to Jun 16, so Jun 21 is summer for Leo only.
  assert.deepEqual(needs.get("2027-06-21"), ["leo"]);
  assert.equal(optimizePlan(split).summary.uncoveredDays, 0);
});

test("a kid pointing at a deleted school falls back to the main calendar", () => {
  const plan = sanitizePlan({ ...buildExamplePlan("2026-11-14"), children: [{ id: "k", name: "K", age: 8, okWithWfhParent: false, schoolId: "gone" }] }, "2026-11-14");
  assert.equal(plan.children[0].schoolId, undefined);
});

test("early-release days are read from .ics and become pickup reminders, not full-day gaps", () => {
  const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20261125", "SUMMARY:Early Release - 2 hours", "END:VEVENT", "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20261126", "DTEND;VALUE=DATE:20261128", "SUMMARY:Thanksgiving Break - No School", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  assert.deepEqual(parseEarlyReleaseIcs(ics).map((e) => e.date), ["2026-11-25"]);
  assert.deepEqual(parseSchoolIcs(ics).map((e) => e.date), ["2026-11-26", "2026-11-27"]);
  const plan = buildExamplePlan("2026-11-14");
  const withEarly = { ...plan, school: { ...plan.school, earlyRelease: ["2026-12-04"] } };
  const best = optimizePlan(withEarly);
  assert.ok(!best.days.some((d) => d.date === "2026-12-04"), "an early-release day is not a full-day gap");
  const pickup = buildTasks(withEarly, best).find((t) => t.kind === "pickup")!;
  assert.equal(pickup.dates[0], "2026-12-04");
  assert.equal(pickup.due, "2026-11-27");
});

test("a helper tied to one home only covers that parent's custody days", () => {
  const co = buildCoParentExample("2026-11-14");
  const tied = { ...co, helpers: co.helpers.map((h) => ({ ...h, home: "dana" })) };
  const best = optimizePlan(tied);
  for (const d of best.days) {
    if (d.covers.some((c) => c.kind === "helper")) assert.equal(custodianOn(tied.custody, d.date, tied.school), "dana", d.date);
  }
});

test("every planned day has a reason, and vacation-day reasons quote the real alternative", () => {
  const plan = buildExamplePlan("2026-11-14");
  const best = optimizePlan(plan);
  for (const d of best.days) {
    const why = explainDay(plan, d);
    assert.equal(why.length, d.covers.length);
    for (const w of why) assert.ok(w.length > 20);
  }
  const ptoDay = best.days.find((d) => d.covers.some((c) => c.kind === "pto"))!;
  assert.match(explainDay(plan, ptoDay).join(" "), /\$150/);
});

test("FSA estimate: eligible cash per calendar year, capped at the limit, times the tax rate", () => {
  const plan = { ...buildExamplePlan("2026-11-14"), settings: { ptoDayValue: 150, wfhPenalty: 40, fsaEnabled: true, taxRate: 30 } };
  const best = optimizePlan(plan);
  const est = fsaEstimate(plan, best);
  assert.equal(est.eligible, best.summary.cash);
  assert.equal(est.savings, Math.round(est.covered * 0.3));
  // A big summer bill gets capped per year.
  const pricey = { ...plan, camps: [], paidCare: plan.paidCare.map((c) => ({ ...c, pricePerDay: 900 })) };
  const e2 = fsaEstimate(pricey, optimizePlan(pricey));
  for (const y of e2.byYear) assert.ok(y.covered <= FSA_LIMIT_PER_YEAR);
});

test("every task that needs a person gets a ready message with the right dates and names", () => {
  const plan = buildExamplePlan("2026-11-14");
  const best = optimizePlan(plan);
  const tasks = buildTasks(plan, best);
  for (const t of tasks) {
    const m = draftMessage(plan, t);
    if (t.kind === "custody") { assert.equal(m, null); continue; }
    assert.ok(m, t.id);
    assert.ok(m!.body.length > 40);
    const link = messageLink(m!);
    assert.ok(link.startsWith(m!.channel === "email" ? "mailto:" : "sms:"));
    assert.ok(!/undefined|NaN/.test(m!.body + (m!.subject ?? "")), m!.body);
  }
  const pto = tasks.find((t) => t.kind === "pto")!;
  const email = draftMessage(plan, pto)!;
  const parentName = plan.parents.find((p) => p.id === pto.ref)!.name;
  assert.equal(email.channel, "email");
  assert.ok(email.body.endsWith(parentName));
  assert.ok(email.subject!.startsWith("Time off request"));
  const grandma = draftMessage(plan, tasks.find((t) => t.kind === "helper")!)!;
  assert.match(grandma.body, /Grandma Linda/);
  assert.match(grandma.body, /Ava|Leo/);
});

test("plan B: every non-free day names a different backup option", () => {
  const plan = buildExamplePlan("2026-11-14");
  const best = optimizePlan(plan);
  for (const d of best.days) {
    for (const c of d.covers) {
      const b = planB(plan, d, c);
      if (c.kind === "parentOff") { assert.equal(b, null); continue; }
      assert.ok(b && b.length > 10, d.date);
      if (c.kind === "helper") assert.ok(!b!.includes("Grandma Linda"), "backup can't be the same helper");
    }
  }
});

// ---- After school: every school day ----

test("after school: every school day gets the cheapest available pickup", () => {
  const plan = buildExamplePlan("2026-11-14");
  const r = planAfterSchool(plan)!;
  assert.equal(r.uncovered, 0);
  // No afternoons on closures, weekends or in summer.
  const closures = new Set(plan.school.closures);
  for (const d of r.days) {
    assert.ok(!closures.has(d.date), d.date);
    assert.ok(d.date <= plan.school.lastDay, d.date);
    const wd = new Date(d.date + "T00:00:00Z").getUTCDay();
    assert.ok(wd >= 1 && wd <= 5);
  }
  // Dana is off Thursdays and Fridays; Grandma does Tue/Wed; Mondays need after-care for both kids.
  assert.deepEqual(r.week.map((w) => w.kind), ["program", "helper", "helper", "parent", "parent"]);
  assert.equal(r.week[0].cost, 50);
  assert.equal(r.total, r.days.reduce((s, d) => s + d.cost, 0));
  assert.ok(r.total < r.usualWay);
});

test("after school: sick kids and snow days drop out; a blocked helper and leaving early change the pick", () => {
  const plan = buildExamplePlan("2026-11-14");
  const tue = "2026-11-17";
  const base = planAfterSchool(plan)!.days.find((d) => d.date === tue)!;
  assert.equal(base.kind, "helper");
  const blocked = { ...plan, helpers: plan.helpers.map((h) => ({ ...h, unavailable: [tue] })) };
  assert.equal(planAfterSchool(blocked)!.days.find((d) => d.date === tue)!.kind, "program");
  const early = { ...blocked, parents: plan.parents.map((p) => (p.id === "marcus" ? { ...p, pickupDays: [2] } : p)) };
  assert.equal(planAfterSchool(early)!.days.find((d) => d.date === tue)!.kind, "leaveEarly");
  const sick = { ...plan, surprises: [{ date: tue, reason: "sick" as const, childIds: ["leo"] }] };
  assert.deepEqual(planAfterSchool(sick)!.days.find((d) => d.date === tue)!.childIds, ["ava"]);
  const snow = { ...plan, surprises: [{ date: tue, reason: "snow" as const, childIds: ["ava", "leo"] }] };
  assert.ok(!planAfterSchool(snow)!.days.some((d) => d.date === tue));
});

test("a helper's unavailable dates also apply to full no-school days", () => {
  const plan = buildExamplePlan("2026-11-14");
  const all = optimizePlan(plan).days.filter((d) => d.covers.some((c) => c.kind === "helper")).map((d) => d.date);
  assert.ok(all.length > 0);
  const off = { ...plan, helpers: plan.helpers.map((h) => ({ ...h, unavailable: all })) };
  assert.ok(!optimizePlan(off).days.some((d) => all.includes(d.date) && d.covers.some((c) => c.kind === "helper")));
});

// ---- Assistant ----

test("assistant: dates in plain English, relative to today", () => {
  const today = "2026-11-16"; // a Monday
  const end = "2027-08-20";
  assert.deepEqual(parseDates("tomorrow", today, end), ["2026-11-17"]);
  assert.deepEqual(parseDates("on Friday", today, end), ["2026-11-20"]);
  assert.deepEqual(parseDates("Dec 21-23", today, end), ["2026-12-21", "2026-12-22", "2026-12-23"]);
  assert.deepEqual(parseDates("1/4", today, end), ["2027-01-04"]);
  assert.equal(parseDates("in December", today, end).length, 23);
  assert.equal(parseDates("next week", today, end).length, 5);
  assert.deepEqual(parseDates("Grandma may come later", today, end), [], "'may' the verb is not a month");
});

test("assistant: changes are proposed, then applied, and the optimizer respects them", () => {
  const plan = buildExamplePlan("2026-11-16");
  const sick = interpret(plan, "Leo is sick tomorrow");
  assert.deepEqual(sick.actions, [{ type: "sick", childIds: ["leo"], dates: ["2026-11-17"] }]);
  const after = applyActions(plan, sick.actions);
  assert.ok(optimizePlan(after).days.some((d) => d.date === "2026-11-17"));

  const off = interpret(plan, "Grandma can't help in December");
  assert.equal(off.actions[0].type, "helperOff");
  const blocked = applyActions(plan, off.actions);
  assert.ok(!optimizePlan(blocked).days.some((d) => d.date.startsWith("2026-12") && d.covers.some((c) => c.kind === "helper")));

  assert.deepEqual(interpret(plan, "Dana has 5 vacation days left").actions, [{ type: "pto", parentId: "dana", days: 5 }]);
  assert.deepEqual(interpret(plan, "the babysitter costs $25 an hour").actions, [
    { type: "price", paidCareId: "sitter", pricePerDay: 225 },
    { type: "afterSchoolPrice", optionId: "pmsitter", price: 25 },
  ]);
  const pick = applyActions(plan, interpret(plan, "Marcus can pick up on Mondays").actions);
  assert.deepEqual(pick.parents.find((p) => p.id === "marcus")!.pickupDays, [1]);
  assert.equal(planAfterSchool(pick)!.week[0].kind, "leaveEarly");
});

test("assistant: questions answer from the engine and never change the plan", () => {
  const plan = buildExamplePlan("2026-11-16");
  const best = optimizePlan(plan);
  for (const q of ["What if Grandma can't help?", "How much will this cost?", "Who has the kids on Dec 22?", "Why Dec 22?", "What should I do next?", "How can we save money?", "help", "asdf qwerty"]) {
    const r = interpret(plan, q, best);
    assert.deepEqual(r.actions, [], q);
    assert.ok(r.text.length > 10, q);
  }
  assert.match(interpret(plan, "How much will this cost?", best).text, /\$1,840/);
  assert.match(interpret(plan, "What if Grandma can't help?", best).text, /\+\$1,770/);
});

test("after school: hourly sitters cost more on early-release days", () => {
  const plan = buildExamplePlan("2026-11-16");
  const day = "2026-12-01"; // a Tuesday school day
  const sitterOnly = {
    ...plan,
    helpers: [],
    school: { ...plan.school, earlyRelease: [day] },
    afterSchool: { ...plan.afterSchool!, options: plan.afterSchool!.options.filter((o) => o.id === "pmsitter") },
  };
  const r = planAfterSchool(sitterOnly)!;
  const normal = r.days.find((d) => d.date === "2026-12-02")!; // Wed: Ava at swim team, Leo needs the sitter
  const early = r.days.find((d) => d.date === day)!;
  assert.equal(normal.hours, 2.5);
  assert.equal(normal.cost, 55);
  assert.equal(early.hours, 4.5);
  assert.equal(early.cost, 99);
  assert.ok(early.early);
});

test("after school: home-alone kids and activities drop out of pickups", () => {
  const plan = buildExamplePlan("2026-11-16");
  const wed = "2026-12-02";
  const r = planAfterSchool(plan)!;
  const w = r.days.find((d) => d.date === wed)!;
  assert.deepEqual(w.childIds, ["leo"]);
  assert.ok(w.notes.some((n) => n.includes("swim team")));
  const teen = { ...plan, children: plan.children.map((c) => ({ ...c, homeAloneAfterSchool: true })) };
  const mon = planAfterSchool(teen)!.days.find((d) => d.date === "2026-11-30")!;
  assert.equal(mon.kind, "self");
  assert.equal(mon.cost, 0);
  assert.equal(planAfterSchool(teen)!.total, 0);
});

test("after school: a monthly plan is taken only in months where it beats drop-in", () => {
  const plan = buildExamplePlan("2026-11-16");
  const base = planAfterSchool(plan)!;
  assert.ok(base.monthly.length > 0 && base.monthly.every((m) => !m.enrolled));
  // No grandma, no Dana at home: every afternoon is paid, so $280/kid a month wins.
  const busy = {
    ...plan,
    helpers: [],
    parents: plan.parents.map((p) => ({ ...p, workdays: [1, 2, 3, 4, 5], wfhDays: [] })),
  };
  const r = planAfterSchool(busy)!;
  const jan = r.monthly.find((m) => m.month === "2027-01")!;
  assert.ok(jan.enrolled);
  assert.ok(jan.fee < jan.dropIn);
  const janDays = r.days.filter((d) => d.date.startsWith("2027-01"));
  assert.ok(janDays.every((d) => d.kind === "monthly"));
  assert.equal(janDays.reduce((s, d) => s + d.cost, 0), jan.fee);
  assert.ok(r.total < planAfterSchool({ ...busy, afterSchool: { ...busy.afterSchool!, options: busy.afterSchool!.options.filter((o) => o.billing !== "month") } })!.total);
});

test("after school: a carpool is used only when your payback days are cheap", () => {
  const plan = buildExamplePlan("2026-11-16");
  const carpool = { id: "cp", name: "Carpool with the Parks", kind: "carpool" as const, price: 0, pricing: "perFamily" as const, weekdays: [1], payback: [4] };
  const withPool = { ...plan, afterSchool: { ...plan.afterSchool!, options: [...plan.afterSchool!.options, carpool] } };
  const r = planAfterSchool(withPool)!;
  // They take Mondays (after-care $50), Dana is home Thursdays: worth it.
  assert.ok(r.carpools.some((c) => c.used && c.saved === 50));
  assert.equal(r.days.find((d) => d.date === "2026-11-30")!.kind, "carpool");
  assert.ok(r.days.find((d) => d.date === "2026-12-03")!.payback);
  assert.ok(r.total < planAfterSchool(plan)!.total);
  // Payback on Tuesdays, when no parent is free: never used.
  const bad = { ...withPool, afterSchool: { ...withPool.afterSchool, options: [...plan.afterSchool!.options, { ...carpool, payback: [2] }] } };
  assert.ok(planAfterSchool(bad)!.carpools.every((c) => !c.used));
});

test("sanitize keeps after-school billing, carpools, activities and home-alone", () => {
  const plan = buildExamplePlan("2026-11-16");
  const raw = JSON.parse(
    JSON.stringify({
      ...plan,
      children: plan.children.map((c) => ({ ...c, homeAloneAfterSchool: true, activities: [{ name: "Chess", weekdays: [4, 4, 2], until: "16:30" }, { name: "Bad", weekdays: [9] }, { name: "Old save", weekday: 1 }] })),
      afterSchool: {
        ...plan.afterSchool,
        earlyReleaseExtraHours: 3,
        options: [...plan.afterSchool!.options, { id: "cp", name: "Pool", kind: "carpool", price: 0, pricing: "perFamily", weekdays: [1, 1, 7], payback: [4] }],
      },
    }),
  );
  const s = sanitizePlan(raw);
  assert.ok(s);
  assert.equal(s!.children[0].homeAloneAfterSchool, true);
  assert.deepEqual(s!.children[0].activities, [{ name: "Chess", weekdays: [2, 4], until: "16:30" }, { name: "Old save", weekdays: [1] }]);
  assert.equal(s!.afterSchool!.earlyReleaseExtraHours, 3);
  const cp = s!.afterSchool!.options.find((o) => o.id === "cp")!;
  assert.deepEqual(cp.weekdays, [1]);
  assert.deepEqual(cp.payback, [4]);
  assert.equal(s!.afterSchool!.options.find((o) => o.id === "pmsitter")!.billing, "hour");
});

test("assistant: after-school phrasings become the right changes", () => {
  const plan = buildExamplePlan("2026-11-16");
  const act = (q: string) => interpret(plan, q).actions;
  assert.deepEqual(act("Ava has soccer on Tuesdays"), [{ type: "activity", childId: "ava", name: "soccer", weekdays: [2] }]);
  assert.deepEqual(act("Carpool: the Parks drive Mondays, we drive Thursdays"), [{ type: "carpool", name: "Carpool with the Parks", theyDrive: [1], weDrive: [4] }]);
  assert.deepEqual(act("School ends at 2:45"), [{ type: "times", dismissal: "14:45" }]);
  assert.deepEqual(act("I get off work at 6pm"), [{ type: "times", workEnds: "18:00" }]);
  assert.deepEqual(act("Ava can walk home after school"), [{ type: "homeAlone", childId: "ava", value: true }]);
  assert.equal(act("Leo has strep tomorrow")[0].type, "sick");
  assert.equal(act("Grandma is sick this week")[0].type, "helperOff");
  assert.equal(act("Early release on Friday")[0].type, "earlyRelease");
  assert.deepEqual(act("After-care is $300 a month"), [{ type: "afterSchoolPrice", optionId: "aftercare-month", price: 300 }]);
  // Applied, they change the afternoon plan the way they say.
  const next = applyActions(plan, [...act("Ava can walk home after school"), ...act("Carpool: the Parks drive Mondays, we drive Thursdays")]);
  assert.equal(next.children.find((c) => c.id === "ava")!.homeAloneAfterSchool, true);
  assert.ok(next.afterSchool!.options.some((o) => o.kind === "carpool" && o.payback?.[0] === 4));
  assert.ok(planAfterSchool(next)!.total < planAfterSchool(plan)!.total);
  // Questions still never change anything.
  assert.deepEqual(act("Who has the kids on Friday?"), []);
});

test("activities: several days a week, and an end time shortens the pickup", () => {
  const plan = buildExamplePlan("2026-11-16");
  const sitterOnly = {
    ...plan,
    helpers: [],
    parents: plan.parents.map((p) => ({ ...p, workdays: [1, 2, 3, 4, 5], wfhDays: [] })),
    afterSchool: { ...plan.afterSchool!, options: plan.afterSchool!.options.filter((o) => o.id === "pmsitter") },
    children: plan.children.map((c) => ({ ...c, activities: [{ name: "Soccer", weekdays: [2, 4], until: "16:30" }] })),
  };
  const r = planAfterSchool(sitterOnly)!;
  const tue = r.days.find((d) => d.date === "2026-11-17")!;
  const thu = r.days.find((d) => d.date === "2026-11-19")!;
  const mon = r.days.find((d) => d.date === "2026-11-16")!;
  // Both kids at soccer until 4:30: the sitter covers 4:30-5:30 only.
  assert.equal(tue.hours, 1);
  assert.equal(tue.cost, 22);
  assert.equal(thu.hours, 1);
  assert.equal(mon.hours, 2.5);
  assert.ok(tue.notes[0].includes("until 4:30"));
  // No end time: runs until work ends, no pickup at all.
  const allAfternoon = { ...sitterOnly, children: sitterOnly.children.map((c) => ({ ...c, activities: [{ name: "Soccer", weekdays: [2, 4] }] })) };
  assert.equal(planAfterSchool(allAfternoon)!.days.find((d) => d.date === "2026-11-17")!.kind, "self");
  // The assistant reads days and the end time, and merges repeats.
  const a = interpret(plan, "Leo has soccer on Tuesdays and Thursdays until 4:30").actions;
  assert.deepEqual(a, [{ type: "activity", childId: "leo", name: "soccer", weekdays: [2, 4], until: "16:30" }]);
  const once = applyActions(plan, interpret(plan, "Leo has soccer on Mondays").actions);
  const twice = applyActions(once, a);
  assert.deepEqual(twice.children.find((c) => c.id === "leo")!.activities, [{ name: "soccer", weekdays: [1, 2, 4], until: "16:30" }]);
});
