import type { CoveragePlan } from "../engine";
import { usd } from "../lib/format";

/**
 * 83 weekdays without school, one cell each. The first 16 are the time off a
 * typical worker gets; the other 67 are gaps, and they fill in one by one.
 */
export function HeroGrid() {
  const cells = Array.from({ length: 83 }, (_, i) => i);
  return (
    <figure className="mt-6">
      <div className="hero-grid" aria-hidden>
        {cells.map((i) =>
          i < 16 ? (
            <span key={i} className="hero-cell bg-white" />
          ) : (
            <span key={i} className="hero-cell relative border-2 border-dashed border-white/40">
              <span className="gap-fill absolute -inset-[2px] rounded-full bg-amber-400" style={{ animationDelay: `${600 + (i - 16) * 22}ms` }} />
            </span>
          ),
        )}
      </div>
      <figcaption className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-white">
          <span className="h-3.5 w-3.5 rounded-full bg-white" /> 16 days off a typical job gives you
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-3 py-1.5 text-slate-900">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-900 bg-amber-300" /> 67 days somebody still has to cover
        </span>
      </figcaption>
    </figure>
  );
}

/** Always-visible totals under the header, so every edit in the panel shows its effect. */
export function ResultBar({ best, typical, afterSchoolPerMonth = null }: { best: CoveragePlan; typical: CoveragePlan; afterSchoolPerMonth?: number | null }) {
  const s = best.summary;
  const pto = Object.values(s.ptoUsed).reduce((a, b) => a + b, 0) + Object.values(s.reserveUsed).reduce((a, b) => a + b, 0);
  const saved = Math.round(typical.summary.objective - s.objective);
  const items: Array<[string, string, string]> = [
    ["📅", String(s.gapDays), "days to cover"],
    ["💵", usd(s.cash), "cash"],
    ["🏖️", String(pto), "vacation days"],
    ["🎉", saved > 0 ? usd(saved) : "—", "better than the usual way"],
    ...(afterSchoolPerMonth !== null ? [["🎒", usd(afterSchoolPerMonth), "a month after school"] as [string, string, string]] : []),
  ];
  return (
    <div className="bg-teal-700 text-white" aria-live="polite">
      <dl className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2">
        {items.map(([emoji, value, label]) => (
          <div key={label} className="flex items-center gap-1.5 rounded-full bg-white/15 py-1 pr-3 pl-1.5">
            <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm">{emoji}</span>
            <dd className="font-[family-name:var(--font-display)] text-lg font-bold leading-none tabular-nums">{value}</dd>
            <dt className="text-xs font-semibold text-teal-100">{label}</dt>
          </div>
        ))}
        {s.uncoveredDays > 0 ? (
          <div className="ml-auto rounded-full bg-red-600 px-3 py-1 text-sm font-bold">⚠️ {s.uncoveredDays} days with nobody</div>
        ) : (
          <div className="ml-auto rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-slate-900">✅ Every day covered</div>
        )}
      </dl>
    </div>
  );
}
