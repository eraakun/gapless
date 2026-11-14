import { daysBetween, type CoveragePlan, type FamilyPlan } from "../engine";
import { shortDate, usd } from "../lib/format";
import { Card } from "./ui";

interface Props {
  plan: FamilyPlan;
  coverage: CoveragePlan;
  onChange: (plan: FamilyPlan) => void;
}

/**
 * Camp weeks the plan wants, grouped by camp, with registration deadlines.
 * "Mark booked" locks a week in, so later re-plans build around it.
 */
export function CampsCard({ plan, coverage, onChange }: Props) {
  const kidName = (id: string) => plan.children.find((c) => c.id === id)?.name ?? "?";
  const byCamp = new Map<string, typeof coverage.campWeeks>();
  for (const w of coverage.campWeeks) byCamp.set(w.campId, [...(byCamp.get(w.campId) ?? []), w]);
  const isBooked = (w: (typeof coverage.campWeeks)[number]) =>
    plan.bookings.some((b) => b.campId === w.campId && b.childId === w.childId && b.weekStart === w.weekStart);
  const toggle = (w: (typeof coverage.campWeeks)[number]) =>
    onChange({
      ...plan,
      bookings: isBooked(w)
        ? plan.bookings.filter((b) => !(b.campId === w.campId && b.childId === w.childId && b.weekStart === w.weekStart))
        : [...plan.bookings, { campId: w.campId, childId: w.childId, weekStart: w.weekStart }],
    });

  return (
    <Card title="Camps to book">
      {byCamp.size === 0 ? (
        <p className="text-sm text-slate-500">No camp weeks needed: the plan covers everything more cheaply without them.</p>
      ) : (
        <div className="space-y-4">
          {[...byCamp.entries()].map(([campId, weeks]) => {
            const camp = plan.camps.find((c) => c.id === campId);
            const deadline = camp?.registerBy;
            const left = deadline ? daysBetween(plan.today, deadline) : null;
            return (
              <div key={campId}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {camp?.name} <span className="font-normal text-slate-500">{usd(weeks.reduce((s, w) => s + w.price, 0))}</span>
                  </p>
                  {deadline && left !== null && (
                    <p className={`text-xs font-medium ${left < 0 ? "text-slate-400" : left <= 21 ? "text-rose-700" : "text-slate-600"}`}>
                      {left < 0 ? `Registration closed ${shortDate(deadline)}` : `Register by ${shortDate(deadline)} (${left} days)`}
                    </p>
                  )}
                </div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {weeks.map((w) => (
                    <li key={`${w.childId}-${w.weekStart}`}>
                      <button
                        type="button"
                        onClick={() => toggle(w)}
                        aria-pressed={isBooked(w)}
                        title={isBooked(w) ? "Booked. Click to unmark." : "Mark as booked so re-plans keep it"}
                        className={`rounded-lg border px-2.5 py-1 text-xs ${isBooked(w) ? "border-violet-600 bg-violet-600 text-white" : "border-violet-300 bg-violet-50 text-violet-900"}`}
                      >
                        {isBooked(w) ? "✓ " : ""}
                        {kidName(w.childId)}, week of {shortDate(w.weekStart)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
