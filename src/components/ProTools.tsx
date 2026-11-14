import { useState } from "react";
import { buildCoverageCalendar, encodePlan, type CoveragePlan, type FamilyPlan } from "../engine";
import { Card, ProBadge } from "./ui";

export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Pro: put the plan in both parents' calendars, and share it without accounts. */
export function ProTools({ plan, coverage, pro, onUpgrade }: { plan: FamilyPlan; coverage: CoveragePlan; pro: boolean; onUpgrade: () => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Share &amp; print <ProBadge />
        </span>
      }
    >
      <p className="text-sm text-slate-600">
        Send your co-parent a link that opens this exact plan (no accounts, nothing stored on a server), add every no-school day to Google, Apple or
        Outlook, or print a one-page plan for the fridge.
      </p>
      {pro ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => {
              const token = await encodePlan(plan);
              const url = `${location.origin}${location.pathname}#plan=${token}`;
              setLink(url);
              setCopied(false);
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              } catch {
                // Clipboard blocked: the link is shown below to copy by hand.
              }
            }}
            className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Create partner link
          </button>
          <button
            type="button"
            onClick={() => download("gapless-plan.ics", buildCoverageCalendar(plan, coverage), "text/calendar")}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Download calendar (.ics)
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            🖨️ Print / save as PDF
          </button>
        </div>
      ) : (
        <button type="button" onClick={onUpgrade} className="mt-3 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950">
          Unlock with Pro
        </button>
      )}
      {link && (
        <div className="mt-3">
          <p className="text-xs text-teal-700">{copied ? "Copied to clipboard." : "Copy this link:"}</p>
          <input readOnly value={link} onFocus={(e) => e.target.select()} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-[11px]" />
        </div>
      )}
    </Card>
  );
}
