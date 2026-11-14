import { buildTasks, type CoveragePlan, type FamilyPlan } from "../engine";
import { plural, shortDate, usd } from "../lib/format";
import { SOURCE_STYLE } from "../lib/sources";
import { LogoMark } from "./Logo";

/**
 * A one-glance printable plan for the fridge or the other parent:
 * the totals, the to-do list, and every no-school day with who has the kids.
 * Hidden on screen; window.print() shows only this.
 */
export function PrintReport({ plan, coverage }: { plan: FamilyPlan; coverage: CoveragePlan }) {
  const s = coverage.summary;
  const kid = new Map(plan.children.map((c) => [c.id, c.name]));
  const tasks = buildTasks(plan, coverage).filter((t) => !(plan.doneTasks ?? []).includes(t.id));
  const days = coverage.days.filter((d) => d.covers.some((c) => c.kind !== "parentOff"));
  const byMonth = new Map<string, typeof days>();
  for (const d of days) {
    const m = new Date(d.date + "T00:00:00Z").toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    byMonth.set(m, [...(byMonth.get(m) ?? []), d]);
  }
  const pto = Object.values(s.ptoUsed).reduce((a, b) => a + b, 0) + Object.values(s.reserveUsed).reduce((a, b) => a + b, 0);

  return (
    <div id="print-report" className="hidden text-[11pt] text-black print:block">
      <header className="flex items-center gap-3 border-b-2 border-black pb-3">
        <LogoMark className="h-10 w-10" animate={false} />
        <div>
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold">Our no-school plan</p>
          <p className="text-sm">
            {plan.children.map((c) => c.name).join(", ")} · {shortDate(plan.today)} to {shortDate(plan.horizonEnd)} · made with Gapless
          </p>
        </div>
      </header>

      <p className="mt-4 text-lg font-bold">
        {plural(s.gapDays, "day")} to cover · {usd(s.cash)} cash · {pto} vacation days{s.uncoveredDays > 0 ? ` · ${s.uncoveredDays} days still uncovered` : " · every day covered"}
      </p>

      {tasks.length > 0 && (
        <section className="mt-5">
          <h2 className="text-lg">To-do</h2>
          <ul className="mt-1">
            {tasks.map((t) => (
              <li key={t.id} className="flex gap-2 border-b border-gray-300 py-1">
                <span>☐</span>
                <span className="w-36 shrink-0 whitespace-nowrap font-bold">by {shortDate(t.due)}</span>
                <span>
                  {t.title} <span className="text-gray-600">({t.detail})</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-5">
        <h2 className="text-lg">Who has the kids</h2>
        {[...byMonth.entries()].map(([month, list]) => (
          <div key={month} className="mt-3 break-inside-avoid">
            <h3 className="text-base">{month}</h3>
            <table className="mt-1 w-full border-collapse text-left">
              <tbody>
                {list.map((d) => (
                  <tr key={d.date} className="border-b border-gray-300 align-top">
                    <td className="w-32 py-1 pr-2 font-bold">{shortDate(d.date)}</td>
                    <td className="py-1">
                      {d.covers
                        .map((c) => `${SOURCE_STYLE[c.kind].emoji} ${c.childIds.map((id) => kid.get(id)).join(" & ")}: ${c.label}${c.cash ? ` (${usd(c.cash)})` : ""}`)
                        .join("   ·   ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <p className="mt-6 text-xs text-gray-600">Check dates with your school district and providers. Your custody order, if you have one, always controls.</p>
    </div>
  );
}
