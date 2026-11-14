import { useMemo } from "react";
import { dateParts, parseISO, toISO, type CoveragePlan, type SourceKind } from "../engine";
import { shortDate } from "../lib/format";
import { dominantKind, SOURCE_STYLE } from "../lib/sources";

const CELL = 16;
const GAP = 4;
const TOP = 16;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Props {
  coverage: CoveragePlan;
  from: string;
  to: string;
  /** Days after this are drawn hatched (free plan). */
  visibleUntil: string | null;
}

/**
 * The whole school year as one strip of weeks, Monday to Friday top to
 * bottom. Every no-school day is marked in the color of whoever has the kids;
 * ordinary school days stay paper-white. It's the one picture that shows the
 * size of the problem and the shape of the answer.
 */
export function YearStrip({ coverage, from, to, visibleUntil }: Props) {
  const byDate = useMemo(() => new Map(coverage.days.map((d) => [d.date, d])), [coverage]);
  const startDay = parseISO(from);
  const weekday = dateParts(startDay).weekday;
  const firstMonday = startDay - (weekday === 0 ? 6 : weekday - 1);
  const weeks = Math.max(1, Math.ceil((parseISO(to) - firstMonday + 1) / 7));
  const width = weeks * (CELL + GAP);
  const height = TOP + 5 * (CELL + GAP);

  const months: Array<{ x: number; label: string }> = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const { month } = dateParts(firstMonday + w * 7);
    if (month !== lastMonth) {
      months.push({ x: w * (CELL + GAP), label: MONTHS[month - 1] });
      lastMonth = month;
    }
  }

  const cells: Array<{ x: number; y: number; date: string; kind: SourceKind | null; title: string; locked: boolean }> = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 5; d++) {
      const date = toISO(firstMonday + w * 7 + d);
      if (date < from || date > to) continue;
      const plan = byDate.get(date);
      const locked = visibleUntil !== null && date > visibleUntil;
      cells.push({
        x: w * (CELL + GAP),
        y: TOP + d * (CELL + GAP),
        date,
        kind: plan ? dominantKind(plan.covers.map((c) => c.kind)) : null,
        locked,
        title: plan ? `${shortDate(date)}: ${locked ? "unlock to see" : plan.covers.map((c) => c.label).join(", ")}` : `${shortDate(date)}: school day`,
      });
    }
  }

  return (
    <figure>
      <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0" tabIndex={0} role="region" aria-label="Year strip, scrolls sideways on small screens">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[720px]"
        role="img"
        aria-label={`School year from ${shortDate(from)} to ${shortDate(to)}: ${coverage.days.length} no-school weekdays, colored by who covers each one.`}
      >
        <defs>
          <pattern id="gapless-locked" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="#edf1f6" />
            <line x1="0" y1="0" x2="0" y2="4" stroke="#c5cedb" strokeWidth="2" />
          </pattern>
        </defs>
        {months.map((m) => (
          <text key={`${m.label}-${m.x}`} x={m.x} y={10} fill="#66738a" style={{ fontSize: 10 }}>
            {m.label}
          </text>
        ))}
        {cells.map((c) => (
          <rect
            key={c.date}
            x={c.x}
            y={c.y}
            width={CELL}
            height={CELL}
            rx={2.5}
            fill={c.kind === null ? "#ffffff" : c.locked ? "url(#gapless-locked)" : SOURCE_STYLE[c.kind].fill}
            stroke={c.kind === null ? "#95a1b4" : c.locked ? "none" : SOURCE_STYLE[c.kind].stroke}
            strokeWidth={1.25}
          >
            <title>{c.title}</title>
          </rect>
        ))}
      </svg>
      </div>
      {visibleUntil !== null && <p className="mt-2 text-sm text-slate-600">Striped days are planned too. Unlock Pro to see who covers them.</p>}
      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] border border-slate-400 bg-white" /> School day
        </span>
        {(Object.keys(SOURCE_STYLE) as SourceKind[]).map((kind) => (
          <span key={kind} className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px]" style={{ background: SOURCE_STYLE[kind].fill, border: `1.5px solid ${SOURCE_STYLE[kind].stroke}` }} /> {SOURCE_STYLE[kind].label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
