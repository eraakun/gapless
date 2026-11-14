import { addDaysISO } from "./dates";
import type { CoveragePlan, FamilyPlan } from "./types";

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
const compact = (iso: string) => iso.replace(/-/g, "");

/**
 * Exports the coverage plan as an .ics file both parents can import into
 * Google, Apple or Outlook: one all-day event per gap day saying who has the
 * kids, plus a reminder for every camp registration deadline.
 */
export function buildCoverageCalendar(plan: FamilyPlan, coverage: CoveragePlan, stamp: Date = new Date()): string {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const kidName = new Map(plan.children.map((c) => [c.id, c.name]));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gapless//Coverage Plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];

  const event = (uid: string, date: string, summary: string, description: string) =>
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(uid)}@gapless.app`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compact(date)}`,
      `DTEND;VALUE=DATE:${compact(addDaysISO(date, 1))}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      "END:VEVENT",
    );

  for (const day of coverage.days) {
    if (day.covers.every((c) => c.kind === "parentOff")) continue;
    const parts = day.covers.map((c) => `${c.childIds.map((id) => kidName.get(id)).join(" & ")}: ${c.label}`);
    event(`gapless-${day.date}`, day.date, `No school: ${parts.join("; ")}`, `Planned by Gapless (${day.reason}).`);
  }
  const deadlines = new Map<string, string>();
  for (const week of coverage.campWeeks) {
    const camp = plan.camps.find((c) => c.id === week.campId);
    if (camp?.registerBy) deadlines.set(camp.id, camp.registerBy);
  }
  deadlines.forEach((date, campId) => {
    const camp = plan.camps.find((c) => c.id === campId)!;
    event(`gapless-register-${campId}`, date, `Register by today: ${camp.name}`, "Camp weeks in your Gapless plan need booking.");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
