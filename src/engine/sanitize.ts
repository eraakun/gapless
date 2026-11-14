import { isValidISO, localTodayISO } from "./dates";
import type { FamilyPlan } from "./types";

const num = (v: unknown, fallback = 0, min = -Infinity, max = Infinity): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const date = (v: unknown, fallback: string): string => (typeof v === "string" && isValidISO(v) ? v : fallback);
const dates = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((d): d is string => typeof d === "string" && isValidISO(d)))].sort() : []);
const weekdays = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.slice(0, 60) : fallback);
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as T[]) : []);

/** Makes half-typed form state, saved data or a shared link safe to plan with. Never throws. */
export function sanitizePlan(raw: Partial<FamilyPlan> | null | undefined, today = localTodayISO()): FamilyPlan {
  const p = (raw ?? {}) as Partial<FamilyPlan>;
  const start = date(p.today, today);
  const school = p.school ?? ({} as FamilyPlan["school"]);
  const lastDay = date(school.lastDay, start);
  const nextFirstDay = date(school.nextFirstDay, lastDay);
  let horizonEnd = date(p.horizonEnd, nextFirstDay);
  if (horizonEnd < start) horizonEnd = start;
  // Keep plans to about 15 months so the optimizer stays fast.
  const maxEnd = new Date(Date.parse(`${start}T00:00:00Z`) + 460 * 86_400_000).toISOString().slice(0, 10);
  if (horizonEnd > maxEnd) horizonEnd = maxEnd;

  const out: FamilyPlan = {
    today: start,
    horizonEnd,
    children: list<FamilyPlan["children"][number]>(p.children).slice(0, 6).map((c, i) => ({
      id: str(c.id, `kid-${i}`),
      name: str(c.name, `Child ${i + 1}`),
      age: num(c.age, 6, 0, 18),
      okWithWfhParent: Boolean(c.okWithWfhParent),
      ...(typeof c.schoolId === "string" && c.schoolId ? { schoolId: c.schoolId.slice(0, 60) } : {}),
      ...(c.homeAloneAfterSchool === true ? { homeAloneAfterSchool: true } : {}),
      ...(Array.isArray(c.activities)
        ? {
            activities: list<{ name: unknown; weekdays?: unknown; weekday?: unknown; until?: unknown }>(c.activities)
              .map((a) => {
                // Older saves stored one weekday per activity.
                const raw = Array.isArray(a.weekdays) ? a.weekdays : [a.weekday];
                const weekdays = [...new Set(raw.filter((w): w is number => Number.isInteger(w) && (w as number) >= 1 && (w as number) <= 5))].sort();
                const until = typeof a.until === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(a.until) ? a.until : undefined;
                return { name: str(a.name, "Activity"), weekdays, ...(until ? { until } : {}) };
              })
              .filter((a) => a.weekdays.length > 0)
              .slice(0, 10),
          }
        : {}),
    })),
    parents: list<FamilyPlan["parents"][number]>(p.parents).slice(0, 2).map((x, i) => ({
      id: str(x.id, `parent-${i}`),
      name: str(x.name, `Parent ${i + 1}`),
      workdays: weekdays(x.workdays),
      holidays: dates(x.holidays),
      ptoDays: num(x.ptoDays, 0, 0, 120),
      sickReserve: num(x.sickReserve, 0, 0, 30),
      wfhDays: weekdays(x.wfhDays),
      ...(Array.isArray(x.pickupDays) ? { pickupDays: weekdays(x.pickupDays) } : {}),
    })),
    helpers: list<FamilyPlan["helpers"][number]>(p.helpers).slice(0, 6).map((h, i) => ({
      id: str(h.id, `helper-${i}`),
      name: str(h.name, "Helper"),
      weekdays: weekdays(h.weekdays),
      maxDays: num(h.maxDays, 0, 0, 200),
      costPerDay: num(h.costPerDay, 0, 0, 1000),
      takesSickKids: Boolean(h.takesSickKids),
      ...(typeof h.home === "string" && h.home ? { home: h.home.slice(0, 60) } : {}),
      ...(Array.isArray(h.unavailable) ? { unavailable: dates(h.unavailable) } : {}),
      ...(h.afterSchool === false ? { afterSchool: false } : {}),
    })),
    paidCare: list<FamilyPlan["paidCare"][number]>(p.paidCare).slice(0, 6).map((c, i) => ({
      id: str(c.id, `paid-${i}`),
      name: str(c.name, "Paid care"),
      pricing: c.pricing === "perFamily" ? "perFamily" : "perChild",
      pricePerDay: num(c.pricePerDay, 0, 0, 2000),
      takesSickKids: Boolean(c.takesSickKids),
      availableInSummer: c.availableInSummer !== false,
    })),
    camps: list<FamilyPlan["camps"][number]>(p.camps).slice(0, 12).map((c, i) => ({
      id: str(c.id, `camp-${i}`),
      name: str(c.name, "Camp"),
      start: date(c.start, start),
      end: date(c.end, date(c.start, start)),
      pricePerChildWeek: num(c.pricePerChildWeek, 0, 0, 5000),
      minAge: num(c.minAge, 0, 0, 18),
      maxAge: num(c.maxAge, 18, 0, 18),
      ...(c.registerBy && isValidISO(c.registerBy) ? { registerBy: c.registerBy } : {}),
    })),
    school: { closures: dates(school.closures), lastDay, nextFirstDay, earlyRelease: dates(school.earlyRelease) },
    settings: {
      ptoDayValue: num(p.settings?.ptoDayValue, 150, 0, 5000),
      wfhPenalty: num(p.settings?.wfhPenalty, 40, 0, 5000),
      fsaEnabled: Boolean(p.settings?.fsaEnabled),
      taxRate: num(p.settings?.taxRate, 30, 0, 60),
    },
    surprises: list<FamilyPlan["surprises"][number]>(p.surprises)
      .filter((s) => isValidISO(s.date))
      .map((s) => ({
        date: s.date,
        reason: s.reason === "sick" || s.reason === "snow" ? s.reason : "other",
        childIds: Array.isArray(s.childIds) ? s.childIds.map(String) : [],
      })),
    bookings: list<FamilyPlan["bookings"][number]>(p.bookings)
      .filter((b) => isValidISO(b.weekStart))
      .map((b) => ({ campId: String(b.campId), childId: String(b.childId), weekStart: b.weekStart })),
  };
  const custody = sanitizeCustody(p.custody, out.parents.map((x) => x.id), start);
  if (custody) out.custody = custody;
  // Other schools: each needs a valid calendar; kids pointing at a missing school fall back to the main one.
  const others = list<NonNullable<FamilyPlan["otherSchools"]>[number]>(p.otherSchools)
    .slice(0, 4)
    .map((o, i) => {
      const cal = (o.calendar ?? {}) as FamilyPlan["school"];
      const ld = date(cal.lastDay, lastDay);
      return {
        id: str(o.id, `school-${i + 2}`),
        name: str(o.name, `School ${i + 2}`),
        calendar: { closures: dates(cal.closures), lastDay: ld, nextFirstDay: date(cal.nextFirstDay, ld), earlyRelease: dates(cal.earlyRelease) },
      };
    });
  if (others.length > 0) out.otherSchools = others;
  const schoolIds = new Set(others.map((o) => o.id));
  out.children = out.children.map((c) => (c.schoolId && !schoolIds.has(c.schoolId) ? { ...c, schoolId: undefined } : c));
  if (typeof p.schoolName === "string" && p.schoolName.trim()) out.schoolName = p.schoolName.slice(0, 60);
  // A helper tied to a home must name a real parent.
  const parentIds = new Set(out.parents.map((x) => x.id));
  out.helpers = out.helpers.map((h) => (h.home && !parentIds.has(h.home) ? { ...h, home: undefined } : h));
  const as = p.afterSchool;
  if (as && typeof as === "object") {
    const time = (v: unknown, fb: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fb);
    out.afterSchool = {
      enabled: as.enabled !== false,
      dismissal: time(as.dismissal, "15:00"),
      workEnds: time(as.workEnds, "17:30"),
      leaveEarlyCost: num(as.leaveEarlyCost, 40, 0, 1000),
      earlyReleaseExtraHours: num(as.earlyReleaseExtraHours, 2, 0, 6),
      options: list<NonNullable<FamilyPlan["afterSchool"]>["options"][number]>(as.options).slice(0, 8).map((o, i) => {
        const kind = o.kind === "sitter" || o.kind === "carpool" ? o.kind : "program";
        const billing = o.billing === "hour" || o.billing === "month" ? o.billing : "day";
        const days = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((w): w is number => Number.isInteger(w) && w >= 1 && w <= 5))].sort() : undefined);
        const weekdays = days(o.weekdays);
        const payback = days(o.payback);
        return {
          id: str(o.id, `after-${i}`),
          name: str(o.name, "After-care"),
          kind,
          price: num(o.price, 0, 0, billing === "month" ? 5000 : 1000),
          pricing: o.pricing === "perFamily" ? "perFamily" : "perChild",
          ...(kind === "carpool" ? {} : { billing }),
          ...(weekdays?.length ? { weekdays } : {}),
          ...(kind === "carpool" && payback?.length ? { payback } : {}),
        };
      }),
    };
  }
  if (Array.isArray(p.doneTasks)) out.doneTasks = [...new Set(p.doneTasks.map(String))].slice(0, 500);
  return out;
}

