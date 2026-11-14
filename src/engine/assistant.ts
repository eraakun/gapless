import { planAfterSchool } from "./afterSchool";
import { addDaysISO, dateParts, isValidISO, parseISO, type ISODate } from "./dates";
import { explainDay } from "./explain";
import { optimizePlan } from "./planner";
import { scenarioPlans } from "./scenarios";
import { buildTasks } from "./tasks";
import type { CoveragePlan, FamilyPlan } from "./types";

/**
 * The Gapless assistant: plain-English commands and questions, understood by
 * keyword rules (no AI service, nothing leaves the browser). Changes are
 * proposed as actions the parent confirms; answers come from the optimizer.
 */
export type AssistantAction =
  | { type: "sick"; childIds: string[]; dates: ISODate[] }
  | { type: "closed"; dates: ISODate[] }
  | { type: "helperOff"; helperId: string; dates: ISODate[] }
  | { type: "pto"; parentId: string; days: number }
  | { type: "price"; paidCareId: string; pricePerDay: number }
  | { type: "pickupDay"; parentId: string; weekday: number }
  | { type: "earlyRelease"; dates: ISODate[] }
  | { type: "activity"; childId: string; name: string; weekdays: number[]; until?: string }
  | { type: "homeAlone"; childId: string; value: boolean }
  | { type: "carpool"; name: string; theyDrive: number[]; weDrive: number[] }
  | { type: "times"; dismissal?: string; workEnds?: string }
  | { type: "afterSchoolPrice"; optionId: string; price: number };

export interface AssistantReply {
  text: string;
  actions: AssistantAction[];
  /** Follow-up prompts to tap. */
  suggestions: string[];
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const fmt = (iso: ISODate) => {
  const { weekday, month, day } = dateParts(parseISO(iso));
  return `${cap(DAYS[weekday].slice(0, 3))}, ${cap(MONTHS[month - 1].slice(0, 3))} ${day}`;
};
const isWeekday = (iso: ISODate) => {
  const wd = dateParts(parseISO(iso)).weekday;
  return wd >= 1 && wd <= 5;
};
/** `date` if it's a weekday, otherwise the Monday after. */
const nextWeekday = (date: ISODate) => {
  let d = date;
  while (!isWeekday(d)) d = addDaysISO(d, 1);
  return d;
};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (text: string, w: string) => new RegExp(`\\b${escape(w)}\\b`, "i").test(text);

export const EXAMPLES = [
  "Leo is sick tomorrow",
  "Ava has soccer on Tuesdays",
  "Carpool: the Parks drive Mondays, we drive Thursdays",
  "Grandma can't help in December",
  "Who has the kids on Friday?",
  "How much will this cost?",
  "What if Grandma can't help?",
  "What should I do next?",
];

/** Dates mentioned in the text, relative to `today`, within the plan. */
export function parseDates(text: string, today: ISODate, horizonEnd: ISODate): ISODate[] {
  const t = text.toLowerCase();
  const out = new Set<ISODate>();
  const year = Number(today.slice(0, 4));
  const mk = (m: number, d: number): ISODate | null => {
    for (const y of [year, year + 1]) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (isValidISO(iso) && iso >= today) return iso;
    }
    return null;
  };

  if (/\bday after tomorrow\b/.test(t)) out.add(addDaysISO(today, 2));
  else if (/\btomorrow\b/.test(t)) out.add(addDaysISO(today, 1));
  if (/\btoday\b|\bthis morning\b|\bright now\b/.test(t)) out.add(today);

  const weekRange = (monday: ISODate) => [0, 1, 2, 3, 4].map((i) => addDaysISO(monday, i));
  const thisMonday = addDaysISO(today, -((dateParts(parseISO(today)).weekday + 6) % 7));
  if (/\bnext week\b/.test(t)) weekRange(addDaysISO(thisMonday, 7)).forEach((d) => out.add(d));
  if (/\b(this|all) week\b/.test(t)) weekRange(thisMonday).filter((d) => d >= today).forEach((d) => out.add(d));

