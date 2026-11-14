import type { CoveragePlan, FamilyPlan } from "./types";

/**
 * Dependent Care FSA: pre-tax dollars for care that lets parents work.
 * The 2026 limit is $7,500 per household per year (One Big Beautiful Bill Act).
 * Day camps, sitters and drop-in programs qualify; overnight camps don't.
 * Paying a relative can qualify too unless they're your dependent.
 */
export const FSA_LIMIT_PER_YEAR = 7500;

export interface FsaEstimate {
  /** Eligible spending in the plan, per calendar year. */
  byYear: Array<{ year: string; eligible: number; covered: number }>;
  eligible: number;
  /** Eligible spending that fits under the yearly limits. */
  covered: number;
  /** covered × tax rate. */
  savings: number;
  taxRate: number;
}

/** Estimate the tax saved by paying the plan's care costs through a Dependent Care FSA. */
export function fsaEstimate(plan: FamilyPlan, coverage: CoveragePlan): FsaEstimate {
  const byYear = new Map<string, number>();
  const add = (date: string, amount: number) => byYear.set(date.slice(0, 4), (byYear.get(date.slice(0, 4)) ?? 0) + amount);
  for (const day of coverage.days) for (const c of day.covers) if (c.cash > 0) add(day.date, c.cash);
  for (const w of coverage.campWeeks) add(w.weekStart, w.price);

  const taxRate = Math.min(60, Math.max(0, plan.settings.taxRate ?? 30));
  const rows = [...byYear.entries()].sort().map(([year, eligible]) => ({ year, eligible, covered: Math.min(eligible, FSA_LIMIT_PER_YEAR) }));
  const eligible = rows.reduce((s, r) => s + r.eligible, 0);
  const covered = rows.reduce((s, r) => s + r.covered, 0);
  return { byYear: rows, eligible, covered, savings: Math.round((covered * taxRate) / 100), taxRate };
}
