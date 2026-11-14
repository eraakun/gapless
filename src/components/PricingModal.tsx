import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onDemoUnlock: () => void;
}

const FREE = ["Step-by-step setup in 30 seconds", "Optimized plan for the next 60 days", "To-do reminders + calendar alerts", "What-if scenarios", "Sick-day and snow-day re-plan", "Two homes: custody schedule"];
const PRO = [
  "Whole school year and summer, day by day",
  "Partner link: both parents, same plan",
  "Calendar export for Google, Apple, Outlook",
  "One-page printable plan (PDF)",
  "Re-plans all year as things change",
];

export function PricingModal({ open, onClose, onDemoUnlock }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={dialog} onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()} className="m-auto w-[min(92vw,640px)] rounded-2xl p-0 backdrop:bg-slate-900/50">
      <div className="p-6">
        <h2 className="text-xl font-bold text-slate-900">Gapless Family</h2>
        <p className="mt-1 text-sm text-slate-600">A whole school year planned, for less than one day of babysitting.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <PlanCard name="Free" price="$0" items={FREE} />
          <PlanCard name="Family" price="$39 per school year, or $5.99/mo" items={PRO} highlight />
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="max-w-xs text-xs text-slate-500">Checkout isn't connected in this hackathon build. Judges: use the demo unlock to try every paid feature.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Not now
            </button>
            <button
              type="button"
              onClick={() => {
                onDemoUnlock();
                onClose();
              }}
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400"
            >
              Demo unlock
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function PlanCard({ name, price, items, highlight }: { name: string; price: string; items: string[]; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-amber-400 bg-amber-50/50" : "border-slate-200"}`}>
      <p className="text-sm font-semibold text-slate-900">{name}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{price}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-teal-600">✓</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
