import { addDaysISO, sanitizePlan, type FamilyPlan } from "../engine";
import { findDistrict } from "./districts";

export interface QuickStartInput {
  districtId: string;
  /** Ages of the kids, e.g. [6, 10]. */
  kidAges: number[];
  /** One entry per working parent: weekdays they work (0=Sun) and vacation days left. */
  parents: Array<{ workdays: number[]; ptoDays: number }>;
  /** A grandparent or friend who can help on these weekdays, up to `maxDays`. */
  helper?: { name: string; weekdays: number[]; maxDays: number } | null;
  sitterPerDay?: number;
  summerCampPerWeek?: number;
}

/**
 * Paid holidays most US private employers give (observed dates, 2026-27):
 * Thanksgiving and the day after, Christmas, New Year's Day, Memorial Day, July 4th.
 * Editable per parent afterwards under "Employer holidays".
 */
export const COMMON_EMPLOYER_HOLIDAYS = ["2026-11-26", "2026-11-27", "2026-12-25", "2027-01-01", "2027-05-31", "2027-07-05"];

/** Starting prices the user is told to replace with their own. */
export const QUICK_DEFAULTS = { sitterPerDay: 180, summerCampPerWeek: 300 };

/**
 * Turn three answers (district, kids, parents) into a full plan the optimizer can run.
 * Everything it fills in is editable in the setup panel afterwards.
 */
export function buildQuickPlan(input: QuickStartInput, today: string): FamilyPlan | null {
  const district = findDistrict(input.districtId);
  if (!district || input.kidAges.length === 0 || input.parents.length === 0) return null;
  const { calendar } = district;
  const summerStart = addDaysISO(calendar.lastDay, 1);
  const summerEnd = addDaysISO(calendar.nextFirstDay, -1);
  const ages = input.kidAges.filter((a) => Number.isFinite(a) && a >= 3 && a <= 17);
  if (ages.length === 0) return null;
  const minAge = Math.min(...ages);
  const maxAge = Math.max(...ages);

  return sanitizePlan(
    {
      today,
      horizonEnd: summerEnd,
      children: ages.map((age, i) => ({ id: `kid-${i + 1}`, name: `Child ${i + 1}`, age, okWithWfhParent: age >= 10 })),
      parents: input.parents.map((p, i) => ({
        id: `parent-${i + 1}`,
        name: `Parent ${i + 1}`,
        workdays: p.workdays,
        holidays: [...COMMON_EMPLOYER_HOLIDAYS],
        ptoDays: Math.max(0, Math.round(p.ptoDays)),
        sickReserve: Math.min(2, Math.max(0, Math.round(p.ptoDays))),
        wfhDays: [],
      })),
      helpers:
        input.helper && input.helper.weekdays.length > 0 && input.helper.maxDays > 0
          ? [{ id: "helper-1", name: input.helper.name.trim() || "Grandparent", weekdays: input.helper.weekdays, maxDays: Math.round(input.helper.maxDays), costPerDay: 0, takesSickKids: true }]
          : [],
      paidCare: [
        { id: "sitter", name: "Babysitter", pricing: "perFamily", pricePerDay: Math.max(0, input.sitterPerDay ?? QUICK_DEFAULTS.sitterPerDay), takesSickKids: true, availableInSummer: true },
      ],
      camps: [
        {
          id: "summer",
          name: "Summer day camp",
          start: summerStart,
          end: summerEnd,
          pricePerChildWeek: Math.max(0, input.summerCampPerWeek ?? QUICK_DEFAULTS.summerCampPerWeek),
          minAge: Math.min(minAge, 5),
          maxAge: Math.max(maxAge, 12),
        },
      ],
      school: { ...calendar, closures: [...calendar.closures] },
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
    },
    today,
  );
}
