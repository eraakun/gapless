import type { ISODate } from "./dates";

/** 0 = Sunday ... 6 = Saturday */
export type Weekday = number;

export interface Child {
  id: string;
  name: string;
  age: number;
  /** Old enough to be home while a parent works from home. */
  okWithWfhParent: boolean;
  /** Id of one of `otherSchools` when this kid's school has its own calendar. Unset = the family's main school. */
  schoolId?: string;
  /** Old enough to get home and stay alone after school (often 12+). */
  homeAloneAfterSchool?: boolean;
  /** Weekly activities that take a kid straight from school (practice, lessons, clubs). */
  activities?: Activity[];
}

export interface Activity {
  name: string;
  /** Weekdays it meets (1 = Mon … 5 = Fri). */
  weekdays: Weekday[];
  /** "HH:MM" it ends. Unset = runs until the workday ends, so no pickup that afternoon. */
  until?: string;
}

export interface Parent {
  id: string;
  name: string;
  /** Weekdays this parent normally works. */
  workdays: Weekday[];
  /** Dates this parent's employer is closed (holidays), so they're home. */
  holidays: ISODate[];
  /** Vacation days (PTO) left to spend between today and the end of the plan. */
  ptoDays: number;
  /** PTO held back for sick kids and surprise closures. Only those days can use it. */
  sickReserve: number;
  /** Weekdays this parent can work from home. */
  wfhDays: Weekday[];
  /** Weekdays this parent can leave work early for school pickup. */
  pickupDays?: Weekday[];
}

/** A free or cheap helper: grandparent, relative, neighbor swap. */
export interface Helper {
  id: string;
  name: string;
  weekdays: Weekday[];
  maxDays: number;
  /** Cash per day, usually 0. */
  costPerDay: number;
  /** Will they watch a sick child? */
  takesSickKids: boolean;
  /** With two homes: the parent whose days this helper covers (e.g. Mom's mother). Unset = either home. */
  home?: string;
  /** Dates this helper can't help (a trip, a busy month). */
  unavailable?: ISODate[];
  /** Also picks kids up after school on their weekdays. Default true. */
  afterSchool?: boolean;
}

/** Day-by-day paid care: drop-in programs, babysitters, backup care. */
export interface PaidCare {
  id: string;
  name: string;
  pricing: "perChild" | "perFamily";
  pricePerDay: number;
  takesSickKids: boolean;
  /** Some programs (rec-center drop-in days) only run on school-year closure days, not all summer. */
  availableInSummer: boolean;
}

/** Week-long programs, billed per child per week (Mon-Fri). */
export interface Camp {
  id: string;
  name: string;
  start: ISODate;
  end: ISODate;
  pricePerChildWeek: number;
  minAge: number;
  maxAge: number;
  registerBy?: ISODate;
}

export interface SchoolCalendar {
  /** Weekdays with no school during the school year (holidays, breaks, teacher workdays). */
  closures: ISODate[];
  /** Last day of school before summer. */
  lastDay: ISODate;
  /** First day of the next school year. Weekdays in between are summer. */
  nextFirstDay: ISODate;
  /** School days that end early (early release / half days). Kids need an afternoon pickup, not a full day. */
  earlyRelease?: ISODate[];
}

/** A way to cover the hours between school dismissal and the end of the workday. */
export interface AfterSchoolOption {
  id: string;
  name: string;
  kind: "program" | "sitter" | "carpool";
  /** Cash per unit of `billing` (unused for carpools). */
  price: number;
  pricing: "perChild" | "perFamily";
  /** "day": per afternoon (drop-in). "hour": per hour from dismissal to the end of work. "month": a monthly enrollment for fixed weekdays. Default "day". */
  billing?: "day" | "hour" | "month";
  /** Monthly enrollment: the weekdays it covers. Carpool: the weekdays the other family drives. */
  weekdays?: Weekday[];
  /** Carpool: the weekdays you drive their kids in return. */
  payback?: Weekday[];
}

/** The daily gap: school ends mid-afternoon, work doesn't. */
export interface AfterSchoolSettings {
  enabled: boolean;
  /** When school lets out, "HH:MM". */
  dismissal: string;
  /** When the working parents get home, "HH:MM". */
  workEnds: string;
  options: AfterSchoolOption[];
  /** What leaving work early once costs you (lost hours, goodwill). */
  leaveEarlyCost: number;
  /** Extra hours of care on early-release days. Default 2. */
  earlyReleaseExtraHours?: number;
}

/** A second (or third) school with its own calendar, for kids who go to a different school. */
export interface OtherSchool {
  id: string;
  name: string;
  calendar: SchoolCalendar;
}

export type SurpriseReason = "sick" | "snow" | "other";

/** A closure nobody planned for: a sick kid, a snow day. */
export interface SurpriseDay {
  date: ISODate;
  reason: SurpriseReason;
  /** Which kids need care. For a sick day, just the sick kid. */
  childIds: string[];
}

