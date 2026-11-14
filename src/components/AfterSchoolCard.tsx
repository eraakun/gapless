import { planAfterSchool, type AfterSchoolKind, type FamilyPlan } from "../engine";
import { usd } from "../lib/format";
import { Card } from "./ui";

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];
const KIND: Record<AfterSchoolKind, { emoji: string; cls: string }> = {
  parent: { emoji: "🏡", cls: "bg-[#e2dff0] border-[#9a95b3]" },
  helper: { emoji: "👵", cls: "bg-[#9ff0cf] border-[#14a36f]" },
  wfh: { emoji: "💻", cls: "bg-[#a9dcff] border-[#2b8fe0]" },
  leaveEarly: { emoji: "🏃", cls: "bg-[#ffd458] border-[#c48a00]" },
  program: { emoji: "🏫", cls: "bg-[#cfc2ff] border-[#6c47ff]" },
  sitter: { emoji: "🧸", cls: "bg-[#ffb4a6] border-[#f2492f]" },
  monthly: { emoji: "🗓️", cls: "bg-[#cfc2ff] border-[#6c47ff]" },
  carpool: { emoji: "🚗", cls: "bg-[#9ff0cf] border-[#14a36f]" },
  self: { emoji: "🎒", cls: "bg-[#e2dff0] border-[#9a95b3]" },
  none: { emoji: "⚠️", cls: "bg-[#d23a22] border-[#7a2013] text-white" },
};

export const DEFAULT_AFTER_SCHOOL: NonNullable<FamilyPlan["afterSchool"]> = {
  enabled: true,
  dismissal: "15:00",
  workEnds: "17:30",
  leaveEarlyCost: 40,
  options: [
    { id: "aftercare", name: "School after-care", kind: "program", price: 25, pricing: "perChild", billing: "day" },
    { id: "aftercare-month", name: "After-care, monthly plan", kind: "program", price: 280, pricing: "perChild", billing: "month", weekdays: [1, 2, 3, 4, 5] },
    { id: "pmsitter", name: "Afternoon sitter", kind: "sitter", price: 22, pricing: "perFamily", billing: "hour" },
  ],
};

