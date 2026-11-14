import { useEffect, useRef, useState } from "react";
import { applyActions, interpret, optimizePlan, planAfterSchool, ASSISTANT_EXAMPLES, type AssistantAction, type CoveragePlan, type FamilyPlan } from "../engine";
import { usd } from "../lib/format";
import { LogoMark } from "./Logo";

interface Message {
  from: "you" | "bot";
  text: string;
  actions?: AssistantAction[];
  /** "pending" until the parent applies or cancels. */
  state?: "pending" | "applied" | "cancelled" | "undone";
  /** The plan before and right after this change, so it can be undone. */
  before?: FamilyPlan;
  after?: FamilyPlan;
  suggestions?: string[];
}

/**
 * "Ask Gapless": type what changed or ask a question in plain English.
 * Keyword rules turn it into a proposed change (applied only on confirm)
 * or an answer computed by the optimizer. Runs entirely in the browser.
 */
export function AssistantChat({ plan, clean, best, onChange }: { plan: FamilyPlan; clean: FamilyPlan; best: CoveragePlan; onChange: (plan: FamilyPlan) => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { from: "bot", text: "Hi! Tell me what changed, or ask about your plan. I'll show you what I understood before changing anything.", suggestions: ASSISTANT_EXAMPLES },
  ]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q) return;
    const r = interpret(clean, q, best);
    setMessages((m) => [
      ...m.map((x) => (x.state === "pending" ? { ...x, state: "cancelled" as const } : x)),
      { from: "you", text: q },
      { from: "bot", text: r.text, actions: r.actions.length ? r.actions : undefined, state: r.actions.length ? "pending" : undefined, suggestions: r.suggestions },
    ]);
    setInput("");
  };

  const apply = (i: number) => {
    const msg = messages[i];
    if (!msg.actions) return;
    const nextClean = applyActions(clean, msg.actions);
    const before = best.summary;
    const after = optimizePlan(nextClean).summary;
    const asBefore = planAfterSchool(clean)?.total ?? 0;
    const asAfter = planAfterSchool(nextClean)?.total ?? 0;
    const nextPlan = applyActions(plan, msg.actions);
    onChange(nextPlan);
    const delta = (n: number) => (n === 0 ? "unchanged" : `${n > 0 ? "+" : "−"}${usd(Math.abs(n))}`);
    const note =
      after.uncoveredDays > 0
        ? `⚠️ ${after.uncoveredDays} days now have nobody. Check the plan.`
        : `Every day is still covered. No-school days: ${delta(after.cash - before.cash)} (${usd(after.cash)} total).${asAfter !== asBefore ? ` After school: ${delta(asAfter - asBefore)} until summer.` : ""}`;
    setMessages((m) => [
      ...m.map((x, j) => (j === i ? { ...x, state: "applied" as const, before: plan, after: nextPlan } : x)),
      { from: "bot", text: `Done, re-planned. ${note}`, suggestions: ["What should I do next?"] },
    ]);
  };

  // Undo only the latest applied change, and only while nothing else has changed since.
  const lastApplied = messages.reduce((acc, x, j) => (x.state === "applied" ? j : acc), -1);
  const canUndo = (i: number) => i === lastApplied && !!messages[i].after && JSON.stringify(messages[i].after) === JSON.stringify(plan);
  const undo = (i: number) => {
    const msg = messages[i];
    if (!msg.before || !canUndo(i)) return;
    onChange(msg.before);
    setMessages((m) => [...m.map((x, j) => (j === i ? { ...x, state: "undone" as const } : x)), { from: "bot", text: "Undone. Your plan is back to how it was.", suggestions: [] }]);
  };

  const cancel = (i: number) => setMessages((m) => m.map((x, j) => (j === i ? { ...x, state: "cancelled" as const } : x)));

  return (
    <div className="print:hidden" data-tour="assistant">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-teal-700 py-3 pr-5 pl-3 text-base font-extrabold text-white shadow-xl"
        >
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg">💬</span>
          Ask Gapless
        </button>
      )}
      {open && (
        <section
          role="dialog"
          aria-label="Gapless assistant"
          className="fixed inset-x-2 bottom-2 z-40 flex h-[min(560px,80vh)] flex-col overflow-hidden rounded-3xl border-2 border-b-4 border-teal-900 bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[400px]"
        >
          <header className="flex items-center gap-3 bg-teal-700 px-4 py-3 text-white">
            <span className="rounded-xl bg-white p-1">
              <LogoMark className="h-7 w-auto" animate={false} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-[family-name:var(--font-display)] text-lg font-bold leading-tight">Ask Gapless</p>
              <p className="text-xs text-teal-100">Plain-English commands · runs in your browser</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="h-9 w-9 rounded-full text-xl hover:bg-white/15">
              ×
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={m.from === "you" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${m.from === "you" ? "bg-teal-700 text-white" : "border-2 border-slate-200 bg-white text-slate-800"}`}>
                  <p className="whitespace-pre-line">{m.text}</p>
                  {m.actions && m.state === "pending" && (
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => apply(i)} className="rounded-xl bg-teal-700 px-3 py-1.5 text-xs font-extrabold text-white">
                        ✓ Apply
                      </button>
                      <button type="button" onClick={() => cancel(i)} className="rounded-xl border-2 border-slate-200 px-3 py-1.5 text-xs font-extrabold text-slate-700">
                        Cancel
                      </button>
                    </div>
                  )}
                  {m.state === "applied" && (
                    <p className="mt-1 flex items-center gap-2 text-xs font-bold text-emerald-900">
                      ✓ Applied
                      {canUndo(i) && (
                        <button type="button" onClick={() => undo(i)} className="rounded-lg border-2 border-slate-200 px-2 py-0.5 text-slate-700 hover:border-slate-300">
                          ↩ Undo
                        </button>
                      )}
                    </p>
                  )}
                  {m.state === "undone" && <p className="mt-1 text-xs font-bold text-slate-400">↩ Undone</p>}
                  {m.state === "cancelled" && m.actions && <p className="mt-1 text-xs font-bold text-slate-400">Not applied</p>}
                  {m.from === "bot" && m.suggestions && m.suggestions.length > 0 && i === messages.length - 1 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.suggestions.map((s) => (
                        <button key={s} type="button" onClick={() => send(s)} className="rounded-full border-2 border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 hover:border-teal-300">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 border-t-2 border-slate-200 p-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Leo is sick tomorrow"
              aria-label="Message"
              className="min-w-0 flex-1 rounded-2xl border-2 border-slate-200 px-3 py-2 text-sm"
            />
            <button type="submit" disabled={!input.trim()} className="rounded-2xl bg-teal-700 px-4 text-sm font-extrabold text-white disabled:opacity-40">
              Send
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