/** A camp week you've already booked and paid for, so the planner keeps it. */
export interface CampBooking {
  campId: string;
  childId: string;
  weekStart: ISODate;
}

export interface Settings {
  /** What one vacation day is worth to you, in dollars. The planner only spends PTO when it saves more than this. */
  ptoDayValue: number;
  /** Cost you put on working from home with a kid (lost focus). */
  wfhPenalty: number;
  /** Does an employer offer a Dependent Care FSA? Used to estimate tax savings on paid care and day camps. */
  fsaEnabled?: boolean;
  /** Combined marginal tax rate the FSA saves, as a percent (federal + payroll + state). */
  taxRate?: number;
}

/** How kids split time between two homes. Each pattern repeats every 14 days from `start`. */
export type CustodyPattern = "alternatingWeeks" | "2-2-3" | "2-2-5-5" | "primaryA";

export interface Custody {
  pattern: CustodyPattern;
  /** A Monday when Parent A's turn of the cycle begins. */
  start: ISODate;
  parentA: string;
  parentB: string;
  /**
   * Right of first refusal: the parent who doesn't have the kids that day may
   * still take them (a day off, a vacation day) before anyone is paid.
   */
  firstRefusal: boolean;
  /** "alternate": Thanksgiving and each half of winter break go to Parent A in even years, B in odd years. */
  holidays?: "pattern" | "alternate";
  /** "alternatingWeeks": summer switches to week on, week off. */
  summer?: "pattern" | "alternatingWeeks";
  /** Requests to move a day to the other parent. Only approved ones change the schedule. */
  changes?: ScheduleChange[];
  /** Where and when the kids change homes, e.g. "Fridays 6 pm at school". */
  exchange?: string;
  /** Weekday (0=Sun) of an evening visit with the parent who doesn't have the kids that day. Null for none. */
  midweekVisit?: number | null;
  /** Parent A's share (0-100) of paid childcare and camp costs. Parent B pays the rest. */
  costShareA?: number;
}

export type ChangeStatus = "pending" | "approved" | "declined";

/** One parent asks the other to move a day. Both sides of the decision are logged with timestamps. */
export interface ScheduleChange {
  id: string;
  date: ISODate;
  /** The parent who would have the kids that day if approved. */
  toParent: string;
  requestedBy: string;
  reason: string;
  status: ChangeStatus;
  /** ISO timestamp. */
  createdAt: string;
  decidedAt?: string;
  /** Why it was declined, or a note with the approval. */
  response?: string;
}

export interface FamilyPlan {
  today: ISODate;
  horizonEnd: ISODate;
  children: Child[];
  parents: Parent[];
  helpers: Helper[];
  paidCare: PaidCare[];
  camps: Camp[];
  school: SchoolCalendar;
  settings: Settings;
  surprises: SurpriseDay[];
  bookings: CampBooking[];
  /** Set only for separated or divorced parents. */
  custody?: Custody;
  /** Ids of reminders the family has checked off. */
  doneTasks?: string[];
  /** Schools other than the main one, for kids on a different calendar. */
  otherSchools?: OtherSchool[];
  /** Display name for the main school. */
  schoolName?: string;
  /** Every-school-day pickups and after-care. */
  afterSchool?: AfterSchoolSettings;
}

export type GapReason = "closure" | "summer" | SurpriseReason;

/** A weekday when at least one kid needs care and every parent is working. */
export interface GapDay {
  date: ISODate;
  childIds: string[];
  reason: GapReason;
  /** True for surprise days (sick, snow), which can use the PTO reserve. */
  surprise: boolean;
}

export type SourceKind = "parentOff" | "camp" | "pto" | "helper" | "wfh" | "paid" | "uncovered";

export interface Cover {
  kind: SourceKind;
  /** Parent, helper, camp or paid-care id. */
  refId: string;
  label: string;
  childIds: string[];
  cash: number;
}

export interface DayPlan {
  date: ISODate;
  reason: GapReason;
  childIds: string[];
  covers: Cover[];
}

export interface CampWeek {
  campId: string;
  childId: string;
  weekStart: ISODate;
  price: number;
  locked: boolean;
}

export interface PlanSummary {
  cash: number;
  ptoUsed: Record<string, number>;
  reserveUsed: Record<string, number>;
  helperDays: Record<string, number>;
  wfhDays: number;
  paidDays: number;
  campWeeks: number;
  gapDays: number;
  freeParentDays: number;
  uncoveredDays: number;
  /** cash + PTO valued at ptoDayValue + WFH penalties. What the optimizer minimizes. */
  objective: number;
}

export interface CoveragePlan {
  days: DayPlan[];
  campWeeks: CampWeek[];
  summary: PlanSummary;
}
