import { useMemo } from "react";
import { dateParts, daysInMonth, parseISO, type CoveragePlan, type DayPlan, type FamilyPlan } from "../engine";
import { shortDate } from "../lib/format";
import { dominantKind, SOURCE_STYLE } from "../lib/sources";
import { Card, ProBadge } from "./ui";

interface Props {
  plan: FamilyPlan;
  coverage: CoveragePlan;
  /** Free users see this many days ahead; the rest is locked. */
  visibleUntil: string | null;
  onUnlock: () => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function describe(day: DayPlan, kidName: (id: string) => string): string {
  return day.covers.map((c) => `${c.childIds.map(kidName).join(" & ")}: ${c.label}`).join("; ");
}

/** Month grids for the whole plan, each no-school day colored by who has the kids. */
export function YearCalendar({ plan, coverage, visibleUntil, onUnlock }: Props) {
  const byDate = useMemo(() => new Map(coverage.days.map((d) => [d.date, d])), [coverage]);
  const kidName = (id: string) => plan.children.find((c) => c.id === id)?.name ?? "?";

  const months: Array<{ year: number; month: number }> = [];
  const start = dateParts(parseISO(plan.today));
  const end = dateParts(parseISO(plan.horizonEnd));
  for (let y = start.year, m = start.month; y < end.year || (y === end.year && m <= end.month); m === 12 ? (y++, (m = 1)) : m++) {
    months.push({ year: y, month: m });
  }

  return (
    <Card
      title="Month by month"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {months.map(({ year, month }) => {
          const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
          const count = daysInMonth(year, month);
          const key = `${year}-${String(month).padStart(2, "0")}`;
          const locked = visibleUntil !== null && `${key}-01` > visibleUntil;
          return (
            <div key={key} className="relative">
              <p className="mb-1 text-xs font-semibold text-slate-700">
                {MONTHS[month - 1]} {year}
              </p>
              <div className={`grid grid-cols-7 gap-0.5 text-center text-[10px] ${locked ? "blur-[3px]" : ""}`} aria-hidden={locked}>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <span key={i} className="text-slate-400">
                    {d}
                  </span>
                ))}
                {Array.from({ length: firstWeekday }, (_, i) => (
                  <span key={`pad-${i}`} />
                ))}
                {Array.from({ length: count }, (_, i) => {
                  const date = `${key}-${String(i + 1).padStart(2, "0")}`;
                  const day = byDate.get(date);
                  const hidden = visibleUntil !== null && date > visibleUntil;
                  const style = day && !hidden ? SOURCE_STYLE[dominantKind(day.covers.map((c) => c.kind))].cell : "text-slate-400";
                  return (
                    <span
                      key={date}
                      title={day && !hidden ? `${shortDate(date)}: ${describe(day, kidName)}` : undefined}
                      className={`rounded py-1 ${style} ${date === plan.today ? "ring-2 ring-slate-900" : ""} ${date < plan.today ? "opacity-40" : ""}`}
                    >
                      {i + 1}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {visibleUntil !== null && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-3">
          <p className="text-sm text-amber-900">
            Free shows the next 60 days. The full plan, through summer, is already computed above.
          </p>
          <button type="button" onClick={onUnlock} className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950">
            See the whole year <ProBadge />
          </button>
        </div>
      )}
    </Card>
  );
}
