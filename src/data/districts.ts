import { addDaysISO, dateParts, parseISO } from "../engine/dates";
import type { SchoolCalendar } from "../engine/types";
import { FCPS_2026_27_CLOSURES } from "./example";

/** Every Monday-to-Friday date from start to end, inclusive. */
function weekdays(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDaysISO(d, 1)) {
    const dow = dateParts(parseISO(d)).weekday;
    if (dow !== 0 && dow !== 6) out.push(d);
  }
  return out;
}

export interface District {
  id: string;
  name: string;
  /** Where the dates come from, shown to the user. */
  source: string;
  /** Anything the user should double-check. */
  caveat?: string;
  calendar: SchoolCalendar;
}

/**
 * Preset 2026-27 calendars for large US districts: student no-school weekdays only.
 * Early-release days are not closures. Dates checked Nov 2026; districts can revise them.
 */
export const DISTRICTS: District[] = [
  {
    id: "nyc",
    name: "New York City Public Schools (NY)",
    source: "NYCPS 2026-27 school year calendar",
    caveat:
      "Feb 1 (high schools only) is not included; Jun 8 (no classes for elementary and middle school) is. The 2027-28 start date (Sep 9, 2027) is an estimate.",
    calendar: {
      closures: [
        "2026-09-21", // Yom Kippur
        "2026-10-12", // Italian Heritage / Indigenous Peoples' Day
        "2026-11-11", // Veterans Day
        "2026-11-26", "2026-11-27", // Thanksgiving recess
        ...weekdays("2026-12-24", "2027-01-01"), // Winter recess
        "2027-01-18", // MLK Jr. Day
        ...weekdays("2027-02-15", "2027-02-19"), // Midwinter recess
        "2027-03-09", // Eid al-Fitr
        "2027-03-26", // Good Friday
        ...weekdays("2027-04-22", "2027-04-30"), // Spring recess
        "2027-05-17", // Eid al-Adha
        "2027-05-31", // Memorial Day
        "2027-06-08", // Clerical day (elementary, middle, K-12, Pre-K)
        "2027-06-10", // Anniversary Day / Chancellor's Conference Day
      ],
      lastDay: "2027-06-28",
      nextFirstDay: "2027-09-09",
    },
  },
  {
    id: "lausd",
    name: "Los Angeles Unified (CA)",
    source: "LAUSD 2026-27 single-track instructional calendar",
    caveat: "Some schools swap Jan 11 and Jun 7; check yours. The 2027-28 start date (Aug 12, 2027) comes from a third-party listing.",
    calendar: {
      closures: [
        "2026-09-04", // Admission Day
        "2026-09-07", // Labor Day
        "2026-09-21", // Unassigned day
        "2026-11-11", // Veterans Day
        ...weekdays("2026-11-23", "2026-11-27"), // Thanksgiving break
        ...weekdays("2026-12-21", "2027-01-08"), // Winter recess
        "2027-01-18", // MLK Jr. Day
        "2027-02-15", // Presidents' Day
        ...weekdays("2027-03-22", "2027-03-26"), // Spring recess
        "2027-03-31", // Cesar Chavez Day
        "2027-05-31", // Memorial Day
      ],
      lastDay: "2027-06-04",
      nextFirstDay: "2027-08-12",
    },
  },
  {
    id: "cps",
    name: "Chicago Public Schools (IL)",
    source: "CPS 2026-27 academic calendar (Board-adopted Feb 26, 2026)",
    caveat: "K-12 dates. Preschool ends one day earlier.",
    calendar: {
      closures: [
        "2026-09-07", // Labor Day
        "2026-09-25", // Professional development day
        "2026-10-12", // Indigenous Peoples' Day
        "2026-11-02", // Parent-teacher conference day
        "2026-11-03", // Election Day
        "2026-11-11", // Professional development day
        ...weekdays("2026-11-23", "2026-11-27"), // Thanksgiving break
        ...weekdays("2026-12-21", "2027-01-01"), // Winter vacation
        "2027-01-04", // Professional development day
        "2027-01-18", // MLK Jr. Day
        "2027-01-29", // Professional development day
        "2027-02-15", // Presidents' Day
        "2027-02-23", // Professional development day
        ...weekdays("2027-03-22", "2027-03-26"), // Spring vacation
        "2027-04-06", // Professional development day
        "2027-04-12", // Parent-teacher conference day
        "2027-05-31", // Memorial Day
      ],
      lastDay: "2027-06-11",
      nextFirstDay: "2027-08-23",
    },
  },
  {
    id: "mdcps",
    name: "Miami-Dade County Public Schools (FL)",
    source: "M-DCPS 2026-27 calendar, as listed on agendahero.com",
    caveat: "Teacher planning days count as no school for students. The 2027-28 start date (Aug 12, 2027) is an estimate.",
    calendar: {
      closures: [
        "2026-09-07", // Labor Day
        "2026-09-21", // Teacher planning day
        "2026-11-03", // District-wide professional learning day
        "2026-11-11", // Veterans Day
        ...weekdays("2026-11-23", "2026-11-27"), // Thanksgiving break
        "2026-12-18", // Teacher planning day
        ...weekdays("2026-12-21", "2027-01-01"), // Winter recess
        "2027-01-15", // Teacher planning day
        "2027-01-18", // MLK Jr. Day
        "2027-02-15", // Presidents' Day
        "2027-03-10", // Teacher planning day
        ...weekdays("2027-03-22", "2027-03-26"), // Spring recess
        "2027-03-29", // Teacher planning day
        "2027-05-31", // Memorial Day
      ],
      lastDay: "2027-06-03",
      nextFirstDay: "2027-08-12",
    },
  },
  {
    id: "hisd",
    name: "Houston ISD (TX)",
    source: "HISD 2026-27 yearly calendar, as listed on agendahero.com",
    caveat: "The 2027-28 start date (Aug 9, 2027) is an estimate.",
    calendar: {
      closures: [
        "2026-09-07", // Labor Day
        "2026-09-21", // Staff PD day
        "2026-10-09", // Staff PD day
        "2026-11-06", // Staff PD day
        ...weekdays("2026-11-23", "2026-11-27"), // Thanksgiving recess
        ...weekdays("2026-12-21", "2027-01-01"), // Winter recess
        "2027-01-04", // Staff PD day
        "2027-01-18", // MLK Jr. Day
        "2027-02-15", // Staff PD day
        ...weekdays("2027-03-08", "2027-03-12"), // Spring recess
        "2027-03-26", // Recess
        "2027-04-16", // Staff PD day
      ],
      lastDay: "2027-05-28",
      nextFirstDay: "2027-08-09",
    },
  },
  {
    id: "fcps",
    name: "Fairfax County Public Schools (VA)",
    source: "FCPS 2026-27 calendar as published by a third-party listing",
    caveat: "The 2027-28 start date (Aug 23, 2027) is an estimate.",
    calendar: { closures: FCPS_2026_27_CLOSURES, lastDay: "2027-06-16", nextFirstDay: "2027-08-23" },
  },
];

export function findDistrict(id: string): District | undefined {
  return DISTRICTS.find((d) => d.id === id);
}
