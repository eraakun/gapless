import { useEffect, useRef, useState } from "react";
import type { FamilyPlan } from "../engine";
import { DISTRICTS } from "../data/districts";
import { buildQuickPlan, QUICK_DEFAULTS } from "../data/quickStart";

const SCHEDULES: Array<{ label: string; emoji: string; days: number[] }> = [
  { label: "Mon–Fri", emoji: "💼", days: [1, 2, 3, 4, 5] },
  { label: "Mon–Thu", emoji: "🗓️", days: [1, 2, 3, 4] },
  { label: "3 days", emoji: "🩺", days: [1, 2, 3] },
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr"];
const STEPS = [
  { emoji: "🏫", title: "Where do your kids go to school?" },
  { emoji: "🧒", title: "How old are your kids?" },
  { emoji: "👩‍💼", title: "Who works, and how much vacation is left?" },
  { emoji: "👵", title: "Who can help, and what does care cost?" },
];

interface ParentDraft {
  schedule: number;
  ptoDays: number;
}

/** One question per screen, then the plan builds itself. */
export function QuickStart({ today, onDone }: { today: string; onDone: (plan: FamilyPlan) => void }) {
  const [step, setStep] = useState(0);
  const [districtId, setDistrictId] = useState(DISTRICTS[0].id);
  const [ages, setAges] = useState<number[]>([6, 10]);
  const [parents, setParents] = useState<ParentDraft[]>([
    { schedule: 0, ptoDays: 10 },
    { schedule: 0, ptoDays: 10 },
  ]);
  const [helperOn, setHelperOn] = useState(true);
  const [helper, setHelper] = useState({ name: "Grandma", weekdays: [2, 4], maxDays: 10 });
  const [sitter, setSitter] = useState(QUICK_DEFAULTS.sitterPerDay);
  const [camp, setCamp] = useState(QUICK_DEFAULTS.summerCampPerWeek);
  const [building, setBuilding] = useState<FamilyPlan | null>(null);
  const [tick, setTick] = useState(0);
  const district = DISTRICTS.find((d) => d.id === districtId)!;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // The build animation: three checks, then hand the plan over.
  useEffect(() => {
    if (!building) return;
    if (tick >= 3) {
      const t = setTimeout(() => doneRef.current(building), 350);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTick((n) => n + 1), 420);
    return () => clearTimeout(t);
  }, [building, tick]);

  const build = () => {
    const plan = buildQuickPlan(
      {
        districtId,
        kidAges: ages,
        parents: parents.map((p) => ({ workdays: SCHEDULES[p.schedule].days, ptoDays: p.ptoDays })),
        helper: helperOn ? helper : null,
        sitterPerDay: sitter,
        summerCampPerWeek: camp,
      },
      today,
    );
    if (plan) {
      setTick(0);
      setBuilding(plan);
    }
  };

  if (building) {
    const checks = [
      `Found ${district.calendar.closures.length} no-school weekdays plus summer`,
      "Matching vacation days, family and work-from-home",
      "Picking the camp weeks that are worth it",
    ];
    return (
      <div className="rounded-3xl border-2 border-b-4 border-teal-200 bg-teal-50 p-6" role="status" aria-live="polite">
        <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">Building your plan…</p>
        <ul className="mt-4 space-y-2">
          {checks.map((c, i) => (
            <li key={c} className={`flex items-center gap-3 text-base font-bold ${i < tick ? "text-slate-900" : "text-slate-400"}`}>
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${i < tick ? "bg-emerald-500 text-white" : "bg-slate-200"}`}>{i < tick ? "✓" : i + 1}</span>
              {c}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const canNext = step === 1 ? ages.length > 0 : true;
  const chip = (on: boolean) =>
    `rounded-2xl border-2 border-b-4 px-3 py-2 text-sm font-extrabold ${on ? "border-teal-900 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-teal-300"}`;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-slate-900">Plan your own family</h2>
        <span className="text-sm font-bold text-slate-500">
          Step {step + 1} of {STEPS.length}
        </span>
      </div>
      <div className="mt-3 flex gap-1.5" aria-hidden>
        {STEPS.map((_, i) => (
          <span key={i} className={`h-2.5 flex-1 rounded-full ${i <= step ? "bg-teal-600" : "bg-slate-200"}`} />
        ))}
      </div>

      <p className="mt-5 flex items-center gap-3 font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">
        <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-300 text-2xl">
          {STEPS[step].emoji}
        </span>
        {STEPS[step].title}
      </p>

      <div className="mt-4 min-h-[9rem]">
        {step === 0 && (
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="School district">
            {DISTRICTS.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={districtId === d.id} onClick={() => setDistrictId(d.id)} className={`${chip(districtId === d.id)} text-left`}>
                {d.name}
                <span className={`block text-xs font-semibold ${districtId === d.id ? "text-teal-100" : "text-slate-500"}`}>{d.calendar.closures.length} no-school weekdays + summer</span>
              </button>
            ))}
            <p className="text-xs text-slate-500 sm:col-span-2">Not listed? Pick any and import your district's .ics in the School tab afterwards.</p>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-wrap items-center gap-3">
            {ages.map((age, i) => (
              <div key={i} className="flex items-center gap-1 rounded-2xl border-2 border-b-4 border-slate-200 bg-white p-1.5">
                <span aria-hidden className="px-1 text-xl">{age < 9 ? "🧒" : "🧑"}</span>
                <Stepper label={`Kid ${i + 1} age`} value={age} min={3} max={17} onChange={(v) => setAges(ages.map((a, j) => (j === i ? v : a)))} />
                <button type="button" aria-label={`Remove kid ${i + 1}`} onClick={() => setAges(ages.filter((_, j) => j !== i))} className="ml-1 h-8 w-8 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  ×
                </button>
              </div>
            ))}
            {ages.length < 5 && (
              <button type="button" onClick={() => setAges([...ages, 8])} className={chip(false)}>
                + Add a kid
              </button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {parents.map((p, i) => (
              <div key={i} className="rounded-2xl border-2 border-b-4 border-slate-200 bg-white p-3">
                <p className="text-sm font-extrabold text-slate-700">Parent {i + 1}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SCHEDULES.map((s, k) => (
                    <button key={s.label} type="button" aria-pressed={p.schedule === k} onClick={() => setParents(parents.map((x, j) => (j === i ? { ...x, schedule: k } : x)))} className={chip(p.schedule === k)}>
                      <span aria-hidden>{s.emoji}</span> {s.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-600">Vacation days left</span>
                  <Stepper label={`Parent ${i + 1} vacation days`} value={p.ptoDays} min={0} max={40} onChange={(v) => setParents(parents.map((x, j) => (j === i ? { ...x, ptoDays: v } : x)))} />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setParents(parents.length === 2 ? parents.slice(0, 1) : [...parents, { schedule: 0, ptoDays: 10 }])}
              className="text-left text-sm font-bold text-teal-700 underline sm:col-span-2"
            >
              {parents.length === 2 ? "Single-parent household" : "+ Add a second parent"}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="rounded-2xl border-2 border-b-4 border-slate-200 bg-white p-3">
              <label className="flex items-center gap-2 text-sm font-extrabold text-slate-700">
                <input type="checkbox" checked={helperOn} onChange={(e) => setHelperOn(e.target.checked)} className="h-5 w-5 accent-[#5a32f0]" />
                A grandparent or friend can help for free
              </label>
              {helperOn && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <input
                    value={helper.name}
                    onChange={(e) => setHelper({ ...helper, name: e.target.value })}
                    aria-label="Helper's name"
                    className="w-32 rounded-xl border-2 border-slate-200 px-2.5 py-1.5 text-sm font-bold"
                  />
                  <div className="flex gap-1" role="group" aria-label="Days they can help">
                    {WEEKDAYS.map((d, k) => {
                      const wd = k + 1;
                      const on = helper.weekdays.includes(wd);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setHelper({ ...helper, weekdays: on ? helper.weekdays.filter((x) => x !== wd) : [...helper.weekdays, wd].sort() })}
                          className={`h-9 w-9 rounded-xl border-2 text-xs font-extrabold ${on ? "border-teal-900 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-600">
                    up to <Stepper label="Max days helping" value={helper.maxDays} min={1} max={60} onChange={(maxDays) => setHelper({ ...helper, maxDays })} /> days
                  </span>
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-2 rounded-2xl border-2 border-b-4 border-slate-200 bg-white p-3">
                <span className="text-sm font-bold text-slate-600">🧸 Sitter, per day</span>
                <Stepper label="Sitter per day" value={sitter} min={0} max={600} step={10} prefix="$" onChange={setSitter} />
              </div>
              <div className="flex items-center justify-between gap-2 rounded-2xl border-2 border-b-4 border-slate-200 bg-white p-3">
                <span className="text-sm font-bold text-slate-600">⛺ Summer camp, per week</span>
                <Stepper label="Summer camp per week" value={camp} min={0} max={1500} step={25} prefix="$" onChange={setCamp} />
              </div>
            </div>
            <p className="text-xs text-slate-500">Not sure? Keep the defaults. You can change any of this later.</p>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center gap-3">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="rounded-2xl border-2 border-b-4 border-slate-200 bg-white px-4 py-2.5 text-base font-extrabold text-slate-700">
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)} className="rounded-2xl bg-teal-700 px-6 py-2.5 text-base font-extrabold text-white disabled:opacity-40">
            Next
          </button>
        ) : (
          <button type="button" onClick={build} className="rounded-2xl bg-amber-400 px-6 py-2.5 text-base font-extrabold text-slate-900">
            ✨ Build my plan
          </button>
        )}
      </div>
    </div>
  );
}

function Stepper({ label, value, min, max, step = 1, prefix = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; prefix?: string; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" aria-label={`Less: ${label}`} onClick={() => onChange(clamp(value - step))} className="h-8 w-8 rounded-full bg-slate-100 text-lg font-extrabold text-slate-700 hover:bg-slate-200">
        −
      </button>
      <span className="min-w-[3ch] text-center font-[family-name:var(--font-display)] text-lg font-bold tabular-nums text-slate-900" aria-live="polite">
        {prefix}
        {value}
      </span>
      <button type="button" aria-label={`More: ${label}`} onClick={() => onChange(clamp(value + step))} className="h-8 w-8 rounded-full bg-slate-100 text-lg font-extrabold text-slate-700 hover:bg-slate-200">
        +
      </button>
    </span>
  );
}
