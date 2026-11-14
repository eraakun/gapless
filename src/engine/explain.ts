import { dateParts, parseISO } from "./dates";
import type { Cover, DayPlan, FamilyPlan, PaidCare } from "./types";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** The cheapest paid option that could have taken these kids on this day, if any. */
export function cheapestPaidFor(plan: FamilyPlan, day: DayPlan, kidCount: number): { care: PaidCare; cost: number } | null {
  const sick = day.reason === "sick" || plan.surprises.some((s) => s.date === day.date && s.reason === "sick");
  let best: { care: PaidCare; cost: number } | null = null;
  for (const care of plan.paidCare) {
    if (sick && !care.takesSickKids) continue;
    if (day.reason === "summer" && !care.availableInSummer) continue;
    const cost = care.pricing === "perChild" ? care.pricePerDay * kidCount : care.pricePerDay;
    if (!best || cost < best.cost) best = { care, cost };
  }
  return best;
}

/**
 * One plain sentence per cover, saying why the plan chose it for this day,
 * in the family's own numbers: what the alternative would have cost.
 */
export function explainDay(plan: FamilyPlan, day: DayPlan): string[] {
  const parent = (id: string) => plan.parents.find((p) => p.id === id)?.name ?? "A parent";
  const kidNames = (ids: string[]) => ids.map((id) => plan.children.find((c) => c.id === id)?.name ?? "?").join(" & ");
  const weekday = WEEKDAY[dateParts(parseISO(day.date)).weekday];
  const ptoValue = plan.settings.ptoDayValue;

  return day.covers.map((c: Cover) => {
    const alt = cheapestPaidFor(plan, day, c.childIds.length);
    const vsPaid = alt ? ` The cheapest paid option, ${alt.care.name}, would cost ${usd(alt.cost)}.` : " No paid option you listed could take this day.";
    switch (c.kind) {
      case "parentOff":
        return c.label.includes("first refusal")
          ? `${c.label.replace(" (first refusal)", "")}, so under right of first refusal they take the kids instead of a sitter. Free.`
          : `${c.label} that ${weekday}, so it's covered for free.`;
      case "pto":
        return alt && alt.cost > ptoValue
          ? `${parent(c.refId)} takes a vacation day, which you value at ${usd(ptoValue)}.${vsPaid} That's ${usd(alt.cost - ptoValue)} better.`
          : `${parent(c.refId)} takes a vacation day (you value it at ${usd(ptoValue)}).${vsPaid}${alt ? " Cash would be cheaper on this day alone, but across the whole year this is the cheapest total plan." : ""}`;
      case "helper": {
        const h = plan.helpers.find((x) => x.id === c.refId);
        return `${h?.name ?? "Your helper"} can help on ${weekday}s${h && h.costPerDay > 0 ? ` for ${usd(h.costPerDay)}` : ", for free"}.${vsPaid} Their limited days go where they save the most.`;
      }
      case "wfh":
        return `${parent(c.refId)} works from home and ${kidNames(c.childIds)} ${c.childIds.length > 1 ? "are" : "is"} old enough to be home. You counted that as ${usd(plan.settings.wfhPenalty)} of lost focus.${vsPaid}`;
      case "camp": {
        const camp = plan.camps.find((x) => x.id === c.refId);
        const perDay = camp ? camp.pricePerChildWeek / 5 : 0;
        return `${kidNames(c.childIds)} ${c.childIds.length > 1 ? "are" : "is"} at ${camp?.name ?? "camp"} this week: ${camp ? usd(camp.pricePerChildWeek) : "?"} per kid for the week, about ${usd(perDay)} a day.${alt ? ` Paying ${alt.care.name} every day that week would cost about ${usd(alt.cost * 5)}.` : ""}`;
      }
      case "paid":
        if (c.cash < ptoValue) return `${c.label} for ${usd(c.cash)}: nobody free was available, and it's cheaper than a vacation day, which you value at ${usd(ptoValue)}.`;
        if (c.cash === ptoValue) return `${c.label} for ${usd(c.cash)}: nobody free was available. It costs the same as a vacation day (${usd(ptoValue)} to you), so the vacation day is kept for a day where nothing this cheap is open.`;
        return `${c.label} for ${usd(c.cash)}: nobody free was available, and your vacation days are already used on days where they save even more.`;
      default:
        return "Nobody you listed can take this day. Add a helper, a paid option that takes sick kids, or more vacation days.";
    }
  });
}

/**
 * Plan B: if this cover falls through (Grandma cancels, the sitter is sick),
 * the next-best option for that day, priced.
 */
export function planB(plan: FamilyPlan, day: DayPlan, cover: Cover): string | null {
  if (cover.kind === "parentOff" || cover.kind === "uncovered") return null;
  const n = cover.childIds.length;
  const weekday = dateParts(parseISO(day.date)).weekday;
  const sick = day.reason === "sick" || plan.surprises.some((s) => s.date === day.date && s.reason === "sick");
  const options: Array<{ text: string; cost: number }> = [];
  for (const care of plan.paidCare) {
    if (cover.kind === "paid" && care.id === cover.refId) continue;
    if (sick && !care.takesSickKids) continue;
    if (day.reason === "summer" && !care.availableInSummer) continue;
    const cost = care.pricing === "perChild" ? care.pricePerDay * n : care.pricePerDay;
    options.push({ text: `${care.name}, ${usd(cost)}`, cost });
  }
  for (const h of plan.helpers) {
    if (cover.kind === "helper" && h.id === cover.refId) continue;
    if (!h.weekdays.includes(weekday) || (sick && !h.takesSickKids)) continue;
    options.push({ text: `${h.name}${h.costPerDay > 0 ? `, ${usd(h.costPerDay)}` : ", free"}`, cost: h.costPerDay });
  }
  for (const p of plan.parents) {
    if (cover.kind === "pto" && p.id === cover.refId) continue;
    if (p.ptoDays > 0) options.push({ text: `a vacation day for ${p.name} (worth ${usd(plan.settings.ptoDayValue)} to you)`, cost: plan.settings.ptoDayValue });
  }
  options.sort((a, b) => a.cost - b.cost);
  return options.length > 0 ? `If that falls through: ${options[0].text}.` : "No backup listed for this day. Add a second sitter or a helper.";
}
