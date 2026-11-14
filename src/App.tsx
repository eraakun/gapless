import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { addDaysISO, planAfterSchool, decodePlan, localTodayISO, optimizePlan, sanitizePlan, typicalPlan, type FamilyPlan } from "./engine";
import { buildCoParentExample, buildExamplePlan } from "./data/example";
import { clearState, EMPTY_STATE, loadState, saveState, type SavedState } from "./state/storage";
import { SetupPanel } from "./components/SetupPanel";
import { Summary } from "./components/Summary";
import { SurpriseBar } from "./components/SurpriseBar";
import { YearCalendar } from "./components/YearCalendar";
import { Upcoming } from "./components/Upcoming";
import { CampsCard } from "./components/CampsCard";
import { download, ProTools } from "./components/ProTools";
import { PricingModal } from "./components/PricingModal";
import { QuickStart } from "./components/QuickStart";
import { CustodyCard } from "./components/CustodyCard";
import { Logo } from "./components/Logo";
import { HeroGrid, ResultBar } from "./components/Hero";
import { TasksCard } from "./components/TasksCard";
import { WhatIfCard } from "./components/WhatIfCard";
import { PrintReport } from "./components/PrintReport";
import { FsaCard } from "./components/FsaCard";
import { Tour } from "./components/Tour";
import { AfterSchoolCard } from "./components/AfterSchoolCard";
import { AssistantChat } from "./components/AssistantChat";
import { Card, Toggle } from "./components/ui";

const FREE_DAYS = 60;

function blankPlan(today: string): FamilyPlan {
  const year = Number(today.slice(0, 4)) + (today.slice(5) > "06-15" ? 1 : 0);
  return sanitizePlan(
    {
      today,
      horizonEnd: `${year}-08-21`,
      children: [{ id: "kid-1", name: "Child", age: 7, okWithWfhParent: false }],
      parents: [{ id: "parent-1", name: "Parent 1", workdays: [1, 2, 3, 4, 5], holidays: [], ptoDays: 10, sickReserve: 2, wfhDays: [] }],
      helpers: [],
      paidCare: [{ id: "sitter", name: "Babysitter", pricing: "perFamily", pricePerDay: 180, takesSickKids: true, availableInSummer: true }],
      camps: [],
      school: { closures: [], lastDay: `${year}-06-15`, nextFirstDay: `${year}-08-24` },
      settings: { ptoDayValue: 150, wfhPenalty: 40 },
      surprises: [],
      bookings: [],
    },
    today,
  );
}

