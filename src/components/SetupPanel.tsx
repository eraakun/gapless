import { useState, type ReactNode } from "react";
import { addDaysISO, parseDateList, parseEarlyReleaseIcs, parseSchoolIcs, type Camp, type Child, type FamilyPlan, type Helper, type PaidCare, type Parent } from "../engine";
import { newId, plural } from "../lib/format";
import { Card, NumberField } from "./ui";
import { DISTRICTS } from "../data/districts";
import { CustodySetup } from "./CustodySetup";
import { DEFAULT_AFTER_SCHOOL } from "./AfterSchoolCard";

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
type ListKey = "children" | "parents" | "helpers" | "paidCare" | "camps";
type Tab = "family" | "school" | "help" | "camps" | "priorities";
const TAB_EMOJI: Record<Tab, string> = { family: "👨‍👩‍👧", school: "🏫", help: "👵", camps: "⛺", priorities: "⚖️" };

interface Props {
  plan: FamilyPlan;
  onChange: (plan: FamilyPlan) => void;
}

/** Everything the planner needs to know about the family, in the order a parent thinks about it. */
export function SetupPanel({ plan, onChange }: Props) {
  const set = <K extends keyof FamilyPlan>(key: K, value: FamilyPlan[K]) => onChange({ ...plan, [key]: value });
  const patch = <T extends { id: string }>(key: ListKey, id: string, change: Partial<T>) =>
    set(key, (plan[key] as unknown as T[]).map((x) => (x.id === id ? { ...x, ...change } : x)) as never);
  const remove = (key: ListKey, id: string) => set(key, (plan[key] as Array<{ id: string }>).filter((x) => x.id !== id) as never);
  const [tab, setTab] = useState<Tab>("family");
  const tabs: Array<[Tab, string, number | null]> = [
    ["family", "Family", plan.children.length + plan.parents.length],
    ["school", "School", plan.school.closures.length],
    ["help", "Help", plan.helpers.length + plan.paidCare.length],
    ["camps", "Camps", plan.camps.length],
    ["priorities", "Values", null],
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Your family's details" className="sticky top-0 z-10 -mx-1 grid grid-cols-5 gap-1.5 rounded-2xl bg-[#f4f1ff]/95 px-1 py-1.5 backdrop-blur">
        {tabs.map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-b-4 px-1 py-1.5 text-[12px] font-extrabold ${
              tab === id ? "border-teal-900 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-teal-300"
            }`}
          >
            <span aria-hidden className="text-lg leading-none">{TAB_EMOJI[id]}</span>
            {label}
            {count !== null && (
              <span className={`absolute -top-1.5 -right-1 rounded-full px-1.5 text-[10px] leading-4 tabular-nums ${tab === id ? "bg-amber-400 text-slate-900" : "bg-slate-200 text-slate-700"}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "family" && (
        <>
      <Section title="Kids" onAdd={() => set("children", [...plan.children, { id: newId("kid"), name: "Child", age: 7, okWithWfhParent: false }])}>
        {plan.children.map((c) => (
          <Row key={c.id} onRemove={() => remove("children", c.id)} label={c.name}>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <TextField label="Name" value={c.name} onChange={(name) => patch<Child>("children", c.id, { name })} />
              <NumberField label="Age" min={0} max={18} value={c.age} onChange={(age) => patch<Child>("children", c.id, { age })} />
            </div>
            <Check label="OK home while a parent works from home" checked={c.okWithWfhParent} onChange={(v) => patch<Child>("children", c.id, { okWithWfhParent: v })} />
            <Check
              label="Gets home alone after school (no pickup needed)"
              checked={!!c.homeAloneAfterSchool}
              onChange={(v) => patch<Child>("children", c.id, { homeAloneAfterSchool: v || undefined })}
            />
            <ActivitiesField value={c.activities ?? []} workEnds={plan.afterSchool?.workEnds ?? "17:30"} onChange={(activities) => patch<Child>("children", c.id, { activities: activities.length ? activities : undefined })} />
            {(plan.otherSchools?.length ?? 0) > 0 && (
              <Select
                label="School"
                value={c.schoolId ?? ""}
                options={[["", plan.schoolName || "Main school"], ...(plan.otherSchools ?? []).map((o) => [o.id, o.name] as [string, string])]}
                onChange={(schoolId) => patch<Child>("children", c.id, { schoolId: schoolId || undefined })}
              />
            )}
          </Row>
        ))}
      </Section>

      <Section
        title="Parents"
        onAdd={
          plan.parents.length < 2
            ? () =>
                set("parents", [
                  ...plan.parents,
                  { id: newId("parent"), name: "Parent", workdays: [1, 2, 3, 4, 5], holidays: [], ptoDays: 10, sickReserve: 2, wfhDays: [] },
                ])
            : undefined
        }
      >
        {plan.parents.map((p) => (
          <Row key={p.id} onRemove={() => remove("parents", p.id)} label={p.name}>
            <TextField label="Name" value={p.name} onChange={(name) => patch<Parent>("parents", p.id, { name })} />
            <DayPicker label="Works on" value={p.workdays} onChange={(workdays) => patch<Parent>("parents", p.id, { workdays })} />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Vacation days left" min={0} value={p.ptoDays} onChange={(ptoDays) => patch<Parent>("parents", p.id, { ptoDays })} />
              <NumberField label="Keep for sick days" min={0} value={p.sickReserve} onChange={(sickReserve) => patch<Parent>("parents", p.id, { sickReserve })} />
            </div>
            <DayPicker label="Can work from home on" value={p.wfhDays} onChange={(wfhDays) => patch<Parent>("parents", p.id, { wfhDays })} />
            <DayPicker label="Can leave early for school pickup on" value={p.pickupDays ?? []} onChange={(pickupDays) => patch<Parent>("parents", p.id, { pickupDays })} />
            <DatesField label={`Employer holidays (${p.holidays.length})`} dates={p.holidays} onChange={(holidays) => patch<Parent>("parents", p.id, { holidays })} />
          </Row>
        ))}
      </Section>

      <CustodySetup plan={plan} onChange={onChange} />
        </>
      )}

      {tab === "school" && <SchoolSection plan={plan} onChange={onChange} />}

      {tab === "help" && (
        <>
      <AfterSchoolSetup plan={plan} onChange={onChange} />
      <Section
        title="Family & friends"
        hint="Grandparents, a neighbor you swap days with."
        onAdd={() => set("helpers", [...plan.helpers, { id: newId("helper"), name: "Helper", weekdays: [2, 4], maxDays: 5, costPerDay: 0, takesSickKids: true }])}
      >
        {plan.helpers.map((h) => (
          <Row key={h.id} onRemove={() => remove("helpers", h.id)} label={h.name}>
            <TextField label="Name" value={h.name} onChange={(name) => patch<Helper>("helpers", h.id, { name })} />
            <DayPicker label="Can help on" value={h.weekdays} onChange={(weekdays) => patch<Helper>("helpers", h.id, { weekdays })} />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Max days total" min={0} value={h.maxDays} onChange={(maxDays) => patch<Helper>("helpers", h.id, { maxDays })} />
              <NumberField label="Cost per day" prefix="$" min={0} value={h.costPerDay} onChange={(costPerDay) => patch<Helper>("helpers", h.id, { costPerDay })} />
            </div>
            <Check label="Will watch a sick kid" checked={h.takesSickKids} onChange={(v) => patch<Helper>("helpers", h.id, { takesSickKids: v })} />
            <Check label="Also picks up after school on these days" checked={h.afterSchool !== false} onChange={(v) => patch<Helper>("helpers", h.id, { afterSchool: v ? undefined : false })} />
            <DatesField label={`Can't help on (${(h.unavailable ?? []).length})`} dates={h.unavailable ?? []} onChange={(unavailable) => patch<Helper>("helpers", h.id, { unavailable })} />
            {plan.custody && (
              <Select
                label="Helps at"
                value={h.home ?? ""}
                options={[["", "Either home"], ...plan.parents.map((p) => [p.id, `${p.name}'s home only`] as [string, string])]}
                onChange={(home) => patch<Helper>("helpers", h.id, { home: home || undefined })}
              />
            )}
          </Row>
        ))}
      </Section>

      <Section
        title="Paid by the day"
        hint="Drop-in programs, babysitters, backup care."
        onAdd={() =>
          set("paidCare", [...plan.paidCare, { id: newId("paid"), name: "Babysitter", pricing: "perFamily", pricePerDay: 180, takesSickKids: true, availableInSummer: true }])
        }
      >
        {plan.paidCare.map((c) => (
          <Row key={c.id} onRemove={() => remove("paidCare", c.id)} label={c.name}>
            <TextField label="Name" value={c.name} onChange={(name) => patch<PaidCare>("paidCare", c.id, { name })} />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Price per day" prefix="$" min={0} value={c.pricePerDay} onChange={(pricePerDay) => patch<PaidCare>("paidCare", c.id, { pricePerDay })} />
              <Select
                label="Priced"
                value={c.pricing}
                options={[
                  ["perChild", "per child"],
                  ["perFamily", "for all kids"],
                ]}
                onChange={(pricing) => patch<PaidCare>("paidCare", c.id, { pricing: pricing as PaidCare["pricing"] })}
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Check label="Takes sick kids" checked={c.takesSickKids} onChange={(v) => patch<PaidCare>("paidCare", c.id, { takesSickKids: v })} />
              <Check label="Open in summer" checked={c.availableInSummer} onChange={(v) => patch<PaidCare>("paidCare", c.id, { availableInSummer: v })} />
            </div>
          </Row>
        ))}
      </Section>

        </>
      )}

      {tab === "camps" && (
      <Section
        title="Camps"
        hint="Billed by the week, per child."
        onAdd={() =>
          set("camps", [
            ...plan.camps,
            { id: newId("camp"), name: "Day camp", start: plan.school.lastDay, end: plan.school.nextFirstDay, pricePerChildWeek: 300, minAge: 5, maxAge: 12 },
          ])
        }
      >
        {plan.camps.map((c) => (
          <Row key={c.id} onRemove={() => remove("camps", c.id)} label={c.name}>
            <TextField label="Name" value={c.name} onChange={(name) => patch<Camp>("camps", c.id, { name })} />
            <div className="grid grid-cols-2 gap-2">
              <DateField label="Runs from" value={c.start} onChange={(start) => patch<Camp>("camps", c.id, { start })} />
              <DateField label="to" value={c.end} onChange={(end) => patch<Camp>("camps", c.id, { end })} />
              <NumberField label="Per child / week" prefix="$" min={0} value={c.pricePerChildWeek} onChange={(v) => patch<Camp>("camps", c.id, { pricePerChildWeek: v })} />
              <DateField label="Register by" value={c.registerBy ?? ""} onChange={(registerBy) => patch<Camp>("camps", c.id, { registerBy: registerBy || undefined })} />
              <NumberField label="Min age" min={0} max={18} value={c.minAge} onChange={(minAge) => patch<Camp>("camps", c.id, { minAge })} />
              <NumberField label="Max age" min={0} max={18} value={c.maxAge} onChange={(maxAge) => patch<Camp>("camps", c.id, { maxAge })} />
            </div>
          </Row>
        ))}
      </Section>
      )}

      {tab === "priorities" && (
      <Card title="What matters to you">
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="A vacation day is worth" prefix="$" min={0} value={plan.settings.ptoDayValue} onChange={(ptoDayValue) => set("settings", { ...plan.settings, ptoDayValue })} />
          <NumberField label="Cost of working with a kid home" prefix="$" min={0} value={plan.settings.wfhPenalty} onChange={(wfhPenalty) => set("settings", { ...plan.settings, wfhPenalty })} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Gapless only spends a vacation day when it saves more than this. Raise it to protect a family trip; lower it to save cash.
        </p>
      </Card>
      )}

      {tab === "priorities" && (
      <Card title="Taxes">
        <Check
          label="An employer offers a Dependent Care FSA"
          checked={Boolean(plan.settings.fsaEnabled)}
          onChange={(fsaEnabled) => set("settings", { ...plan.settings, fsaEnabled })}
        />
        {plan.settings.fsaEnabled && (
          <div className="mt-3">
            <NumberField label="Your combined tax rate" prefix="%" min={0} max={60} value={plan.settings.taxRate ?? 30} onChange={(taxRate) => set("settings", { ...plan.settings, taxRate })} />
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Sitters, drop-in programs and day camps can be paid with pre-tax dollars, up to $7,500 per household in 2026. Federal + payroll + state is often 25–35%; check your
          own.
        </p>
      </Card>
      )}
    </div>
  );
}

function SchoolSection({ plan, onChange }: Props) {
  const others = plan.otherSchools ?? [];
  const setOthers = (next: NonNullable<FamilyPlan["otherSchools"]>) => onChange({ ...plan, otherSchools: next });
  return (
    <div className="space-y-4">
      <CalendarEditor
        title={plan.schoolName || (others.length > 0 ? "Main school" : "School calendar")}
        name={plan.schoolName ?? ""}
        onName={others.length > 0 ? (schoolName) => onChange({ ...plan, schoolName }) : undefined}
        calendar={plan.school}
        onChange={(school, fromPreset) =>
          onChange({ ...plan, school, ...(fromPreset ? { horizonEnd: addDaysISO(school.nextFirstDay, -1) } : {}) })
        }
      />
      {others.map((o) => (
        <CalendarEditor
          key={o.id}
          title={o.name}
          name={o.name}
          onName={(name) => setOthers(others.map((x) => (x.id === o.id ? { ...x, name } : x)))}
          calendar={o.calendar}
          onChange={(calendar) => setOthers(others.map((x) => (x.id === o.id ? { ...x, calendar } : x)))}
          onRemove={() =>
            onChange({
              ...plan,
              otherSchools: others.filter((x) => x.id !== o.id),
              children: plan.children.map((c) => (c.schoolId === o.id ? { ...c, schoolId: undefined } : c)),
            })
          }
        />
      ))}
      <button
        type="button"
        onClick={() => setOthers([...others, { id: newId("school"), name: `School ${others.length + 2}`, calendar: { ...plan.school, closures: [...plan.school.closures], earlyRelease: [] } }])}
        className="w-full rounded-2xl border-2 border-dashed border-slate-300 px-4 py-3 text-sm font-extrabold text-teal-700 hover:border-teal-300"
      >
        + Kids at another school? Add its calendar
      </button>
      {others.length > 0 && <p className="text-xs text-slate-500">Pick each kid's school in the Family tab.</p>}
    </div>
  );
}

/** One school's calendar: district preset, summer dates, .ics import, pasted dates, early-release days. */
function CalendarEditor({
  title,
  name,
  onName,
  calendar,
  onChange,
  onRemove,
}: {
  title: string;
  name: string;
  onName?: (name: string) => void;
  calendar: FamilyPlan["school"];
  onChange: (calendar: FamilyPlan["school"], fromPreset?: boolean) => void;
  onRemove?: () => void;
}) {
  const [paste, setPaste] = useState("");
  const [early, setEarly] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const set = (change: Partial<FamilyPlan["school"]>) => onChange({ ...calendar, ...change });
  const earlyDays = calendar.earlyRelease ?? [];
  const merge = (dates: string[], source: string) => {
    const merged = [...new Set([...calendar.closures, ...dates])].sort();
    set({ closures: merged });
    setNote(`Added ${plural(merged.length - calendar.closures.length, "new day")} from ${source}.`);
  };

  return (
    <Card
      title={title}
      aside={
        onRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${title}`} className="rounded px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100">
            Remove
          </button>
        )
      }
    >
      {onName && <TextField label="School name" value={name} onChange={onName} />}
      <p className="mt-2 text-sm text-slate-600">
        {plural(calendar.closures.length, "no-school weekday")} during the year, then summer.
        {earlyDays.length > 0 && ` ${plural(earlyDays.length, "early-release day")}.`}
      </p>
      <label className="mt-3 block text-xs font-medium text-slate-600">
        Pick a district (2026–27)
        <select
          value=""
          onChange={(e) => {
            const d = DISTRICTS.find((x) => x.id === e.target.value);
            if (!d) return;
            onChange({ ...d.calendar, closures: [...d.calendar.closures], earlyRelease: [...(d.calendar.earlyRelease ?? [])] }, true);
            setNote(`Loaded ${d.name}: ${plural(d.calendar.closures.length, "no-school weekday")}.${d.caveat ? " " + d.caveat : ""}`);
          }}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
        >
          <option value="">Choose to load its calendar…</option>
          {DISTRICTS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <DateField label="Last day before summer" value={calendar.lastDay} onChange={(lastDay) => set({ lastDay })} />
        <DateField label="Next school year starts" value={calendar.nextFirstDay} onChange={(nextFirstDay) => set({ nextFirstDay })} />
      </div>
      <label className="mt-3 block text-xs font-medium text-slate-600">
        Not listed? Import the school's calendar (.ics)
        <input
          type="file"
          accept=".ics,text/calendar"
          className="mt-1 block w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            const found = parseSchoolIcs(text);
            const halfDays = parseEarlyReleaseIcs(text).map((x) => x.date);
            const closures = [...new Set([...calendar.closures, ...found.map((f) => f.date)])].sort();
            const earlyRelease = [...new Set([...earlyDays, ...halfDays])].sort();
            set({ closures, earlyRelease });
            setNote(
              found.length + halfDays.length === 0
                ? "No closure or early-release days found in that file. Try pasting the dates instead."
                : `From ${file.name}: ${plural(closures.length - calendar.closures.length, "new day")} off and ${plural(earlyRelease.length - earlyDays.length, "early-release day")}.`,
            );
            e.target.value = "";
          }}
        />
      </label>
      <label className="mt-3 block text-xs font-medium text-slate-600">
        Or paste days off (1/29/2027, 2027-02-01, 3/22/2027 - 3/26/2027)
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!paste.trim()}
          onClick={() => {
            merge(parseDateList(paste), "your list");
            setPaste("");
          }}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          Add days off
        </button>
        {calendar.closures.length > 0 && (
          <button type="button" onClick={() => set({ closures: [] })} className="text-xs text-slate-500 underline">
            Clear all
          </button>
        )}
      </div>
      <label className="mt-3 block text-xs font-medium text-slate-600">
        Early-release days (school ends at midday)
        <textarea value={early} onChange={(e) => setEarly(e.target.value)} rows={1} placeholder="11/25/2026, 3/3/2027" className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!early.trim()}
          onClick={() => {
            const next = [...new Set([...earlyDays, ...parseDateList(early)])].sort();
            set({ earlyRelease: next });
            setNote(`Added ${plural(next.length - earlyDays.length, "early-release day")}. You'll get a pickup reminder for each.`);
            setEarly("");
          }}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          Add early-release days
        </button>
        {earlyDays.length > 0 && (
          <button type="button" onClick={() => set({ earlyRelease: [] })} className="text-xs text-slate-500 underline">
            Clear
          </button>
        )}
      </div>
      {note && <p className="mt-2 text-xs text-teal-700">{note}</p>}
    </Card>
  );
}

function AfterSchoolSetup({ plan, onChange }: Props) {
  const a = plan.afterSchool ?? { ...DEFAULT_AFTER_SCHOOL, enabled: false };
  const set = (change: Partial<NonNullable<FamilyPlan["afterSchool"]>>) => onChange({ ...plan, afterSchool: { ...a, ...change } });
  const setOption = (id: string, change: Partial<NonNullable<FamilyPlan["afterSchool"]>["options"][number]>) =>
    set({ options: a.options.map((o) => (o.id === id ? { ...o, ...change } : o)) });
  return (
    <Card title="After school">
      <Check label="Plan pickups every school day" checked={a.enabled} onChange={(enabled) => set({ enabled })} />
      {a.enabled && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <TimeField label="School lets out" value={a.dismissal} onChange={(dismissal) => set({ dismissal })} />
            <TimeField label="Work ends" value={a.workEnds} onChange={(workEnds) => set({ workEnds })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Cost of leaving work early, once" prefix="$" min={0} value={a.leaveEarlyCost} onChange={(leaveEarlyCost) => set({ leaveEarlyCost })} />
            <NumberField
              label="Extra hours on early-release days"
              min={0}
              max={6}
              value={a.earlyReleaseExtraHours ?? 2}
              onChange={(earlyReleaseExtraHours) => set({ earlyReleaseExtraHours })}
            />
          </div>
          {a.options.map((o) => {
            const type = o.kind === "carpool" ? "carpool" : (o.billing ?? "day");
            const priceLabel = type === "hour" ? "Price per hour" : type === "month" ? "Price per month" : "Price per afternoon";
            return (
              <Row key={o.id} label={o.name} onRemove={() => set({ options: a.options.filter((x) => x.id !== o.id) })}>
                <div className="grid grid-cols-2 gap-2">
                  <TextField label="Name" value={o.name} onChange={(name) => setOption(o.id, { name })} />
                  <Select
                    label="Type"
                    value={type}
                    options={[
                      ["day", "Per afternoon"],
                      ["hour", "Per hour"],
                      ["month", "Monthly plan"],
                      ["carpool", "Carpool swap"],
                    ]}
                    onChange={(t) =>
                      setOption(
                        o.id,
                        t === "carpool"
                          ? { kind: "carpool", billing: undefined, price: 0, weekdays: o.weekdays ?? [1], payback: o.payback ?? [4] }
                          : { kind: o.kind === "carpool" ? "program" : o.kind, billing: t as "day" | "hour" | "month", payback: undefined },
                      )
                    }
                  />
                </div>
                {type === "carpool" ? (
                  <>
                    <DayPicker label="They pick up your kids on" value={o.weekdays ?? []} onChange={(weekdays) => setOption(o.id, { weekdays })} />
                    <DayPicker label="You pick up theirs on" value={o.payback ?? []} onChange={(payback) => setOption(o.id, { payback })} />
                    <p className="text-xs text-slate-500">Used only in weeks where a parent can do your pickups and it saves money.</p>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField label={priceLabel} prefix="$" min={0} value={o.price} onChange={(price) => setOption(o.id, { price })} />
                      <Select
                        label="Priced"
                        value={o.pricing}
                        options={[
                          ["perChild", "per child"],
                          ["perFamily", "for all kids"],
                        ]}
                        onChange={(pricing) => setOption(o.id, { pricing: pricing as "perChild" | "perFamily" })}
                      />
                    </div>
                    {type === "month" && (
                      <DayPicker label="Days the plan covers" value={o.weekdays ?? [1, 2, 3, 4, 5]} onChange={(weekdays) => setOption(o.id, { weekdays })} />
                    )}
                  </>
                )}
              </Row>
            );
          })}
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              onClick={() => set({ options: [...a.options, { id: newId("after"), name: "After-care", kind: "program", price: 25, pricing: "perChild", billing: "day" }] })}
              className="text-sm font-bold text-teal-700"
            >
              + After-care or sitter
            </button>
            <button
              type="button"
              onClick={() =>
                set({ options: [...a.options, { id: newId("carpool"), name: "Carpool with neighbors", kind: "carpool", price: 0, pricing: "perFamily", weekdays: [1], payback: [4] }] })
              }
              className="text-sm font-bold text-teal-700"
            >
              + Carpool swap
            </button>
          </div>
          <p className="text-xs text-slate-500">Parents' pickup days are in the Family tab; Grandma's days are below.</p>
        </div>
      )}
    </Card>
  );
}

type ActivityList = NonNullable<Child["activities"]>;

/** One-tap starting points; days and end time stay editable. */
const ACTIVITY_PRESETS: Array<{ emoji: string; name: string; weekdays: number[]; until: string }> = [
  { emoji: "⚽", name: "Soccer", weekdays: [2, 4], until: "17:00" },
  { emoji: "🏊", name: "Swim", weekdays: [1, 3], until: "16:30" },
  { emoji: "🏀", name: "Basketball", weekdays: [1, 3], until: "17:00" },
  { emoji: "🥋", name: "Karate", weekdays: [2, 4], until: "16:30" },
  { emoji: "🎹", name: "Piano", weekdays: [3], until: "16:00" },
  { emoji: "🎨", name: "Art club", weekdays: [5], until: "16:15" },
];
const emojiFor = (name: string) => ACTIVITY_PRESETS.find((p) => name.toLowerCase().includes(p.name.toLowerCase().split(" ")[0]))?.emoji ?? "⭐";

/** Weekly activities: one entry per activity, with the days it meets and when it ends. */
function ActivitiesField({ value, workEnds, onChange }: { value: ActivityList; workEnds: string; onChange: (v: ActivityList) => void }) {
  const update = (i: number, change: Partial<ActivityList[number]>) => onChange(value.map((x, j) => (j === i ? { ...x, ...change } : x)));
  const has = (name: string) => value.some((a) => a.name.toLowerCase() === name.toLowerCase());
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-slate-600">After-school activities</legend>
      {value.map((a, i) => (
        <div key={i} className="space-y-2 rounded-xl border-2 border-slate-200 bg-white p-2.5">
          <div className="flex items-end gap-2">
            <span aria-hidden className="pb-1 text-xl">{emojiFor(a.name)}</span>
            <div className="min-w-0 flex-1">
              <TextField label="Activity" value={a.name} onChange={(name) => update(i, { name })} />
            </div>
            <button type="button" aria-label={`Remove ${a.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="h-8 w-8 rounded text-slate-500 hover:bg-slate-200">
              ×
            </button>
          </div>
          <DayPicker label={`${a.name} on`} value={a.weekdays} onChange={(weekdays) => update(i, { weekdays })} />
          <div className="flex flex-wrap items-end gap-3">
            <Check label="Runs until work ends" checked={!a.until} onChange={(v) => update(i, { until: v ? undefined : "16:30" })} />
            {a.until && (
              <div className="w-32">
                <TimeField label="Ends at" value={a.until} onChange={(until) => update(i, { until })} />
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {a.weekdays.length === 0
              ? "Pick the days it meets."
              : a.until && a.until < workEnds
                ? "Pickup is planned from when it ends."
                : "No pickup needed those afternoons."}
          </p>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {ACTIVITY_PRESETS.filter((p) => !has(p.name)).map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => onChange([...value, { name: p.name, weekdays: p.weekdays, until: p.until }])}
            className="rounded-full border-2 border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 hover:border-teal-300"
          >
            {p.emoji} {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange([...value, { name: "Activity", weekdays: [], until: "16:30" }])}
          className="rounded-full border-2 border-dashed border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-600 hover:border-slate-400"
        >
          + Other
        </button>
      </div>
    </fieldset>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input type="time" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900" />
    </label>
  );
}

function Section({ title, hint, onAdd, children }: { title: string; hint?: string; onAdd?: () => void; children: ReactNode }) {
  return (
    <Card
      title={title}
      aside={
        onAdd && (
          <button type="button" onClick={onAdd} aria-label={`Add to ${title}`} className="rounded px-2 py-1 text-sm font-bold text-teal-700 hover:bg-teal-50">
            + Add
          </button>
        )
      }
    >
      {hint && <p className="-mt-2 mb-3 text-xs text-slate-500">{hint}</p>}
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

function Row({ label, onRemove, children }: { label: string; onRemove: () => void; children: ReactNode }) {
  return (
    <div className="relative space-y-2 rounded-lg bg-slate-50 p-3 pr-10">
      <button
        type="button"
        aria-label={`Remove ${label}`}
        title={`Remove ${label}`}
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 inline-flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-900"
      >
        <span aria-hidden>×</span>
      </button>
      {children}
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900" />
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900" />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-teal-600" />
      {label}
    </label>
  );
}

function DayPicker({ label, value, onChange }: { label: string; value: number[]; onChange: (v: number[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-slate-600">{label}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((d) => {
          const on = value.includes(d);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={on}
              aria-label={`${label} ${DAYS[d]}`}
              onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
              className={`h-8 w-9 rounded-lg text-xs font-semibold ${on ? "bg-teal-700 text-white" : "border border-slate-300 bg-white text-slate-500"}`}
            >
              {DAYS[d]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function DatesField({ label, dates, onChange }: { label: string; dates: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-medium text-slate-600">{label}</summary>
      <p className="mt-1 text-slate-500">{dates.length ? dates.join(", ") : "None yet."}</p>
      <div className="mt-1 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="12/24/2026, 2027-07-05" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs" />
        <button
          type="button"
          onClick={() => {
            onChange([...new Set([...dates, ...parseDateList(text)])].sort());
            setText("");
          }}
          className="rounded-lg bg-slate-900 px-2 text-white"
        >
          Add
        </button>
        {dates.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-slate-500 underline">
            Clear
          </button>
        )}
      </div>
    </details>
  );
}
