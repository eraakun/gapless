import { useState } from "react";
import { buildTasks, daysBetween, draftMessage, messageLink, tasksToIcs, type CoveragePlan, type FamilyPlan, type TaskKind } from "../engine";
import { shortDate } from "../lib/format";
import { download } from "./ProTools";
import { Card } from "./ui";

const KIND_EMOJI: Record<TaskKind, string> = { camp: "⛺", pto: "🏖️", helper: "👵", paid: "🧸", custody: "🏠", pickup: "🚸" };
const SHOW = 6;

/**
 * Reminders: what to do and by when so the plan actually happens.
 * Check things off (saved with the plan) or send them all to your calendar.
 */
export function TasksCard({ plan, coverage, onChange }: { plan: FamilyPlan; coverage: CoveragePlan; onChange: (plan: FamilyPlan) => void }) {
  const [all, setAll] = useState(false);
  const [msgFor, setMsgFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const tasks = buildTasks(plan, coverage);
  const done = new Set(plan.doneTasks ?? []);
  const open = tasks.filter((t) => !done.has(t.id));
  const finished = tasks.filter((t) => done.has(t.id));
  const list = all ? [...open, ...finished] : open.slice(0, SHOW);
  const toggle = (id: string) =>
    onChange({ ...plan, doneTasks: done.has(id) ? [...done].filter((x) => x !== id) : [...done, id] });

  const when = (due: string, firstDate: string) => {
    const d = daysBetween(plan.today, due);
    // Past the ideal notice but the day itself is still ahead: do it now, not "overdue".
    if (d < 0) return firstDate >= plan.today ? { text: "Do it now", cls: "bg-red-600 text-white" } : { text: "Passed", cls: "bg-slate-200 text-slate-600" };
    if (d === 0) return { text: "Today", cls: "bg-red-600 text-white" };
    if (d <= 7) return { text: `In ${d} ${d === 1 ? "day" : "days"}`, cls: "bg-amber-400 text-slate-900" };
    return { text: shortDate(due), cls: "bg-slate-100 text-slate-700" };
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <span aria-hidden>🔔</span> To-do
          <span className="rounded-full bg-teal-700 px-2 text-sm text-white">{open.length}</span>
        </span>
      }
      aside={
        tasks.length > 0 && (
          <button
            type="button"
            onClick={() => download("gapless-reminders.ics", tasksToIcs(open), "text/calendar")}
            className="rounded-xl border-2 border-b-4 border-slate-200 px-3 py-1.5 text-sm font-extrabold text-slate-700 hover:border-teal-300"
          >
            📅 Add to calendar
          </button>
        )
      }
    >
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing to arrange: parents are home for every gap day.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {list.map((t) => {
              const isDone = done.has(t.id);
              const w = when(t.due, t.dates[0]);
              const msg = isDone ? null : draftMessage(plan, t);
              return (
                <li key={t.id} className={`rounded-2xl border-2 p-3 ${isDone ? "border-slate-100 bg-slate-50 opacity-60" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => toggle(t.id)}
                    aria-label={`Done: ${t.title}`}
                    className="mt-1 h-5 w-5 shrink-0 accent-[#5a32f0]"
                  />
                  <span aria-hidden className="text-xl leading-none">{KIND_EMOJI[t.kind]}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-bold leading-snug text-slate-900 ${isDone ? "line-through" : ""}`}>{t.title}</span>
                    <span className="block text-sm text-slate-500">{t.detail}</span>
                  </span>
                  {!isDone && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${w.cls}`}>{w.text}</span>}
                  </div>
                  {msg && (
                    <div className="mt-2 pl-8">
                      <button
                        type="button"
                        aria-expanded={msgFor === t.id}
                        onClick={() => setMsgFor(msgFor === t.id ? null : t.id)}
                        className="rounded-full bg-teal-50 px-3 py-1 text-xs font-extrabold text-teal-700 hover:bg-teal-100"
                      >
                        ✍️ {msgFor === t.id ? "Hide message" : msg.channel === "email" ? "Write the email" : "Write the text"}
                      </button>
                      {msgFor === t.id && (
                        <div className="mt-2 rounded-2xl bg-teal-50 p-3">
                          <p className="text-xs font-bold text-slate-600">
                            {msg.channel === "email" ? "Email" : "Text"} to {msg.to}
                            {msg.subject ? ` · Subject: ${msg.subject}` : ""}
                          </p>
                          <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{msg.body}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <a href={messageLink(msg)} className="rounded-xl bg-teal-700 px-3 py-1.5 text-xs font-extrabold text-white">
                              {msg.channel === "email" ? "✉️ Open in Mail" : "💬 Open in Messages"}
                            </a>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(msg.subject ? `${msg.subject}\n\n${msg.body}` : msg.body);
                                  setCopied(t.id);
                                } catch {
                                  setCopied(null);
                                }
                              }}
                              className="rounded-xl border-2 border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-700"
                            >
                              {copied === t.id ? "Copied ✓" : "Copy"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {(open.length > SHOW || finished.length > 0) && (
            <button type="button" onClick={() => setAll(!all)} className="mt-3 text-sm font-bold text-teal-700 underline">
              {all ? "Show less" : `Show all ${tasks.length} (${finished.length} done)`}
            </button>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Suggested notice: vacation requests 3 weeks ahead, sitters 10 days, family a week. Camp sign-ups use the camp's own deadline.
          </p>
        </>
      )}
    </Card>
  );
}