/** The everyday gap: dismissal to the end of the workday, every school day. */
export function AfterSchoolCard({ plan, onChange }: { plan: FamilyPlan; onChange: (plan: FamilyPlan) => void }) {
  const settings = plan.afterSchool;
  const result = planAfterSchool(plan);

  if (!settings?.enabled || !result) {
    return (
      <section className="flex flex-wrap items-center gap-3 rounded-3xl border-2 border-b-4 border-teal-300 bg-teal-50 p-5">
        <span aria-hidden className="text-3xl">🎒</span>
        <p className="min-w-0 flex-1 text-sm font-bold text-slate-800">School lets out hours before work ends. Plan every school day's pickup too?</p>
        <button
          type="button"
          onClick={() => onChange({ ...plan, afterSchool: settings ? { ...settings, enabled: true } : DEFAULT_AFTER_SCHOOL })}
          className="rounded-2xl bg-teal-700 px-4 py-2.5 text-sm font-extrabold text-white"
        >
          Plan after school
        </button>
      </section>
    );
  }

  const saved = result.usualWay - result.total;
  const next = result.days.slice(0, 5);
  const kid = (id: string) => plan.children.find((c) => c.id === id)?.name ?? "?";

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span aria-hidden>🎒</span> After school, every school day
        </span>
      }
    >
      <p className="text-sm text-slate-600">
        School lets out at {to12h(settings.dismissal)}, work ends at {to12h(settings.workEnds)}. Your usual week:
      </p>
      <ol className="mt-3 grid grid-cols-5 gap-1.5 sm:gap-2">
        {result.week.map((w) => (
          <li key={w.weekday} className={`flex min-h-[7.5rem] flex-col rounded-2xl border-2 border-b-4 p-1.5 text-center sm:p-2 ${KIND[w.kind].cls}`}>
            <span className="text-xs font-extrabold uppercase">{DAY[w.weekday]}</span>
            <span aria-hidden className="mt-1 text-2xl">{KIND[w.kind].emoji}</span>
            <span className="mt-1 text-[11px] font-bold leading-tight sm:text-[12px]">{w.label}</span>
            <span className="mt-auto pt-1 font-[family-name:var(--font-display)] text-base font-bold">{w.cost ? usd(w.cost) : "Free"}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="a month, on average" value={usd(result.perMonth)} />
        <Stat label={`until summer (${result.days.length} school days)`} value={usd(result.total)} />
        <Stat label="saved vs. after-care every day" value={saved > 0 ? usd(saved) : "—"} />
      </div>
      <Decisions result={result} />
      {result.uncovered > 0 && (
        <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-sm font-bold text-red-800">⚠️ {result.uncovered} afternoons have nobody. Add after-care or a sitter in the Help tab.</p>
      )}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-bold text-slate-800">Next school days</summary>
        <ul className="mt-2 space-y-1">
          {next.map((d) => (
            <li key={d.date} className="flex justify-between gap-3 border-b border-slate-100 py-1">
              <span>
                <strong>{new Date(d.date + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</strong>{" "}
                {KIND[d.kind].emoji} {d.label}
                {d.childIds.length > 0 && d.kind !== "self" && <> · {d.childIds.map(kid).join(" & ")}</>}
                {d.kind !== "self" && d.notes.length > 0 && <span className="text-slate-500"> ({d.notes.join(", ")})</span>}
                {d.early && <span className="ml-1 rounded bg-amber-200 px-1 text-xs font-bold">early release, {d.hours} h</span>}
              </span>
              <span className="tabular-nums">{d.cost ? usd(d.cost) : "Free"}</span>
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-3 text-xs text-slate-500">
        Each afternoon takes the cheapest option available that day. Hourly sitters are priced for the hours from dismissal to the end of work, with extra hours on
        early-release days. Family and work-from-home count at half their full-day cost. Monthly plans and carpools are used only in the months or weeks where they
        save money. Change all of this in the Help tab.
      </p>
    </Card>
  );
}

function Decisions({ result }: { result: NonNullable<ReturnType<typeof planAfterSchool>> }) {
  const lines: string[] = [];
  const byOption = new Map<string, { name: string; taken: number; months: number; dropIn: number; fee: number }>();
  for (const m of result.monthly) {
    const e = byOption.get(m.optionId) ?? { name: m.name, taken: 0, months: 0, dropIn: 0, fee: 0 };
    e.months += 1;
    if (m.enrolled) e.taken += 1;
    else {
      e.dropIn += m.dropIn;
      e.fee += m.fee;
    }
    byOption.set(m.optionId, e);
  }
  for (const e of byOption.values()) {
    if (e.taken === e.months) lines.push(`🗓️ ${e.name}: enroll every month, it beats paying by the day.`);
    else if (e.taken > 0) lines.push(`🗓️ ${e.name}: enroll in ${e.taken} of ${e.months} months; in the others paying by the day is cheaper.`);
    else lines.push(`🗓️ ${e.name}: skip it. Paying by the day costs ${usd(e.dropIn)} vs. ${usd(e.fee)} in fees.`);
  }
  const pools = new Map<string, { name: string; used: number; weeks: number; saved: number }>();
  for (const c of result.carpools) {
    const e = pools.get(c.optionId) ?? { name: c.name, used: 0, weeks: 0, saved: 0 };
    e.weeks += 1;
    if (c.used) e.used += 1;
    e.saved += c.saved;
    pools.set(c.optionId, e);
  }
  for (const e of pools.values())
    lines.push(
      e.used > 0
        ? `🚗 ${e.name}: worth it in ${e.used} of ${e.weeks} weeks, saves ${usd(e.saved)}.`
        : `🚗 ${e.name}: not worth it. Your payback afternoons would cost more than it saves.`,
    );
  if (lines.length === 0) return null;
  return (
    <ul className="mt-3 space-y-1 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-center">
      <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs font-bold text-slate-500">{label}</p>
    </div>
  );
}

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}