  // Explicit dates: 2026-11-20, 11/20, Nov 20, November 20, Dec 21-24
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) if (isValidISO(m[0])) out.add(m[0]);
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/\d{2,4})?\b/g)) {
    const d = mk(Number(m[1]), Number(m[2]));
    if (d) out.add(d);
  }
  const monthRe = new RegExp(`\\b(${MONTHS.map((m) => m.slice(0, 3)).join("|")})[a-z]*\\.?\\s+(\\d{1,2})(?:\\s*(?:-|–|to|through)\\s*(\\d{1,2}))?\\b`, "g");
  let explicitDay = false;
  for (const m of t.matchAll(monthRe)) {
    const month = MONTHS.findIndex((x) => x.startsWith(m[1])) + 1;
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : from;
    explicitDay = true;
    for (let d = from; d <= to && d - from < 31; d++) {
      const iso = mk(month, d);
      if (iso) out.add(iso);
    }
  }

  // Whole months: "in December", "all of January". "May" alone is usually the verb, so it needs "in May".
  if (!explicitDay) {
    for (const [i, name] of MONTHS.entries()) {
      const prefixed = new RegExp(`\\b(in|for|during|all of|through)\\s+${name.slice(0, 3)}[a-z]*\\b`).test(t);
      if (!prefixed && (name === "may" || !new RegExp(`\\b${name}\\b`).test(t))) continue;
      const mm = String(i + 1).padStart(2, "0");
      const thisMonth = Number(today.slice(5, 7));
      // The next time this month comes around: this month (from today), later this year, or next year.
      const from = i + 1 === thisMonth ? today : `${i + 1 > thisMonth ? year : year + 1}-${mm}-01`;
      for (let d = from; d.slice(5, 7) === mm && d <= horizonEnd; d = addDaysISO(d, 1)) if (isWeekday(d)) out.add(d);
    }
  }

  // Weekday names: the next one on or after today ("on Tuesday", "Friday"), but not "every Tuesday"/"on Tuesdays".
  if (!/\bevery\b|\bon \w+days\b/.test(t)) {
    for (const [i, name] of DAYS.entries()) {
      if (!new RegExp(`\\b(${name}|${name.slice(0, 3)})\\b`).test(t)) continue;
      out.add(addDaysISO(today, (i - dateParts(parseISO(today)).weekday + 7) % 7));
    }
  }
  return [...out].filter((d) => d >= today && d <= horizonEnd).sort();
}

function findKids(plan: FamilyPlan, t: string): string[] {
  const named = plan.children.filter((c) => word(t, c.name)).map((c) => c.id);
  if (named.length) return named;
  if (/\b(kids|children|both|everyone|all of them)\b/i.test(t)) return plan.children.map((c) => c.id);
  return plan.children.length === 1 ? [plan.children[0].id] : [];
}

function findHelper(plan: FamilyPlan, t: string) {
  const byName = plan.helpers.find((h) => h.name.split(/\s+/).some((part) => part.length > 2 && word(t, part)));
  if (byName) return byName;
  if (/\b(grand(ma|pa|mother|father|parents?)|nana|granny|gran|papa)\b/i.test(t)) return plan.helpers.find((h) => /grand|nana|gran|papa/i.test(h.name)) ?? plan.helpers[0];
  return undefined;
}

const findParent = (plan: FamilyPlan, t: string) => plan.parents.find((p) => word(t, p.name));

function findPaid(plan: FamilyPlan, t: string) {
  if (/\b(sitter|babysitter|nanny)\b/i.test(t)) return plan.paidCare.find((c) => /sit|nanny/i.test(c.name)) ?? plan.paidCare[0];
  return plan.paidCare.find((c) => c.name.split(/\s+/).some((part) => part.length > 3 && word(t, part.replace(/[^a-z-]/gi, ""))));
}