export default function App() {
  const today = localTodayISO();
  const [state, setState] = useState<SavedState>(() => loadState(today));
  const [pricingOpen, setPricingOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => saveState(state), [state]);

  // A partner link (#plan=...) opens the shared plan, then cleans the URL.
  useEffect(() => {
    const match = /#plan=(.+)$/.exec(window.location.hash);
    if (!match) return;
    decodePlan(match[1])
      .then((raw) => {
        setState((s) => ({ ...s, plan: sanitizePlan(raw as FamilyPlan, today) }));
        setNotice("Opened the plan your partner shared. It's saved in this browser now.");
      })
      .catch(() => setNotice("That share link looks damaged. Ask for a new one."))
      .finally(() => history.replaceState(null, "", window.location.pathname));
  }, [today]);

  const plan = state.plan ?? blankPlan(today);
  const setPlan = (next: FamilyPlan) => setState((s) => ({ ...s, plan: next }));

  // The optimizer runs on a deferred copy so typing never lags.
  const deferred = useDeferredValue(plan);
  const clean = useMemo(() => sanitizePlan(deferred, today), [deferred, today]);
  const best = useMemo(() => optimizePlan(clean), [clean]);
  const typical = useMemo(() => typicalPlan(clean), [clean]);
  const afterSchool = useMemo(() => planAfterSchool(clean), [clean]);
  const ready = clean.children.length > 0 && clean.parents.length > 0;
  const visibleUntil = state.pro ? null : addDaysISO(clean.today, FREE_DAYS);

  const loadExample = () => {
    setState((s) => ({ ...s, plan: buildExamplePlan(today) }));
    setNotice(null);
    // First time someone opens the example: walk them through it.
    let seen = false;
    try {
      seen = localStorage.getItem("gapless:toured") === "1";
      localStorage.setItem("gapless:toured", "1");
    } catch {
      // Storage blocked: just show the tour.
    }
    if (!seen) setTimeout(() => setTourOpen(true), 700);
  };

  return (
    <div className="min-h-screen text-slate-900">
      <header className="relative z-30 border-b-2 border-slate-200 bg-white lg:sticky lg:top-0">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <a href="/" aria-label="Gapless home" className="rounded-md">
            <Logo />
          </a>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button type="button" onClick={loadExample} className={`rounded-xl bg-teal-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-teal-800 ${state.plan ? "" : "hidden sm:inline-block"}`}>
              Try with Realistic US Example
            </button>
            {state.plan && (
              <button type="button" onClick={() => setTourOpen(true)} className="rounded-xl border-2 border-slate-200 px-3 py-1.5 text-sm font-extrabold text-slate-700 hover:border-teal-300">
                🧭 Tour
              </button>
            )}
            <Toggle checked={state.pro} onChange={(pro) => setState((s) => ({ ...s, pro }))} label="Demo Unlock Pro" />
            <button type="button" onClick={() => setPricingOpen(true)} className="rounded-lg px-2 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
              Pricing
            </button>
          </div>
        </div>
        {state.plan && ready && <ResultBar best={best} typical={typical} afterSchoolPerMonth={afterSchool?.perMonth ?? null} />}
      </header>

      {notice && (
        <div className="mx-auto mt-4 max-w-7xl px-4">
          <p className="sticky-note max-w-2xl px-4 py-3 text-[15px] font-semibold text-slate-900">💡 {notice}</p>
        </div>
      )}

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[400px_1fr]">
        <aside className="min-w-0 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <SetupPanel plan={plan} onChange={setPlan} />
          {state.plan && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white p-3 text-sm">
              <span className="font-extrabold text-slate-700">💾 Backup</span>
              <button
                type="button"
                onClick={() => download(`gapless-plan-${today}.json`, JSON.stringify(plan, null, 2), "application/json")}
                className="rounded-xl border-2 border-slate-200 px-3 py-1.5 font-bold text-slate-700 hover:border-teal-300"
              >
                Save file
              </button>
              <label className="cursor-pointer rounded-xl border-2 border-slate-200 px-3 py-1.5 font-bold text-slate-700 hover:border-teal-300">
                Restore
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      const restored = sanitizePlan(JSON.parse(await file.text()) as FamilyPlan, today);
                      setState((s) => ({ ...s, plan: restored }));
                      setNotice(`Restored your plan from ${file.name}.`);
                    } catch {
                      setNotice("That file isn't a Gapless plan. Use a file saved with Save file.");
                    }
                  }}
                />
              </label>
              <span className="w-full text-xs text-slate-500">Your plan lives only in this browser. Save a file to keep it safe or move it to another device.</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              clearState();
              setState({ ...EMPTY_STATE, pro: state.pro });
            }}
            className="mt-3 text-xs text-slate-500 underline hover:text-slate-800"
          >
            Start over (clears everything saved in this browser)
          </button>
        </aside>

        {/* Results first on small screens, so the plan is the first thing you see. */}
        <div className="order-first min-w-0 space-y-6 lg:order-none">
          {!state.plan && (
            <section className="overflow-hidden rounded-[2rem] border-2 border-b-4 border-teal-900 bg-white">
              <div className="bg-teal-700 p-6 text-white sm:p-10">
                <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-sm font-bold">For working parents in the US</p>
                <h1 className="mt-4 max-w-3xl text-[2.2rem] text-white sm:text-[3.2rem]">
                  School is out <span className="text-amber-300">83 weekdays</span> a year. You get about 16 off.
                </h1>
                <HeroGrid />
                <p className="mt-6 max-w-2xl text-lg text-teal-100">
                  Gapless fills the other 67 for the least money, and plans every school day's 3-to-5:30 pickup too: whose day off, which vacation days,
                  when Grandma helps, which camp weeks are worth it, and when after-care or a sitter wins. No sign-up. Nothing leaves your browser.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button type="button" onClick={loadExample} className="rounded-2xl bg-amber-400 px-5 py-3 text-base font-extrabold text-slate-900 hover:bg-amber-300">
                    ▶ Try with Realistic US Example
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setState((s) => ({ ...s, plan: buildCoParentExample(today) }));
                      setNotice("Co-parenting example: Dana and Marcus live apart on a 2-2-5-5 schedule. Switch “I'm Dana / I'm Marcus” to see each side.");
                    }}
                    className="rounded-2xl border-2 border-white px-5 py-3 text-base font-extrabold text-white hover:bg-white/10"
                  >
                    🏠🏠 Same family, two homes
                  </button>
                </div>
                <p className="mt-3 text-sm text-teal-100">A two-income family in Fairfax, VA, on the 2026–27 FCPS calendar. The second is the same family after a divorce.</p>
              </div>
              <div className="p-6 sm:p-10">
                <QuickStart
                today={today}
                onDone={(next) => {
                  setPlan(next);
                  setNotice("Your plan is ready. Replace the sitter and camp prices with yours in the panel for an exact number.");
                }}
              />
              </div>
            </section>
          )}

          {!state.plan ? null : ready ? (
            <>
              <div data-tour="summary" className="rounded-[2rem]">
                <Summary plan={clean} best={best} typical={typical} visibleUntil={visibleUntil} />
              </div>
              <div data-tour="afterschool" className="rounded-3xl">
                <AfterSchoolCard plan={clean} onChange={(next) => setPlan({ ...plan, afterSchool: next.afterSchool })} />
              </div>
              {clean.custody && plan.custody && <CustodyCard key={plan.custody.parentA + plan.custody.parentB} plan={plan} coverage={best} onChange={setPlan} />}
              <FsaCard plan={clean} coverage={best} onChange={(next) => setPlan({ ...plan, settings: next.settings })} />
              <div data-tour="tasks" className="rounded-3xl">
                <TasksCard plan={clean} coverage={best} onChange={(next) => setPlan({ ...plan, doneTasks: next.doneTasks })} />
              </div>
              <div data-tour="sick" className="rounded-3xl">
                <SurpriseBar key={`${clean.today}-${clean.children.map((c) => c.id).join()}`} plan={plan} onChange={setPlan} />
              </div>
              <div className="grid gap-6 xl:grid-cols-2">
                <div data-tour="upcoming" className="rounded-3xl">
                  <Upcoming plan={clean} coverage={best} />
                </div>
                <CampsCard plan={plan} coverage={best} onChange={setPlan} />
              </div>
              <div data-tour="whatif" className="rounded-3xl">
                <WhatIfCard plan={clean} current={best} />
              </div>
              <YearCalendar plan={clean} coverage={best} visibleUntil={visibleUntil} onUnlock={() => setPricingOpen(true)} />
              <ProTools plan={clean} coverage={best} pro={state.pro} onUpgrade={() => setPricingOpen(true)} />
            </>
          ) : (
            <Card>
              <p className="text-sm text-slate-600">Add at least one child and one parent to see your plan.</p>
            </Card>
          )}
        </div>
      </main>

      <footer className="mx-auto max-w-7xl px-4 pb-10 text-xs text-slate-500">
        Your family's details stay in this browser (localStorage) unless you create a share link. Gapless is a planning tool; check dates with your
        school district and providers.
      </footer>

      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} onDemoUnlock={() => setState((s) => ({ ...s, pro: true }))} />
      {state.plan && ready && <PrintReport plan={clean} coverage={best} />}
      {state.plan && ready && <AssistantChat plan={plan} clean={clean} best={best} onChange={setPlan} />}
    </div>
  );
}
