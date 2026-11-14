import { useState } from "react";
import {
  addDaysISO,
  custodianOn,
  custodyBlocks,
  dateParts,
  decideChange,
  parentingTime,
  parseISO,
  requestChange,
  splitCost,
  type CoveragePlan,
  type FamilyPlan,
} from "../engine";
import { newId, shortDate, usd } from "../lib/format";
import { Card } from "./ui";

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The co-parenting view: whose week it is, when *you* next have the kids,
 * the extra days right of first refusal gives you, who pays what, and
 * schedule-change requests that only count once the other parent approves.
 */
export function CustodyCard({ plan, coverage, onChange }: { plan: FamilyPlan; coverage: CoveragePlan; onChange: (plan: FamilyPlan) => void }) {
  const c = plan.custody!;
  const [me, setMe] = useState(c.parentB);
  const [reqDate, setReqDate] = useState(addDaysISO(plan.today, 7));
  const [reason, setReason] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const viewer = me === c.parentA || me === c.parentB ? me : c.parentB;
  const other = viewer === c.parentA ? c.parentB : c.parentA;
  const name = (id: string) => plan.parents.find((p) => p.id === id)?.name ?? "?";
  const who = (date: string) => custodianOn(c, date, plan.school);
  const now = () => new Date().toISOString();
  const stamp = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

  // Next 14 days, and the blocks through the end of the plan.
  const strip = Array.from({ length: 14 }, (_, i) => addDaysISO(plan.today, i));
  const blocks = custodyBlocks(plan, plan.today, plan.horizonEnd);
  const current = blocks[0];
  const nextMine = blocks.find((b) => b.parentId === viewer && b.start > plan.today);
  const time = parentingTime(plan, plan.today, plan.horizonEnd);
  const totalDays = (time[c.parentA] ?? 0) + (time[c.parentB] ?? 0);
  const share = totalDays ? Math.round(((time[viewer] ?? 0) / totalDays) * 100) : 0;

  // Midweek visits: next 3 evenings on the visit weekday when the other parent has the kids.
  const visits: string[] = [];
  if (c.midweekVisit) {
    for (let d = plan.today; d <= plan.horizonEnd && visits.length < 3; d = addDaysISO(d, 1)) {
      if (dateParts(parseISO(d)).weekday === c.midweekVisit && who(d) === other) visits.push(d);
    }
  }

  // Days this parent steps in on the other parent's time (right of first refusal).
  const bonus = coverage.days.filter((d) => who(d.date) === other && d.covers.some((cv) => (cv.kind === "parentOff" || cv.kind === "pto") && cv.refId === viewer));
  // Days the other parent's time needs a sitter or camp, where you're free: worth offering.
  const mine = plan.parents.find((p) => p.id === viewer);
  const couldOffer = !c.firstRefusal && mine
    ? coverage.days.filter((d) => who(d.date) === other && d.covers.some((cv) => cv.kind === "paid" || cv.kind === "camp") && !mine.workdays.includes(dateParts(parseISO(d.date)).weekday))
    : [];

  const split = splitCost(c, coverage.summary.cash);
  const changes = [...(c.changes ?? [])].reverse();
  const toMe = changes.filter((x) => x.status === "pending" && x.requestedBy === other);
  const reqWho = who(reqDate);
  const valid = reqDate >= plan.today;

  const setCustody = (next: typeof c) => onChange({ ...plan, custody: next });

  return (
    <Card
      title="Parenting time"
      aside={
        <div role="radiogroup" aria-label="Viewing as" className="flex rounded-lg border border-slate-300 p-0.5 text-xs">
          {[c.parentA, c.parentB].map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={viewer === id}
              onClick={() => setMe(id)}
              className={`rounded-md px-2.5 py-1 font-semibold ${viewer === id ? "bg-slate-900 text-white" : "text-slate-600"}`}
            >
              I'm {name(id)}
            </button>
          ))}
        </div>
      }
    >
      {/* Where the kids sleep, next two weeks */}
      <ol className="grid grid-cols-7 gap-1 text-center text-xs" aria-label="Next 14 days">
        {strip.map((d, i) => {
          const isMine = who(d) === viewer;
          const handoff = i > 0 && who(d) !== who(strip[i - 1]);
          return (
            <li key={d} className={`rounded-md border px-1 py-1.5 ${isMine ? "border-slate-900 bg-amber-300 font-bold text-slate-900" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
              <span className="block text-[10px] uppercase">{DOW[dateParts(parseISO(d)).weekday]}</span>
              {dateParts(parseISO(d)).day}
              <span className="block truncate text-[10px]">{handoff ? "⇄ " : ""}{name(who(d)!).slice(0, 6)}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 space-y-1.5 text-sm text-slate-800">
        {current?.parentId === viewer ? (
          <p>
            <strong>The kids are with you</strong> through {shortDate(current.end)}.
          </p>
        ) : (
          <p>
            The kids are at {name(other)}'s through {current ? shortDate(current.end) : "…"}.
          </p>
        )}
        {nextMine && (
          <p>
            <strong>Your next time:</strong> {shortDate(nextMine.start)} – {shortDate(nextMine.end)} ({nextMine.days} {nextMine.days === 1 ? "day" : "days"}).
          </p>
        )}
        {c.exchange && <p>Handoff: {c.exchange}.</p>}
        {visits.length > 0 && (
          <p>
            Evening visit{current?.parentId === viewer ? ` for ${name(other)}` : ""}: {visits.map((v) => shortDate(v)).join(", ")}.
          </p>
        )}
        <p className="text-slate-600">
          Until {shortDate(plan.horizonEnd)}: you have the kids {time[viewer] ?? 0} of {totalDays} days ({share}%), counting approved changes.
        </p>
      </div>

      {bonus.length > 0 && (
        <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
          <strong>
            {bonus.length} extra {bonus.length === 1 ? "day" : "days"} with the kids
          </strong>{" "}
          on {name(other)}'s time, through right of first refusal instead of a sitter: {bonus.slice(0, 5).map((d) => shortDate(d.date)).join(", ")}
          {bonus.length > 5 ? "…" : ""}.
        </div>
      )}
      {couldOffer.length > 0 && (
        <div className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-950">
          You're off work on {couldOffer.length} of {name(other)}'s days that now go to paid care ({couldOffer.slice(0, 3).map((d) => shortDate(d.date)).join(", ")}
          {couldOffer.length > 3 ? "…" : ""}). Ask for them below, or turn on right of first refusal if your order has it.
        </div>
      )}

      <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
        <p className="font-semibold text-slate-900">Childcare and camps: {usd(coverage.summary.cash)}</p>
        <p className="text-slate-600">
          {name(c.parentA)} pays {usd(split[c.parentA])} ({c.costShareA ?? 50}%), {name(c.parentB)} pays {usd(split[c.parentB])}.
        </p>
      </div>

      {/* Change requests */}
      <h3 className="mt-5 text-base font-bold text-slate-900">Change a day</h3>
      <p className="text-xs text-slate-500">Nothing moves until {name(other)} approves. Every request and answer is logged with a time.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <label className="block text-xs font-medium text-slate-600">
          Day
          <input type="date" value={reqDate} min={plan.today} onChange={(e) => setReqDate(e.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-2.5 py-2 text-sm" />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Reason (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Grandpa's birthday" className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm" />
        </label>
        <button
          type="button"
          disabled={!valid}
          onClick={() => {
            setCustody(requestChange(c, { id: newId("ask"), date: reqDate, requestedBy: viewer, reason: reason.trim() }, now(), plan.school));
            setReason("");
          }}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {reqWho === viewer ? `Ask ${name(other)} to take it` : `Ask to have the kids`}
        </button>
      </div>

      {toMe.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-slate-900">Waiting for your answer</p>
          {toMe.map((x) => (
            <div key={x.id} className="rounded-lg border-2 border-amber-400 p-3 text-sm">
              <p>
                {name(x.requestedBy)} asks: kids with <strong>{name(x.toParent)}</strong> on {WEEKDAY_NAMES[dateParts(parseISO(x.date)).weekday]}, {shortDate(x.date)}
                {x.reason ? ` — “${x.reason}”` : ""}.
              </p>
              <input
                value={replies[x.id] ?? ""}
                onChange={(e) => setReplies({ ...replies, [x.id]: e.target.value })}
                placeholder="Note (optional)"
                aria-label="Note with your answer"
                className="mt-2 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
              />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setCustody(decideChange(c, x.id, viewer, "approved", now(), replies[x.id]))} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                  Approve
                </button>
                <button type="button" onClick={() => setCustody(decideChange(c, x.id, viewer, "declined", now(), replies[x.id]))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {changes.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-900">Request log ({changes.length})</summary>
          <ul className="mt-2 space-y-2">
            {changes.map((x) => (
              <li key={x.id} className="border-l-2 border-slate-300 pl-3">
                <span className={`mr-1 rounded px-1.5 py-0.5 text-[11px] font-bold ${x.status === "approved" ? "bg-emerald-100 text-emerald-900" : x.status === "declined" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>
                  {x.status}
                </span>
                {shortDate(x.date)} → {name(x.toParent)}. Asked by {name(x.requestedBy)}, {stamp(x.createdAt)}
                {x.reason ? ` (“${x.reason}”)` : ""}
                {x.decidedAt ? `. ${x.status === "approved" ? "Approved" : "Declined"} ${stamp(x.decidedAt)}` : x.requestedBy === viewer ? `. Waiting for ${name(other)}` : ""}
                {x.response ? `: “${x.response}”` : ""}.
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Send requests and answers with the co-parent share link (Pro): each of you opens it and the plan updates. Your court order or parenting plan always
        controls. This log lives in your browsers and the link, so it isn't a certified record. Gapless isn't legal advice.
      </p>
    </Card>
  );
}
