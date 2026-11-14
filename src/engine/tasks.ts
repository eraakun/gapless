import { addDaysISO, type ISODate } from "./dates";
import type { CoveragePlan, FamilyPlan } from "./types";

export type TaskKind = "camp" | "pto" | "helper" | "paid" | "custody" | "pickup";

/** One thing a parent has to do so the plan actually happens. */
export interface PlanTask {
  id: string;
  kind: TaskKind;
  /** Do it by this day. */
  due: ISODate;
  title: string;
  detail: string;
  /** The gap days this task is for. */
  dates: ISODate[];
  /** Who it's about: the parent, helper, paid-care or camp id. */
  ref?: string;
  /** Kids the task is for. */
  kidIds?: string[];
}

/** Lead times, in days, before the first date a task is for. */
export const LEAD_DAYS = { pto: 21, helper: 7, paid: 10, campFallback: 30, pickup: 7 } as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const md = (iso: ISODate) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const list = (dates: ISODate[]) => (dates.length <= 4 ? dates.map(md).join(", ") : `${dates.slice(0, 3).map(md).join(", ")} +${dates.length - 3} more`);
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Turn a coverage plan into a to-do list: register for camps before the
 * deadline, ask for vacation days with notice, confirm family helpers, book
 * sitters, and answer co-parent requests. Grouped by month so each task is
 * one conversation, and sorted by due date.
 */
export function buildTasks(plan: FamilyPlan, coverage: CoveragePlan): PlanTask[] {
  const tasks: PlanTask[] = [];
  const kidName = new Map(plan.children.map((c) => [c.id, c.name]));
  const byKey = new Map<string, { kind: TaskKind; ref: string; month: string; dates: ISODate[]; cash: number; kids: Set<string> }>();

  for (const day of coverage.days) {
    for (const cover of day.covers) {
      if (cover.kind !== "pto" && cover.kind !== "helper" && cover.kind !== "paid") continue;
      const month = day.date.slice(0, 7);
      const key = `${cover.kind}-${cover.refId}-${month}`;
      const entry = byKey.get(key) ?? { kind: cover.kind, ref: cover.refId, month, dates: [], cash: 0, kids: new Set<string>() };
      if (!entry.dates.includes(day.date)) entry.dates.push(day.date);
      cover.childIds.forEach((id) => entry.kids.add(id));
      entry.cash += cover.cash;
      byKey.set(key, entry);
    }
  }

  for (const [key, e] of byKey) {
    const first = e.dates[0];
    const monthName = MONTHS[Number(e.month.slice(5, 7)) - 1];
    if (e.kind === "pto") {
      const name = plan.parents.find((p) => p.id === e.ref)?.name ?? "A parent";
      tasks.push({
        id: key,
        kind: "pto",
        due: addDaysISO(first, -LEAD_DAYS.pto),
        title: `${name}: request ${e.dates.length} vacation ${e.dates.length === 1 ? "day" : "days"} in ${monthName}`,
        detail: list(e.dates),
        dates: e.dates,
        ref: e.ref,
        kidIds: [...e.kids],
      });
    } else if (e.kind === "helper") {
      const name = plan.helpers.find((h) => h.id === e.ref)?.name ?? "Your helper";
      tasks.push({
        id: key,
        kind: "helper",
        due: addDaysISO(first, -LEAD_DAYS.helper),
        title: `Confirm with ${name} for ${monthName}`,
        detail: list(e.dates),
        dates: e.dates,
        ref: e.ref,
        kidIds: [...e.kids],
      });
    } else {
      const name = plan.paidCare.find((c) => c.id === e.ref)?.name ?? "Paid care";
      tasks.push({
        id: key,
        kind: "paid",
        due: addDaysISO(first, -LEAD_DAYS.paid),
        title: `Book ${name} in ${monthName}`,
        detail: `${list(e.dates)} · ${usd(e.cash)}`,
        dates: e.dates,
        ref: e.ref,
        kidIds: [...e.kids],
      });
    }
  }

  // Camps: one task per camp, due at its registration deadline.
  const campWeeks = new Map<string, typeof coverage.campWeeks>();
  for (const w of coverage.campWeeks) campWeeks.set(w.campId, [...(campWeeks.get(w.campId) ?? []), w]);
  for (const [campId, weeks] of campWeeks) {
    const camp = plan.camps.find((c) => c.id === campId);
    if (!camp) continue;
    const starts = [...new Set(weeks.map((w) => w.weekStart))].sort();
    const kids = [...new Set(weeks.map((w) => kidName.get(w.childId) ?? "?"))];
    const booked = weeks.every((w) => plan.bookings.some((b) => b.campId === w.campId && b.childId === w.childId && b.weekStart === w.weekStart));
    if (booked) continue;
    tasks.push({
      id: `camp-${campId}`,
      kind: "camp",
      due: camp.registerBy ?? addDaysISO(starts[0], -LEAD_DAYS.campFallback),
      title: `Register ${kids.join(" & ")} for ${camp.name}`,
      detail: `${weeks.length} kid-${weeks.length === 1 ? "week" : "weeks"} from ${list(starts)} · ${usd(weeks.reduce((s, w) => s + w.price, 0))}`,
      dates: starts,
      ref: campId,
      kidIds: [...new Set(weeks.map((w) => w.childId))],
    });
  }

  // Co-parents: pending day-change requests need an answer before the day.
  for (const c of plan.custody?.changes ?? []) {
    if (c.status !== "pending" || c.date < plan.today) continue;
    const who = plan.parents.find((p) => p.id === c.requestedBy)?.name ?? "Your co-parent";
    tasks.push({
      id: `custody-${c.id}`,
      kind: "custody",
      due: addDaysISO(c.date, -1),
      title: `Answer ${who}'s request for ${md(c.date)}`,
      detail: c.reason || "Day change request",
      dates: [c.date],
      ref: c.requestedBy,
    });
  }

  // Early-release days: school is open, but someone has to pick the kids up at midday.
  const early = new Map<string, string[]>();
  const earlyIds = new Map<string, string[]>();
  for (const child of plan.children) {
    const cal = (child.schoolId && plan.otherSchools?.find((s) => s.id === child.schoolId)?.calendar) || plan.school;
    for (const d of cal.earlyRelease ?? []) {
      if (d < plan.today || d > plan.horizonEnd) continue;
      early.set(d, [...(early.get(d) ?? []), child.name]);
      earlyIds.set(d, [...(earlyIds.get(d) ?? []), child.id]);
    }
  }
  for (const [d, kids] of early) {
    tasks.push({
      id: `pickup-${d}`,
      kind: "pickup",
      due: addDaysISO(d, -LEAD_DAYS.pickup),
      title: `Early pickup on ${md(d)}: ${kids.join(" & ")}`,
      detail: "School lets out early. Leave work early, ask family, or book a few sitter hours.",
      dates: [d],
      kidIds: earlyIds.get(d),
    });
  }

  return tasks.sort((a, b) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title));
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** The to-do list as all-day calendar events on each due date, with a 9 am alert. */
export function tasksToIcs(tasks: PlanTask[], stamp: Date = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gapless//Reminders//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const t of tasks) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(t.id)}@gapless.app`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${t.due.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${addDaysISO(t.due, 1).replace(/-/g, "")}`,
      `SUMMARY:${escapeText(`Gapless: ${t.title}`)}`,
      `DESCRIPTION:${escapeText(t.detail)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(t.title)}`,
      "TRIGGER:PT9H",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
