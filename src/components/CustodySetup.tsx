import { CUSTODY_LABELS, weekStartOf, type Custody, type CustodyPattern, type FamilyPlan } from "../engine";
import { Card, NumberField, Toggle } from "./ui";

const WEEKDAYS = ["", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays"];

/** Settings for separated or divorced parents: the parenting-time schedule from their custody order. */
export function CustodySetup({ plan, onChange }: { plan: FamilyPlan; onChange: (plan: FamilyPlan) => void }) {
  const c = plan.custody;
  const parents = plan.parents;
  const setCustody = (next: Custody | undefined) => onChange({ ...plan, custody: next });
  const patch = (change: Partial<Custody>) => c && setCustody({ ...c, ...change });
  const name = (id: string) => parents.find((p) => p.id === id)?.name ?? "?";
  const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm";

  return (
    <Card title="Two homes">
      <Toggle
        checked={!!c}
        label="Kids split time between two homes"
        onChange={(on) => {
          if (!on) return setCustody(undefined);
          if (parents.length < 2) return;
          setCustody({
            pattern: "2-2-5-5",
            start: weekStartOf(plan.today),
            parentA: parents[0].id,
            parentB: parents[1].id,
            firstRefusal: true,
            holidays: "alternate",
            summer: "pattern",
            changes: [],
            exchange: "",
            midweekVisit: null,
            costShareA: 50,
          });
        }}
      />
      {!c && (
        <p className="mt-2 text-xs text-slate-500">
          {parents.length < 2
            ? "Add the other parent under Parents first, even if they live elsewhere."
            : "For separated or divorced parents. Gapless then only counts the parent who has the kids that day."}
        </p>
      )}
      {c && (
        <div className="mt-3 space-y-3">
          <label className="block text-xs font-medium text-slate-600">
            Schedule from your parenting plan
            <select value={c.pattern} onChange={(e) => patch({ pattern: e.target.value as CustodyPattern })} className={field}>
              {(Object.keys(CUSTODY_LABELS) as CustodyPattern[]).map((k) => (
                <option key={k} value={k}>
                  {CUSTODY_LABELS[k].replace("Parent A", name(c.parentA)).replace("B every", `${name(c.parentB)} every`)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-slate-600">
              Cycle starts with
              <select
                value={c.parentA}
                onChange={(e) => {
                  const a = e.target.value;
                  const b = parents.find((p) => p.id !== a)!.id;
                  patch({ parentA: a, parentB: a === c.parentB ? c.parentA : b });
                }}
                className={field}
              >
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              in the week of
              <input
                type="date"
                value={c.start}
                onChange={(e) => e.target.value && patch({ start: weekStartOf(e.target.value) })}
                className={field}
              />
            </label>
          </div>
          {parents.length > 2 && (
            <label className="block text-xs font-medium text-slate-600">
              Other home
              <select value={c.parentB} onChange={(e) => patch({ parentB: e.target.value })} className={field}>
                {parents
                  .filter((p) => p.id !== c.parentA)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <div>
            <Toggle checked={c.firstRefusal} onChange={(firstRefusal) => patch({ firstRefusal })} label="Right of first refusal" />
            <p className="mt-1 text-xs text-slate-500">
              If the parent with the kids can't be there, the other parent is asked before a sitter. Turn on only if your order includes it.
            </p>
          </div>
          <div>
            <Toggle checked={c.holidays === "alternate"} onChange={(on) => patch({ holidays: on ? "alternate" : "pattern" })} label="Alternate holidays by year" />
            <p className="mt-1 text-xs text-slate-500">
              Even years: {name(c.parentA)} has Thanksgiving (Thu–Sun) and Dec 20–26; {name(c.parentB)} has Dec 27–Jan 5. Odd years flip.
            </p>
          </div>
          <Toggle
            checked={c.summer === "alternatingWeeks"}
            onChange={(on) => patch({ summer: on ? "alternatingWeeks" : "pattern" })}
            label="Summer: week on, week off"
          />

          <label className="block text-xs font-medium text-slate-600">
            Handoff (where and when)
            <input
              value={c.exchange ?? ""}
              onChange={(e) => patch({ exchange: e.target.value })}
              placeholder="Mondays at school drop-off; otherwise 6 pm at Mom's"
              className={field}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Midweek evening visit
            <select
              value={c.midweekVisit ?? 0}
              onChange={(e) => patch({ midweekVisit: Number(e.target.value) || null })}
              className={field}
            >
              <option value={0}>None</option>
              {[1, 2, 3, 4, 5].map((d) => (
                <option key={d} value={d}>
                  {WEEKDAYS[d]}, with whoever doesn't have the kids
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label={`${name(c.parentA)} pays this % of childcare and camps`}
            prefix="%"
            min={0}
            max={100}
            value={c.costShareA ?? 50}
            onChange={(costShareA) => patch({ costShareA })}
          />
          <p className="text-xs text-slate-500">Support orders often split work-related childcare by income. Use the split in yours.</p>
        </div>
      )}
    </Card>
  );
}
