import { useMemo, useState } from "react";
import { optimizePlan, scenarioPlans, type CoveragePlan, type FamilyPlan } from "../engine";
import { usd } from "../lib/format";
import { Card } from "./ui";

const ptoOf = (c: CoveragePlan) => Object.values(c.summary.ptoUsed).reduce((a, b) => a + b, 0) + Object.values(c.summary.reserveUsed).reduce((a, b) => a + b, 0);

/**
 * "What if" scenarios, each re-planned by the same optimizer, side by side with
 * the current plan: how much more cash, how many vacation days, any day left uncovered.
 */
export function WhatIfCard({ plan, current }: { plan: FamilyPlan; current: CoveragePlan }) {
  const [open, setOpen] = useState(false);
  const results = useMemo(
    () => (open ? scenarioPlans(plan).map((s) => ({ ...s, result: optimizePlan(s.plan) })) : []),
    [open, plan],
  );
  const baseCash = current.summary.cash;
  const basePto = ptoOf(current);

  const delta = (n: number, unit: (n: number) => string) =>
    n === 0 ? <span className="text-slate-400">same</span> : <span className={n > 0 ? "text-red-700" : "text-emerald-900"}>{n > 0 ? "+" : "−"}{unit(Math.abs(n))}</span>;

  return (
    <Card title={<span className="flex items-center gap-2"><span aria-hidden>🔮</span> What if…</span>}>
      {!open ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-slate-600">See what happens to your plan if Grandma can't help, you save vacation for a trip, prices go up, or a kid gets sick for a week.</p>
          <button type="button" onClick={() => setOpen(true)} className="rounded-2xl bg-teal-700 px-4 py-2.5 text-sm font-extrabold text-white">
            Compare scenarios
          </button>
        </div>
      ) : (
        <>
        <p className="mb-3 text-sm text-slate-600">
          Total cost = cash + each vacation day at your {usd(plan.settings.ptoDayValue)}. When care gets pricier, the plan may spend vacation days instead, so cash can go
          down while the total goes up.
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          <li className="rounded-2xl border-2 border-b-4 border-teal-600 bg-teal-50 p-4">
            <p className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">✨ Your plan now</p>
            <p className="mt-1 text-sm font-bold text-slate-700">
              {usd(baseCash)} · {basePto} vacation days{current.summary.uncoveredDays > 0 ? ` · ${current.summary.uncoveredDays} days uncovered` : ""}
            </p>
          </li>
          {results.map((s) => {
            const r = s.result.summary;
            return (
              <li key={s.id} className="rounded-2xl border-2 border-b-4 border-slate-200 bg-white p-4">
                <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold leading-tight text-slate-900">
                  <span aria-hidden>{s.emoji}</span> {s.label}
                </p>
                <p className="mt-2 text-sm font-bold text-slate-600">
                  Total cost <span className="text-base font-extrabold">{delta(Math.round(r.objective - current.summary.objective), usd)}</span>
                </p>
                <dl className="mt-1 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs font-bold text-slate-500">Cash</dt>
                    <dd className="font-extrabold tabular-nums">{delta(r.cash - baseCash, usd)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-slate-500">Vacation</dt>
                    <dd className="font-extrabold tabular-nums">{delta(ptoOf(s.result) - basePto, (n) => `${n} d`)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold text-slate-500">Uncovered</dt>
                    <dd className={`font-extrabold tabular-nums ${r.uncoveredDays > 0 ? "text-red-700" : "text-emerald-900"}`}>{r.uncoveredDays > 0 ? `${r.uncoveredDays} days` : "none"}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-slate-500">Cash total {usd(r.cash)}. Re-planned from scratch.</p>
              </li>
            );
          })}
        </ul>
        </>
      )}
    </Card>
  );
}