const PATTERNS = ["alternatingWeeks", "2-2-3", "2-2-5-5", "primaryA"] as const;

/** Keeps a custody schedule only if it names two different, existing parents. */
function sanitizeCustody(raw: unknown, parentIds: string[], fallbackStart: string): FamilyPlan["custody"] {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  const parentA = String(c.parentA ?? "");
  const parentB = String(c.parentB ?? "");
  if (parentA === parentB || !parentIds.includes(parentA) || !parentIds.includes(parentB)) return undefined;
  const pattern = PATTERNS.find((x) => x === c.pattern) ?? "alternatingWeeks";
  const ids = [parentA, parentB];
  const changes = (Array.isArray(c.changes) ? c.changes : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .filter((x) => isValidISO(String(x.date)) && ids.includes(String(x.toParent)) && ids.includes(String(x.requestedBy)))
    .slice(0, 500)
    .map((x) => {
      const status = x.status === "approved" || x.status === "declined" ? x.status : "pending";
      return {
        id: String(x.id ?? `${x.date}-${x.requestedBy}`),
        date: String(x.date),
        toParent: String(x.toParent),
        requestedBy: String(x.requestedBy),
        reason: String(x.reason ?? "").slice(0, 300),
        status,
        createdAt: String(x.createdAt ?? ""),
        ...(status !== "pending" && x.decidedAt ? { decidedAt: String(x.decidedAt) } : {}),
        ...(x.response ? { response: String(x.response).slice(0, 300) } : {}),
      } as const;
    });
  const visit = Number(c.midweekVisit);
  return {
    pattern,
    start: date(c.start, fallbackStart),
    parentA,
    parentB,
    firstRefusal: c.firstRefusal === true,
    holidays: c.holidays === "alternate" ? "alternate" : "pattern",
    summer: c.summer === "alternatingWeeks" ? "alternatingWeeks" : "pattern",
    changes,
    exchange: String(c.exchange ?? "").slice(0, 200),
    midweekVisit: Number.isInteger(visit) && visit >= 1 && visit <= 5 && c.midweekVisit !== null ? visit : null,
    costShareA: Number.isFinite(Number(c.costShareA)) ? Math.min(100, Math.max(0, Math.round(Number(c.costShareA)))) : 50,
  };
}