/** Weekdays (1-5) named in the text, in order of appearance. */
function weekdaysIn(t: string): number[] {
  const found: Array<[number, number]> = [];
  for (let wd = 1; wd <= 5; wd++) {
    const m = new RegExp(`\\b(${DAYS[wd]}|${DAYS[wd].slice(0, 3)}|${DAYS[wd].slice(0, 4)})s?\\b`).exec(t);
    if (m) found.push([m.index, wd]);
  }
  return found.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

/** "3", "2:45", "6pm", "5:30 p.m." -> "HH:MM". Bare 1-7 o'clock means the afternoon. */
function parseClock(raw: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/.exec(raw.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  const ampm = m[3]?.[0];
  if (ampm === "p" && h < 12) h += 12;
  else if (ampm === "a" && h === 12) h = 0;
  else if (!ampm && h >= 1 && h <= 7) h += 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const CLOCK = "(\\d{1,2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?)?)";
const to12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h >= 12 ? "pm" : "am"}`;
};

/** Turn one message into actions to confirm, or an answer from the optimizer. */
export function interpret(plan: FamilyPlan, input: string, coverage: CoveragePlan = optimizePlan(plan)): AssistantReply {
  const t = input.trim().toLowerCase();
  const names = (ids: string[]) => ids.map((id) => plan.children.find((c) => c.id === id)?.name ?? "?").join(" & ");
  const s = coverage.summary;
  if (!t || /^(help|\?|hi|hello|hey|what can you do)\b/.test(t)) {
    return { text: "Tell me what changed or ask about your plan. I'll show you what I understood before changing anything.", actions: [], suggestions: EXAMPLES };
  }

  const dates = parseDates(t, plan.today, plan.horizonEnd);
  const weekdayDates = dates.filter(isWeekday);
  const helper = findHelper(plan, t);
  const parent = findParent(plan, t);
  const isQuestion = /\?\s*$|^(who|what|how|why|when|which|is|are|should|do|does)\b/.test(t);

  // --- Questions first, so "what if Grandma can't help?" isn't read as a change. ---
  if (/\bwhat if\b/.test(t)) {
    const sc = scenarioPlans(plan);
    const id =
      helper || /\b(grand|nana|helper|family)/.test(t) ? "no-helpers" : /sick|ill|flu/.test(t) ? "sick-week" : /price|cost|expensive|more/.test(t) ? "pricier" : /camp/.test(t) ? "no-camps" : /vacation|trip|pto|save/.test(t) ? "save-pto" : "";
    const pick = sc.find((x) => x.id === id);
    if (!pick) return { text: "I can test: Grandma can't help, a sick week, prices +20%, skipping camps, or keeping vacation days for a trip.", actions: [], suggestions: ["What if Grandma can't help?", "What if prices go up?", "What if we skip camps?"] };
    const r = optimizePlan(pick.plan).summary;
    const dCash = r.cash - s.cash;
    const dTotal = r.objective - s.objective;
    const sign = (n: number) => `${n >= 0 ? "+" : "−"}${usd(Math.abs(n))}`;
    return {
      text: `${pick.emoji} ${pick.label}: cash ${sign(dCash)}, total cost counting vacation days ${sign(dTotal)}${r.uncoveredDays > 0 ? `, and ${r.uncoveredDays} days would have nobody` : ", and every day is still covered"}. Re-planned from scratch.`,
      actions: [],
      suggestions: ["What should I do next?", "How much will this cost?"],
    };
  }

  if (/\bwho\b/.test(t) && dates.length > 0) {
    const d = dates[0];
    const day = coverage.days.find((x) => x.date === d);
    if (day) return { text: `${fmt(d)} (${day.reason === "summer" ? "summer" : "no school"}): ${day.covers.map((c) => `${names(c.childIds)}: ${c.label}`).join("; ")}.`, actions: [], suggestions: [`Why ${fmt(d).slice(5)}?`] };
    const after = planAfterSchool(plan)?.days.find((x) => x.date === d);
    if (after) return { text: `${fmt(d)} is a school day. After school: ${after.label}${after.cost ? ` (${usd(after.cost)})` : ""}.`, actions: [], suggestions: [] };
    return { text: `${fmt(d)}: nothing to plan. A parent is home or it's the weekend.`, actions: [], suggestions: [] };
  }

  if (/\bwhy\b/.test(t)) {
    const d = dates[0] ?? coverage.days.find((x) => x.date >= plan.today && x.covers.some((c) => c.kind !== "parentOff"))?.date;
    const day = d ? coverage.days.find((x) => x.date === d) : undefined;
    if (!day) return { text: "Tell me which day, like \"Why Dec 22?\"", actions: [], suggestions: [] };
    return { text: `${fmt(day.date)}: ${explainDay(plan, day).join(" ")}`, actions: [], suggestions: ["What if Grandma can't help?"] };
  }

  if (/\b(what should i do|to-?do|next step|what('s| is) next|remind)\b/.test(t)) {
    const done = new Set(plan.doneTasks ?? []);
    const open = buildTasks(plan, coverage).filter((x) => !done.has(x.id)).slice(0, 3);
    if (!open.length) return { text: "Nothing to arrange right now. 🎉", actions: [], suggestions: [] };
    return { text: `Next up: ${open.map((x, i) => `${i + 1}) ${x.title}, by ${fmt(x.due)}`).join("; ")}. Each has its message ready in the To-do list.`, actions: [], suggestions: [] };
  }

  if (/\b(cheaper|save money|cut costs?|reduce|lower the cost)\b/.test(t)) {
    const parts: string[] = [];
    if (s.paidDays > 0) parts.push(`${s.paidDays} paid days are the biggest cost; one more helper day or work-from-home day would cut them`);
    if (s.campWeeks > 0) parts.push(`${s.campWeeks} camp kid-weeks; ask "What if we skip camps?"`);
    if (!plan.settings.fsaEnabled && s.cash > 0) parts.push(`a Dependent Care FSA could save roughly 25–35% of ${usd(s.cash)} in taxes`);
    return { text: parts.length ? `Ideas: ${parts.join("; ")}.` : "This plan is already free: family covers every day.", actions: [], suggestions: ["What if we skip camps?"] };
  }

  // --- Changes ---
  const kidsNamed = plan.children.some((c) => word(t, c.name)) || /\b(kids|children|both)\b/.test(t);
  if (helper && !kidsNamed && !isQuestion && /\b(sick|ill|surgery|hospital|out|away|visiting|flu|covid)\b/.test(t)) {
    if (!weekdayDates.length) return { text: `When can't ${helper.name} help? Try "${helper.name} is sick this week".`, actions: [], suggestions: [`${helper.name} is sick this week`] };
    return { text: `${helper.name} can't help on ${weekdayDates.map(fmt).join(", ")}. I'll re-plan those days.`, actions: [{ type: "helperOff", helperId: helper.id, dates: weekdayDates }], suggestions: [] };
  }

  if (/\b(early release|early dismissal|half[- ]day|minimum day|lets? out early|gets? out early)\b/.test(t) && !isQuestion) {
    if (!weekdayDates.length) return { text: "Which day do they get out early? Try \"Early release on Friday\".", actions: [], suggestions: [] };
    return { text: `Early release on ${weekdayDates.map(fmt).join(", ")}. I'll plan the longer afternoon${weekdayDates.length > 1 ? "s" : ""}.`, actions: [{ type: "earlyRelease", dates: weekdayDates }], suggestions: [] };
  }

  if (/\b(sick|ill|fever|flu|cold|covid|throw(ing)? up|vomit\w*|stomach bug|not feeling well|strep|pink ?eye|lice|ear infection|rsv|chicken ?pox|cough(ing)?|stay(ing)? home|home sick|contagious)\b/.test(t) && !isQuestion) {
    const kids = findKids(plan, t);
    if (!kids.length) return { text: `Which kid is sick? (${plan.children.map((c) => c.name).join(", ")})`, actions: [], suggestions: plan.children.map((c) => `${c.name} is sick tomorrow`) };
    if (dates.length && !weekdayDates.length) {
      const monday = nextWeekday(dates[0]);
      return { text: `${fmt(dates[0])} is a weekend, so no school to miss. Is it ${fmt(monday)}?`, actions: [], suggestions: [`${names(kids)} is sick ${fmt(monday).slice(5)}`] };
    }
    const when = weekdayDates.length ? weekdayDates : [nextWeekday(plan.today)];
    return { text: `Got it: ${names(kids)} sick on ${when.map(fmt).join(", ")}. I'll re-plan around ${when.length === 1 ? "it" : "them"}, using sick-day reserves first.`, actions: [{ type: "sick", childIds: kids, dates: when }], suggestions: [] };
  }

  if (/\b(snow|ice|storm|closed|closure|no school|cancell?ed|power outage)\b/.test(t) && !isQuestion) {
    if (dates.length && !weekdayDates.length) return { text: `${fmt(dates[0])} is a weekend: school's closed anyway.`, actions: [], suggestions: [] };
    if (!weekdayDates.length) return { text: "Which day is school closed? Try \"School is closed Friday\".", actions: [], suggestions: [] };
    return { text: `School closed on ${weekdayDates.map(fmt).join(", ")}. I'll cover ${weekdayDates.length === 1 ? "it" : "them"}.`, actions: [{ type: "closed", dates: weekdayDates }], suggestions: [] };
  }

  if (helper && /\b(can'?t|cannot|won'?t|unavailable|away|busy|not available|out of town|traveling|travelling|on vacation)\b/.test(t)) {
    if (!weekdayDates.length) return { text: `When is ${helper.name} unavailable? Try "${helper.name} can't help in December".`, actions: [], suggestions: [`${helper.name} can't help in December`] };
    const span = weekdayDates.length > 5 ? `${weekdayDates.length} days (${fmt(weekdayDates[0])} – ${fmt(weekdayDates[weekdayDates.length - 1])})` : weekdayDates.map(fmt).join(", ");
    return { text: `${helper.name} can't help on ${span}. I'll re-plan those days.`, actions: [{ type: "helperOff", helperId: helper.id, dates: weekdayDates }], suggestions: [] };
  }

  const ptoMatch = /(\d{1,3})\s*(?:vacation|pto|days?)\b/.exec(t);
  if (parent && ptoMatch && /\b(vacation|pto|days? off|leave|days? left)\b/.test(t)) {
    const days = Math.min(120, Number(ptoMatch[1]));
    return { text: `${parent.name} has ${days} vacation days left. I'll update that.`, actions: [{ type: "pto", parentId: parent.id, days }], suggestions: [] };
  }

  // After school: activities, walking home, carpools, times, prices.
  const kidIds = findKids(plan, t);
  const days = weekdaysIn(t);
  if (/\bcarpool|car ?pool|swap (pickups?|rides?)|trade (pickups?|rides?)/.test(t) && !isQuestion) {
    const clauses = t.split(/[,;.]|\band\b|\bbut\b|\bwhile\b/);
    const ours = (c: string) => /\b(we|i|us|me|our|my)\b/.test(c);
    const weDrive = [...new Set(clauses.filter(ours).flatMap(weekdaysIn))];
    const theyDrive = [...new Set(clauses.filter((c) => !ours(c)).flatMap(weekdaysIn))].filter((d) => !weDrive.includes(d));
    const who = /\b(?:with )?the ([a-z]+s)\b/.exec(t)?.[1];
    const name = who && !["kids", "days", "weeks", "mondays", "tuesdays", "wednesdays", "thursdays", "fridays"].includes(who) ? `Carpool with the ${cap(who)}` : "Carpool with neighbors";
    if (!theyDrive.length) return { text: "Which days do they pick up your kids, and which do you drive? Try \"Carpool: the Parks drive Mondays, we drive Thursdays\".", actions: [], suggestions: ["Carpool: the Parks drive Mondays, we drive Thursdays"] };
    const list = (d: number[]) => d.map((x) => `${cap(DAYS[x])}s`).join(" & ") || "no days";
    return {
      text: `${name}: they drive ${list(theyDrive)}, you drive ${list(weDrive)}. I'll use it only in weeks where it saves money and a parent can do your days.`,
      actions: [{ type: "carpool", name, theyDrive, weDrive }],
      suggestions: [],
    };
  }

  const activityWords = /\b(soccer|football|basketball|baseball|softball|swim\w*|practice|lessons?|ballet|dance|karate|gymnastics|piano|violin|music|art|chess|robotics|tutoring|scouts|club|band|choir|theater|theatre|hockey|tennis|lacrosse|track|cross country|volleyball|wrestling|cheer\w*)\b/.exec(t);
  if (activityWords && kidIds.length && days.length && !isQuestion && /\b(has|have|goes|go|does|do|plays?|takes?|at|starts?|joined|signed up)\b/.test(t)) {
    const untilMatch = new RegExp(`\\b(?:until|till|til|to|ends? at|is over at|done at|out at)\\s*${CLOCK}`).exec(t);
    const until = untilMatch ? parseClock(untilMatch[1]) ?? undefined : undefined;
    const acts = kidIds.map((childId) => ({ type: "activity" as const, childId, name: activityWords[1], weekdays: days, ...(until ? { until } : {}) }));
    const workEnds = plan.afterSchool?.workEnds ?? "17:30";
    const tail = until && until < workEnds ? `It ends at ${to12(until)}, so I'll plan a pickup from there until work ends.` : `I'll assume it runs until work ends, so no pickup those afternoons. Add "until 4:30" if it ends earlier.`;
    return {
      text: `${names(kidIds)}: ${activityWords[1]} on ${days.map((d) => `${cap(DAYS[d])}s`).join(" & ")}. ${tail}`,
      actions: acts,
      suggestions: [],
    };
  }

  if (kidIds.length && !isQuestion && /\b(walks? home|bikes? home|takes? the bus home|bus home|home alone|stay(s)? (home )?alone|latchkey|old enough)\b/.test(t)) {
    const no = /\b(can'?t|cannot|not|no longer|isn'?t|won'?t)\b/.test(t);
    return {
      text: no ? `${names(kidIds)} will need a pickup again after school.` : `${names(kidIds)} can get home alone after school, so no pickups needed.`,
      actions: kidIds.map((childId) => ({ type: "homeAlone" as const, childId, value: !no })),
      suggestions: [],
    };
  }

  const dismissal = new RegExp(`\\b(school|class(es)?|dismissal|pick ?up)\\b[^\\d]*\\b(ends?|lets out|gets out|is out|finishes|out|at)\\s*(?:at\\s*)?${CLOCK}`).exec(t);
  const workEnds = new RegExp(`\\b(work|shift|job|get off|off work)\\b[^\\d]*?(?:ends?|at|by|until|till)?\\s*(?:at\\s*)?${CLOCK}`).exec(t);
  if ((dismissal || workEnds) && !isQuestion && !/\$/.test(t)) {
    const d = dismissal ? parseClock(dismissal[4]) : null;
    const w = workEnds && !(dismissal && workEnds.index === dismissal.index) ? parseClock(workEnds[2]) : null;
    if (d || w) {
      const parts = [d && `school lets out at ${to12(d)}`, w && `work ends at ${to12(w)}`].filter(Boolean).join(", ");
      return { text: `Got it: ${parts}. I'll re-price every afternoon.`, actions: [{ type: "times", ...(d ? { dismissal: d } : {}), ...(w ? { workEnds: w } : {}) }], suggestions: [] };
    }
  }

  const money = /\$\s?(\d{1,4}(?:\.\d{1,2})?)/.exec(t);
  const perHourAsked = /\b(an? hour|per hour|hourly)\b|\/\s?h(ou)?r\b/.test(t);
  const asOpts = plan.afterSchool?.options.filter((o) => o.kind !== "carpool") ?? [];
  if (money && asOpts.length && /\b(after[- ]?care|after[- ]school|extended day|before and after|afternoon sitter|monthly)\b/.test(t)) {
    const monthly = /\b(a|per) month|monthly\b/.test(t);
    const opt =
      asOpts.find((o) => (monthly ? o.billing === "month" : perHourAsked ? o.billing === "hour" : o.billing !== "month" && o.billing !== "hour") && (/sitter/.test(t) ? o.kind === "sitter" : o.kind === "program")) ??
      asOpts.find((o) => (/sitter/.test(t) ? o.kind === "sitter" : o.kind === "program"));
    if (opt) {
      const price = Math.round(Number(money[1]));
      const unit = opt.billing === "hour" ? "an hour" : opt.billing === "month" ? "a month" : "an afternoon";
      return { text: `${opt.name}: ${usd(price)} ${unit}${opt.pricing === "perChild" ? " per kid" : ""}. I'll re-plan every afternoon.`, actions: [{ type: "afterSchoolPrice", optionId: opt.id, price }], suggestions: [] };
    }
  }

  const paid = findPaid(plan, t);
  if (paid && money) {
    const perHour = /\b(an? hour|per hour|hourly)\b|\/\s?h(ou)?r\b/.test(t);
    const price = perHour ? Math.round(Number(money[1]) * 9) : Math.round(Number(money[1]));
    const actions: AssistantAction[] = [{ type: "price", paidCareId: paid.id, pricePerDay: price }];
    // An hourly sitter rate applies to the afternoon sitter too.
    const pmSitter = perHour ? plan.afterSchool?.options.find((o) => o.kind === "sitter" && o.billing === "hour") : undefined;
    if (pmSitter) actions.push({ type: "afterSchoolPrice", optionId: pmSitter.id, price: Math.round(Number(money[1])) });
    return {
      text: `${paid.name.replace(/\s*\(.*\)\s*$/, "")}: ${usd(price)} a day${perHour ? ` (9 hours at ${usd(Number(money[1]))})` : ""}${pmSitter ? `, and ${pmSitter.name} at ${usd(Number(money[1]))} an hour` : ""}. I'll re-plan with the new price.`,
      actions,
      suggestions: [],
    };
  }

  if (parent && /\b(pick ?up|leave early|get off early|leave work early|get the kids|grab the kids|home by)\b/.test(t)) {
    const wd = DAYS.findIndex((d) => new RegExp(`\\b${d}s?\\b`).test(t));
    if (wd >= 1 && wd <= 5) return { text: `${parent.name} can pick up after school on ${cap(DAYS[wd])}s. I'll use that.`, actions: [{ type: "pickupDay", parentId: parent.id, weekday: wd }], suggestions: [] };
  }

  if (/\b(how much|cost|total|spend|price|budget)\b/.test(t)) {
    const after = planAfterSchool(plan);
    const pto = Object.values(s.ptoUsed).reduce((a, b) => a + b, 0) + Object.values(s.reserveUsed).reduce((a, b) => a + b, 0);
    return {
      text: `No-school days: ${s.gapDays} to cover, ${usd(s.cash)} cash and ${pto} vacation days${s.uncoveredDays ? `, ${s.uncoveredDays} still uncovered` : ""}.${after ? ` After school: about ${usd(after.perMonth)} a month, ${usd(after.total)} until summer.` : ""}`,
      actions: [],
      suggestions: ["How can we save money?", "What if Grandma can't help?"],
    };
  }

  return { text: "I didn't catch that. Here are things I understand:", actions: [], suggestions: EXAMPLES };
}

/** Apply confirmed actions to the plan. */
export function applyActions(plan: FamilyPlan, actions: AssistantAction[]): FamilyPlan {
  let next = plan;
  for (const a of actions) {
    if (a.type === "sick" || a.type === "closed") {
      const keep = next.surprises.filter((x) => !a.dates.includes(x.date));
      const added = a.dates.map((date) => ({ date, reason: a.type === "sick" ? ("sick" as const) : ("snow" as const), childIds: a.type === "sick" ? a.childIds : next.children.map((c) => c.id) }));
      next = { ...next, surprises: [...keep, ...added].sort((x, y) => x.date.localeCompare(y.date)) };
    } else if (a.type === "helperOff") {
      next = { ...next, helpers: next.helpers.map((h) => (h.id === a.helperId ? { ...h, unavailable: [...new Set([...(h.unavailable ?? []), ...a.dates])].sort() } : h)) };
    } else if (a.type === "pto") {
      next = { ...next, parents: next.parents.map((p) => (p.id === a.parentId ? { ...p, ptoDays: a.days, sickReserve: Math.min(p.sickReserve, a.days) } : p)) };
    } else if (a.type === "price") {
      next = { ...next, paidCare: next.paidCare.map((c) => (c.id === a.paidCareId ? { ...c, pricePerDay: a.pricePerDay } : c)) };
    } else if (a.type === "earlyRelease") {
      next = { ...next, school: { ...next.school, earlyRelease: [...new Set([...(next.school.earlyRelease ?? []), ...a.dates])].sort() } };
    } else if (a.type === "activity") {
      next = {
        ...next,
        children: next.children.map((c) =>
          c.id === a.childId
            ? {
                ...c,
                // Same activity again merges the days; other activities give up the days this one now takes.
                activities: [
                  ...(c.activities ?? [])
                    .filter((x) => x.name.toLowerCase() !== a.name.toLowerCase())
                    .map((x) => ({ ...x, weekdays: x.weekdays.filter((w) => !a.weekdays.includes(w)) }))
                    .filter((x) => x.weekdays.length > 0),
                  {
                    name: a.name,
                    weekdays: [...new Set([...(c.activities?.find((x) => x.name.toLowerCase() === a.name.toLowerCase())?.weekdays ?? []), ...a.weekdays])].sort(),
                    ...(a.until ? { until: a.until } : {}),
                  },
                ],
              }
            : c,
        ),
      };
    } else if (a.type === "homeAlone") {
      next = { ...next, children: next.children.map((c) => (c.id === a.childId ? { ...c, homeAloneAfterSchool: a.value || undefined } : c)) };
    } else if (a.type === "carpool" && next.afterSchool) {
      const option = { id: `carpool-${a.theyDrive.join("")}-${a.weDrive.join("")}`, name: a.name, kind: "carpool" as const, price: 0, pricing: "perFamily" as const, weekdays: a.theyDrive, payback: a.weDrive };
      next = { ...next, afterSchool: { ...next.afterSchool, options: [...next.afterSchool.options.filter((o) => o.kind !== "carpool" || o.name !== a.name), option] } };
    } else if (a.type === "times" && next.afterSchool) {
      next = { ...next, afterSchool: { ...next.afterSchool, ...(a.dismissal ? { dismissal: a.dismissal } : {}), ...(a.workEnds ? { workEnds: a.workEnds } : {}) } };
    } else if (a.type === "afterSchoolPrice" && next.afterSchool) {
      next = { ...next, afterSchool: { ...next.afterSchool, options: next.afterSchool.options.map((o) => (o.id === a.optionId ? { ...o, price: a.price } : o)) } };
    } else if (a.type === "pickupDay") {
      next = { ...next, parents: next.parents.map((p) => (p.id === a.parentId ? { ...p, pickupDays: [...new Set([...(p.pickupDays ?? []), a.weekday])].sort() } : p)) };
    }
  }
  return next;
}
