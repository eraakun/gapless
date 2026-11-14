import { useEffect, useState } from "react";

const STEPS: Array<{ target: string; title: string; body: string }> = [
  {
    target: "summary",
    title: "The answer, in one line",
    body: "Every no-school day until next fall, and the cheapest way to cover all of them. Compare it with \"the usual way\" at the bottom.",
  },
  {
    target: "afterschool",
    title: "Every school day, too",
    body: "School ends at 3, work at 5:30. Gapless plans every afternoon's pickup: Dana when she's off, Grandma on her days, after-care only when nobody else can.",
  },
  {
    target: "upcoming",
    title: "Tap \"Why?\" on any day",
    body: "Each choice is explained in your own numbers, with a Plan B if Grandma or the sitter cancels.",
  },
  {
    target: "tasks",
    title: "From plan to done",
    body: "The plan turns into a to-do list with due dates, and every message is already written: the text to the sitter or Grandma, the vacation request to your manager. One tap opens it in Messages or Mail.",
  },
  {
    target: "whatif",
    title: "What if…?",
    body: "Grandma can't help, prices go up, a kid is sick for a week: every scenario is re-planned from scratch.",
  },
  {
    target: "sick",
    title: "When a kid wakes up sick",
    body: "Pick the day, tap Re-plan. The rest of the year adjusts around it.",
  },
  {
    target: "assistant",
    title: "Or just tell Gapless",
    body: "Type \"Leo is sick tomorrow\" or \"Grandma can't help in December\". It shows what it understood, you tap Apply, and the plan updates. Try the two-homes example next, for separated parents.",
  },
];

/** A short guided tour over the live plan, for first-time visitors and judges. */
export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].target}"]`);
    if (!el) return;
    el.classList.add("tour-target");
    el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    return () => el.classList.remove("tour-target");
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div role="dialog" aria-modal="false" aria-labelledby="tour-title" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-3xl border-2 border-b-4 border-teal-900 bg-white p-5 shadow-2xl print:hidden">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-amber-300 px-2.5 py-0.5 text-xs font-extrabold text-slate-900">
          {step + 1} / {STEPS.length}
        </span>
        <button type="button" onClick={onClose} className="text-sm font-bold text-slate-500 hover:text-slate-900">
          Skip tour
        </button>
      </div>
      <p id="tour-title" className="mt-3 font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">
        {s.title}
      </p>
      <p className="mt-1 text-slate-700">{s.body}</p>
      <div className="mt-4 flex gap-2">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="rounded-2xl border-2 border-b-4 border-slate-200 px-4 py-2 font-extrabold text-slate-700">
            Back
          </button>
        )}
        <button type="button" onClick={() => (last ? onClose() : setStep(step + 1))} className="rounded-2xl bg-teal-700 px-5 py-2 font-extrabold text-white">
          {last ? "Got it" : "Next"}
        </button>
      </div>
    </div>
  );
}
