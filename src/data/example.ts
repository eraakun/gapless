import { addDaysISO, dateParts, parseISO, toISO } from "../engine/dates";
import { custodianOn, requestChange } from "../engine/custody";
import { weekStartOf } from "../engine/gaps";
import type { FamilyPlan } from "../engine/types";

function weekdaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = parseISO(from); d <= parseISO(to); d++) {
    const weekday = new Date(d * 86_400_000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) out.push(toISO(d));
  }
  return out;
}

/**
 * Days with no school for students in Fairfax County Public Schools (VA),
 * 2026-27 standard calendar: holidays, breaks, teacher workdays, staff
 * development and school planning days. Compiled from the published FCPS
 * calendar as summarized by publicschoolscalendar.com; verify against
 * fcps.edu/calendars before relying on it.
 */
export const FCPS_2026_27_CLOSURES: string[] = [
  "2026-09-04", "2026-09-07", // Labor Day break
  "2026-10-12", // Indigenous Peoples' Day
  "2026-11-02", "2026-11-03", // Teacher workday, Election Day
  "2026-11-25", "2026-11-26", "2026-11-27", // Thanksgiving break
  ...weekdaysBetween("2026-12-21", "2027-01-01"), // Winter break
  "2027-01-18", // MLK Jr. Day
  "2027-01-29", "2027-02-01", // Teacher workday, staff development day
  "2027-02-15", // Presidents' Day
  ...weekdaysBetween("2027-03-22", "2027-03-26"), // Spring break
  "2027-04-19", "2027-04-20", // Teacher workday, staff development day
  "2027-05-31", // Memorial Day
];

/** US federal holidays from late 2026 through summer 2027 (OPM schedule, observed dates). */
const FEDERAL_HOLIDAYS: string[] = [
  "2026-11-11", "2026-11-26", "2026-12-25", "2027-01-01", "2027-01-18",
  "2027-02-15", "2027-05-31", "2027-06-18", "2027-07-05",
];

/**
 * The Realistic US Example: a two-income family in Fairfax, VA.
 *
 * - Dana, 36, ICU nurse, works three 12-hour shifts (Mon-Wed), so she's
 *   home Thursdays and Fridays. 9 PTO days left, 2 held for sick days.
 * - Marcus, 38, federal analyst, Mon-Fri with federal holidays off and
 *   telework on Mondays and Fridays. 12 days of annual leave left, 2 held back.
 * - Ava (10) can be home while a parent teleworks; Leo (6) can't.
 * - Grandma Linda can help Tuesdays and Wednesdays, up to 12 days.
 *
 * Prices are typical for the area and within published national ranges,
 * not quotes from specific providers. The next school year's start date
 * (Aug 23, 2027) is an assumption.
 */
export function buildExamplePlan(today: string): FamilyPlan {
  // The example's school calendar ends in August 2027; start the plan no later than June.
  const start = today > "2027-06-01" ? "2026-11-14" : today;
  return {
    today: start,
    horizonEnd: "2027-08-20",
    children: [
      { id: "ava", name: "Ava", age: 10, okWithWfhParent: true, activities: [{ name: "swim team", weekdays: [3] }] },
      { id: "leo", name: "Leo", age: 6, okWithWfhParent: false },
    ],
    parents: [
      { id: "dana", name: "Dana", workdays: [1, 2, 3], holidays: [], ptoDays: 9, sickReserve: 2, wfhDays: [] },
      { id: "marcus", name: "Marcus", workdays: [1, 2, 3, 4, 5], holidays: FEDERAL_HOLIDAYS, ptoDays: 12, sickReserve: 2, wfhDays: [1, 5] },
    ],
    helpers: [{ id: "linda", name: "Grandma Linda", weekdays: [2, 3], maxDays: 12, costPerDay: 0, takesSickKids: true }],
    paidCare: [
      { id: "dropin", name: "Rec center drop-in day", pricing: "perChild", pricePerDay: 75, takesSickKids: false, availableInSummer: false },
      { id: "sitter", name: "Babysitter (9 h at $22)", pricing: "perFamily", pricePerDay: 198, takesSickKids: true, availableInSummer: true },
    ],
    camps: [
      { id: "winter", name: "Winter break camp", start: "2026-12-21", end: "2026-12-31", pricePerChildWeek: 245, minAge: 5, maxAge: 12, registerBy: "2026-12-01" },
      { id: "spring", name: "Spring break camp", start: "2027-03-22", end: "2027-03-26", pricePerChildWeek: 260, minAge: 5, maxAge: 12, registerBy: "2027-03-01" },
      { id: "summer", name: "Summer day camp", start: "2027-06-21", end: "2027-08-20", pricePerChildWeek: 295, minAge: 5, maxAge: 12, registerBy: "2027-02-15" },
      { id: "code", name: "Coding camp (ages 9-14)", start: "2027-07-12", end: "2027-08-06", pricePerChildWeek: 420, minAge: 9, maxAge: 14, registerBy: "2027-03-15" },
    ],
    school: { closures: FCPS_2026_27_CLOSURES, lastDay: "2027-06-16", nextFirstDay: "2027-08-23" },
    settings: { ptoDayValue: 150, wfhPenalty: 40 },
    surprises: [],
    bookings: [],
    afterSchool: {
      enabled: true,
      dismissal: "15:00",
      workEnds: "17:30",
      leaveEarlyCost: 40,
      options: [
        { id: "aftercare", name: "School after-care", kind: "program", price: 25, pricing: "perChild", billing: "day" },
        { id: "aftercare-month", name: "After-care, monthly plan", kind: "program", price: 280, pricing: "perChild", billing: "month", weekdays: [1, 2, 3, 4, 5] },
        { id: "pmsitter", name: "Afternoon sitter", kind: "sitter", price: 22, pricing: "perFamily", billing: "hour" },
      ],
    },
  };
}

/**
 * The same family after a divorce: Dana and Marcus live apart on a 2-2-5-5
 * schedule from their parenting plan, with right of first refusal, holidays
 * alternating by year, week-on/week-off summers, and a 60/40 childcare split.
 * Marcus has one pending request so the approval flow is visible.
 */
export function buildCoParentExample(today: string): FamilyPlan {
  const plan = buildExamplePlan(today);
  const start = weekStartOf(plan.today);
  let custody: NonNullable<FamilyPlan["custody"]> = {
    pattern: "2-2-5-5",
    start,
    parentA: "dana",
    parentB: "marcus",
    firstRefusal: true,
    holidays: "alternate",
    summer: "alternatingWeeks",
    changes: [],
    exchange: "At school drop-off; 6 pm at Dana's when school is out",
    midweekVisit: null,
    costShareA: 60,
  };
  // First weekday of Dana's time 8+ days out: Marcus asks for it.
  let ask = addDaysISO(plan.today, 8);
  for (let i = 0; i < 21; i++, ask = addDaysISO(ask, 1)) {
    const wd = dateParts(parseISO(ask)).weekday;
    if (wd >= 1 && wd <= 5 && custodianOn(custody, ask, plan.school) === "dana") break;
  }
  custody = requestChange(custody, { id: "example-ask", date: ask, requestedBy: "marcus", reason: "My parents are visiting from Ohio" }, `${plan.today}T09:15:00`, plan.school);
  return { ...plan, custody };
}
