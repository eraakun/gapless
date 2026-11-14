import { useState } from "react";
import type { CoveragePlan, FamilyPlan } from "../engine";
import { daysBetween, explainDay, planB } from "../engine";
import { shortDate, usd } from "../lib/format";
import { SOURCE_STYLE } from "../lib/sources";
import { Card } from "./ui";

/** The next few no-school days, spelled out: who has which kid, and what it costs. */
export function Upcoming({ plan, coverage, count = 6 }: { plan: FamilyPlan; coverage: CoveragePlan; count?: number }) {
  const kidName = (id: string) => plan.children.find((c) => c.id === id)?.name ?? "?";
  const next = coverage.days.filter((d) => d.date >= plan.today).slice(0, count);
  const [why, setWhy] = useState<string | null>(null);

  return (
    <Card title="Coming up">
      {next.length === 0 ? (
        <p className="text-sm text-slate-500">No school closures ahead in your plan.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {next.map((day) => {
            const inDays = daysBetween(plan.today, day.date);
            return (
              <li key={day.date} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                <div>
                  <p className="font-medium text-slate-900">
                    {shortDate(day.date)}{" "}
                    <span className="font-normal text-slate-500">
                      {inDays === 0 ? "today" : inDays === 1 ? "tomorrow" : `in ${inDays} days`} ·{" "}
                      {day.reason === "summer" ? "summer" : day.reason === "sick" ? "sick day" : day.reason === "snow" ? "surprise closure" : "no school"}
                    </span>
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {day.covers.map((c, i) => (
                      <li key={i} className="flex items-center gap-2 text-slate-700">
                        <span className={`h-2 w-2 rounded-full ${SOURCE_STYLE[c.kind].dot}`} />
                        {c.childIds.map(kidName).join(" & ")}: {c.label}
                      </li>
                    ))}
                  </ul>
                  {day.covers.length > 0 && (
                    <button
                      type="button"
                      aria-expanded={why === day.date}
                      onClick={() => setWhy(why === day.date ? null : day.date)}
                      className="mt-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-extrabold text-teal-700 hover:bg-teal-100"
                    >
                      {why === day.date ? "Hide" : "Why?"}
                    </button>
                  )}
                  {why === day.date && (
                    <ul className="mt-2 space-y-1.5 rounded-2xl bg-teal-50 p-3 text-sm text-slate-800">
                      {explainDay(plan, day).map((line, i) => {
                        const b = planB(plan, day, day.covers[i]);
                        return (
                          <li key={i}>
                            💡 {line}
                            {b && <span className="mt-1 block font-bold text-teal-800">🅱️ {b}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <p className="shrink-0 tabular-nums text-slate-600">{day.covers.some((c) => c.cash > 0) ? usd(day.covers.reduce((s, c) => s + c.cash, 0)) : ""}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
