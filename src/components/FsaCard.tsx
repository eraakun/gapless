import { fsaEstimate, FSA_LIMIT_PER_YEAR, type CoveragePlan, type FamilyPlan } from "../engine";
import { usd } from "../lib/format";

/**
 * Tax savings on top of the plan: sitters, drop-in days and day camps paid
 * through a Dependent Care FSA cost less after tax. Off until the family says
 * an employer offers one.
 */
export function FsaCard({ plan, coverage, onChange }: { plan: FamilyPlan; coverage: CoveragePlan; onChange: (plan: FamilyPlan) => void }) {
  const on = Boolean(plan.settings.fsaEnabled);
  const est = fsaEstimate(plan, coverage);
  if (coverage.summary.cash <= 0) return null;

  if (!on) {
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-3xl border-2 border-b-4 border-emerald-500 bg-emerald-50 p-5">
        <span aria-hidden className="text-3xl">💸</span>
        <p className="min-w-0 flex-1 text-sm font-bold text-emerald-950">
          Does an employer offer a Dependent Care FSA? Your {usd(coverage.summary.cash)} of sitters and camps could be paid before tax. That's often 25–35% off.
        </p>
        <button
          type="button"
          onClick={() => onChange({ ...plan, settings: { ...plan.settings, fsaEnabled: true, taxRate: plan.settings.taxRate ?? 30 } })}
          className="rounded-2xl bg-teal-700 px-4 py-2.5 text-sm font-extrabold text-white"
        >
          Yes, show my savings
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border-2 border-b-4 border-emerald-500 bg-emerald-50 p-5">
      <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-xl font-bold text-emerald-950">
        <span aria-hidden>💸</span> About {usd(est.savings)} back in taxes
      </p>
      <p className="mt-1 text-sm text-emerald-950">
        Pay {usd(est.covered)} of this plan's sitters, drop-in days and day camps through a Dependent Care FSA, at your {est.taxRate}% tax rate.
        {est.covered < est.eligible && ` ${usd(est.eligible - est.covered)} is over the ${usd(FSA_LIMIT_PER_YEAR)} yearly limit.`}
      </p>
      <p className="mt-2 text-xs text-emerald-900/80">
        {est.byYear.map((y) => `${y.year}: ${usd(y.covered)}`).join(" · ")}. Limit {usd(FSA_LIMIT_PER_YEAR)} per household per year (2026). Overnight camps don't qualify. An
        estimate, not tax advice. Change the rate in Values.
      </p>
    </section>
  );
}
