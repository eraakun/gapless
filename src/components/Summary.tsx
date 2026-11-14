import type { CoveragePlan, FamilyPlan, SourceKind } from "../engine";
import { plural, usd } from "../lib/format";
import { SOURCE_STYLE } from "../lib/sources";
import { YearStrip } from "./YearStrip";

interface Props {
  plan: FamilyPlan;
  best: CoveragePlan;
  typical: CoveragePlan;
  visibleUntil: string | null;
}

const ptoTotal = (s: CoveragePlan["summary"]) =>
  Object.values(s.ptoUsed).reduce((a, b) => a + b, 0) + Object.values(s.reserveUsed).reduce((a, b) => a + b, 0);

/**
 * The answer at a glance: one sentence, four round badges, a tile for each
 * way the days get covered, the whole year as a strip, and the honest
 * comparison with doing it the usual way.
 */
export function Summary({ plan, best, typical, visibleUntil }: Props) {
  const s = best.summary;
  const t = typical.summary;
  const helperDays = Object.values(s.helperDays).reduce((a, b) => a + b, 0);
  const saved = t.cash - s.cash;
  const pto = ptoTotal(s);

  const badges: Array<{ value: string; label: string; emoji: string; bg: string; ring: string }> = [
    { value: String(s.gapDays), label: "days to cover", emoji: "📅", bg: "bg-amber-300", ring: "ring-amber-500" },
    { value: usd(s.cash), label: "total cash", emoji: "💵", bg: "bg-teal-200", ring: "ring-teal-600" },
    { value: String(pto), label: "vacation days", emoji: "🏖️", bg: "bg-[#9ff0cf]", ring: "ring-[#14a36f]" },
    saved > 0
      ? { value: usd(saved), label: "saved vs. camp every week", emoji: "🎉", bg: "bg-[#ffb4a6]", ring: "ring-[#f2492f]" }
      : { value: String(s.freeParentDays), label: "days a parent is home", emoji: "🏡", bg: "bg-slate-200", ring: "ring-slate-400" },
  ];

  const tiles: Array<{ kind: SourceKind; label: string; value: string; show: boolean }> = [
    { kind: "parentOff", label: "Parent already off", value: plural(s.freeParentDays, "day"), show: s.freeParentDays > 0 },
    ...plan.helpers.map((h) => ({ kind: "helper" as const, label: h.name, value: plural(s.helperDays[h.id] ?? 0, "day"), show: (s.helperDays[h.id] ?? 0) > 0 })),
    ...plan.parents.map((p) => ({
      kind: "pto" as const,
      label: `${p.name}'s vacation`,
      value: `${s.ptoUsed[p.id] + s.reserveUsed[p.id]} of ${p.ptoDays}`,
      show: s.ptoUsed[p.id] + s.reserveUsed[p.id] > 0,
    })),
    { kind: "wfh", label: "Work from home", value: plural(s.wfhDays, "day"), show: s.wfhDays > 0 },
    { kind: "camp", label: "Camp", value: plural(s.campWeeks, "kid-week"), show: s.campWeeks > 0 },
    { kind: "paid", label: "Paid care", value: plural(s.paidDays, "day"), show: s.paidDays > 0 },
    { kind: "uncovered", label: "Nobody yet", value: plural(s.uncoveredDays, "day"), show: s.uncoveredDays > 0 },
  ];

  return (
    <section className="rounded-[2rem] border-2 border-b-4 border-slate-200 bg-white">
      <div className="p-6 sm:p-8">
        <h1 className="max-w-3xl text-balance text-[2rem] text-slate-900 sm:text-[2.6rem]">
          {s.uncoveredDays > 0 ? (
            `${plural(s.gapDays, "day")} need someone. ${plural(s.uncoveredDays, "day")} still have nobody.`
          ) : (
            <>
              {plural(s.gapDays, "day")} need someone. All covered for <span className="highlight">{usd(s.cash)}</span>.
            </>
          )}
        </h1>
        <p className="mt-2 text-slate-600">
          {plural(s.gapDays + s.freeParentDays, "weekday")} without school until the new school year. On {s.freeParentDays} of them a parent is already home.
        </p>

        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {badges.map((b) => (
            <li key={b.label} className="flex flex-col items-center text-center">
              <span className={`relative flex h-24 w-24 flex-col items-center justify-center rounded-full ring-4 ring-inset ${b.bg} ${b.ring} sm:h-28 sm:w-28`}>
                <span aria-hidden className="absolute -top-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-white text-lg shadow">
                  {b.emoji}
                </span>
                <span className={`font-[family-name:var(--font-display)] font-bold leading-none tabular-nums text-slate-900 ${b.value.length > 5 ? "text-xl sm:text-[1.35rem]" : "text-2xl sm:text-[1.9rem]"}`}>{b.value}</span>
              </span>
              <span className="mt-2 text-sm font-bold text-slate-600">{b.label}</span>
            </li>
          ))}
        </ul>

        <h2 className="mt-8 text-slate-900">Who covers the days</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles
            .filter((x) => x.show)
            .map((x) => {
              const st = SOURCE_STYLE[x.kind];
              return (
                <li key={x.kind + x.label} className={`flex items-center gap-3 rounded-2xl border-2 border-b-4 px-3 py-3 ${st.cell}`} style={{ borderColor: st.stroke }}>
                  <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80 text-2xl">
                    {st.emoji}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold leading-tight">{x.label}</span>
                    <span className="block font-[family-name:var(--font-display)] text-xl font-bold leading-tight">{x.value}</span>
                  </span>
                </li>
              );
            })}
        </ul>

        <div className="mt-8">
          <YearStrip coverage={best} from={plan.today} to={plan.horizonEnd} visibleUntil={visibleUntil} />
        </div>
      </div>

      <div className="rounded-b-[2rem] border-t-2 border-slate-200 bg-slate-50 p-6 sm:p-8">
        <h2 className="text-slate-900">Compared with the usual way</h2>
        <p className="mt-1 text-sm text-slate-600">The usual way: camp every week one runs, vacation days first come first served, then family, then paid care.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Compare title="Usual way" emoji="😮‍💨" cash={t.cash} pto={ptoTotal(t)} family={Object.values(t.helperDays).reduce((a, b) => a + b, 0)} />
          <Compare title="Gapless" emoji="✨" cash={s.cash} pto={pto} family={helperDays} best />
        </div>
        <p className="mt-4 rounded-2xl bg-amber-100 px-4 py-3 text-sm font-bold text-amber-900">
          Counting each vacation day at your {usd(plan.settings.ptoDayValue)}: {usd(t.objective)} the usual way vs. {usd(s.objective)} with Gapless.
        </p>
      </div>
    </section>
  );
}

function Compare({ title, emoji, cash, pto, family, best }: { title: string; emoji: string; cash: number; pto: number; family: number; best?: boolean }) {
  return (
    <div className={`rounded-2xl border-2 border-b-4 p-4 ${best ? "border-teal-600 bg-white" : "border-slate-200 bg-white text-slate-600"}`}>
      <p className="flex items-center gap-2 font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">
        <span aria-hidden>{emoji}</span> {title}
      </p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-xs font-bold text-slate-500">Cash</dt>
          <dd className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums">{usd(cash)}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-slate-500">Vacation</dt>
          <dd className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums">{pto}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-slate-500">Family</dt>
          <dd className="font-[family-name:var(--font-display)] text-xl font-bold tabular-nums">{family}</dd>
        </div>
      </dl>
    </div>
  );
}
