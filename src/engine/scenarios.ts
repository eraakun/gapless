import { addDaysISO, dateParts, parseISO } from "./dates";
import type { FamilyPlan } from "./types";

/** A "what if" version of the family's plan, run through the same optimizer. */
export interface Scenario {
  id: string;
  emoji: string;
  label: string;
  plan: FamilyPlan;
}

/** First Monday on or after `from`. */
function nextMonday(from: string): string {
  const wd = dateParts(parseISO(from)).weekday;
  return addDaysISO(from, (8 - wd) % 7);
}

/**
 * The questions parents actually ask: what if Grandma can't help, what if we
 * keep vacation days for a trip, what if care gets pricier, what if we skip
 * camps, what if a kid is sick for a week in winter. Only scenarios that
 * change something for this family are returned.
 */
export function scenarioPlans(plan: FamilyPlan): Scenario[] {
  const out: Scenario[] = [];

  if (plan.helpers.length > 0) {
    const who = plan.helpers.length === 1 ? plan.helpers[0].name : "Family & friends";
    out.push({ id: "no-helpers", emoji: "🙅", label: `${who} can't help`, plan: { ...plan, helpers: [] } });
  }

  if (plan.parents.some((p) => p.ptoDays > 0)) {
    out.push({
      id: "save-pto",
      emoji: "🏝️",
      label: "Keep 5 vacation days each for a trip",
      plan: { ...plan, parents: plan.parents.map((p) => ({ ...p, ptoDays: Math.max(0, p.ptoDays - 5), sickReserve: Math.min(p.sickReserve, Math.max(0, p.ptoDays - 5)) })) },
    });
  }

  if (plan.paidCare.length > 0 || plan.camps.length > 0) {
    out.push({
      id: "pricier",
      emoji: "📈",
      label: "Sitters and camps cost 20% more",
      plan: {
        ...plan,
        paidCare: plan.paidCare.map((c) => ({ ...c, pricePerDay: Math.round(c.pricePerDay * 1.2) })),
        camps: plan.camps.map((c) => ({ ...c, pricePerChildWeek: Math.round(c.pricePerChildWeek * 1.2) })),
      },
    });
  }

  if (plan.camps.length > 0) {
    out.push({ id: "no-camps", emoji: "⛔", label: "Skip camps entirely", plan: { ...plan, camps: [], bookings: [] } });
  }

  // A full sick week for the youngest kid: the first week of February inside the plan, or 3 weeks out.
  const youngest = [...plan.children].sort((a, b) => a.age - b.age)[0];
  if (youngest) {
    const febYear = plan.today.slice(5, 7) <= "01" ? Number(plan.today.slice(0, 4)) : Number(plan.today.slice(0, 4)) + 1;
    let monday = nextMonday(`${febYear}-02-01`);
    if (monday < plan.today || monday > plan.horizonEnd) monday = nextMonday(addDaysISO(plan.today, 21));
    if (addDaysISO(monday, 4) <= plan.horizonEnd) {
      const days = [0, 1, 2, 3, 4].map((i) => addDaysISO(monday, i));
      const taken = new Set(plan.surprises.map((s) => s.date));
      out.push({
        id: "sick-week",
        emoji: "🤒",
        label: `${youngest.name} is sick a whole week`,
        plan: {
          ...plan,
          surprises: [...plan.surprises, ...days.filter((d) => !taken.has(d)).map((date) => ({ date, reason: "sick" as const, childIds: [youngest.id] }))],
        },
      });
    }
  }

  return out;
}
