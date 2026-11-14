import { useState } from "react";
import { addDaysISO, dateParts, parseISO, type FamilyPlan, type SurpriseReason } from "../engine";
import { shortDate } from "../lib/format";
import { Card } from "./ui";

interface Props {
  plan: FamilyPlan;
  onChange: (plan: FamilyPlan) => void;
}

/**
 * The moment parents come back: a kid wakes up sick, or school closes for
 * snow. One tap adds the day and the whole plan re-optimizes around it,
 * drawing on the vacation days held back for exactly this.
 */
/** The next weekday after `today`: sick days and closures only matter on school days. */
function nextWeekday(today: string): string {
  let date = addDaysISO(today, 1);
  while ([0, 6].includes(dateParts(parseISO(date)).weekday)) date = addDaysISO(date, 1);
  return date;
}

export function SurpriseBar({ plan, onChange }: Props) {
  const [date, setDate] = useState(nextWeekday(plan.today));
  const [reason, setReason] = useState<SurpriseReason>("sick");
  const [picked, setPicked] = useState<string[]>([]);
  const validIds = plan.children.map((c) => c.id);
  // Default to the youngest child until the parent picks.
  const youngest = [...plan.children].sort((a, b) => a.age - b.age)[0]?.id;
  const kids = picked.filter((id) => validIds.includes(id));
  const selected = kids.length > 0 ? kids : youngest ? [youngest] : [];
  const setKids = (ids: string[]) => setPicked(ids);
  const name = (id: string) => plan.children.find((c) => c.id === id)?.name ?? "?";
  const weekend = [0, 6].includes(dateParts(parseISO(date)).weekday);

  const add = () => {
    if (weekend) return;
    const childIds = reason === "sick" ? selected : validIds;
    if (childIds.length === 0) return;
    const others = plan.surprises.filter((s) => s.date !== date);
    onChange({ ...plan, surprises: [...others, { date, reason, childIds }].sort((a, b) => a.date.localeCompare(b.date)) });
  };

  return (
    <Card title="Sick kid or snow day?">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-600">
          Day
          <input type="date" value={date} min={plan.today} onChange={(e) => setDate(e.target.value)} className="mt-1 block h-10 rounded-lg border border-slate-300 px-2 text-sm" />
        </label>
        <div className="flex h-10 rounded-lg border border-slate-300 p-0.5 text-sm" role="radiogroup" aria-label="What happened">
          {(["sick", "snow"] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={`rounded-md px-3 py-1 ${reason === r ? "bg-slate-900 text-white" : "text-slate-600"}`}
            >
              {r === "sick" ? "Kid is sick" : "School closed"}
            </button>
          ))}
        </div>
        {reason === "sick" && (
          <div className="flex gap-1">
            {plan.children.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={selected.includes(c.id)}
                onClick={() => setKids(selected.includes(c.id) ? selected.filter((k) => k !== c.id) : [...selected, c.id])}
                className={`h-10 rounded-full px-4 text-sm font-semibold ${selected.includes(c.id) ? "bg-teal-700 text-white" : "border border-slate-300 text-slate-600"}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={add}
          disabled={weekend || (reason === "sick" && selected.length === 0)}
          className="h-10 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-40"
        >
          Re-plan around it
        </button>
      </div>
      {weekend && <p className="mt-2 text-xs text-slate-500">That's a weekend. Pick a school day.</p>}
      {plan.surprises.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs">
          {plan.surprises.map((s) => (
            <li key={s.date} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-slate-800">
              {shortDate(s.date)}: {s.reason === "sick" ? `${s.childIds.map(name).join(" & ")} sick` : "school closed"}
              <button
                type="button"
                aria-label={`Remove ${s.date}`}
                onClick={() => onChange({ ...plan, surprises: plan.surprises.filter((x) => x.date !== s.date) })}
                className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
