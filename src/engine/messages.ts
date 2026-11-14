import { dateParts, parseISO, type ISODate } from "./dates";
import type { FamilyPlan } from "./types";
import type { PlanTask } from "./tasks";

/** A ready-to-send message for one to-do: the last step from plan to "it's arranged". */
export interface DraftMessage {
  channel: "email" | "text";
  /** Who it's for, in words ("your manager", "Grandma Linda"). */
  to: string;
  subject?: string;
  body: string;
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (iso: ISODate) => {
  const { weekday, month, day } = dateParts(parseISO(iso));
  return `${DAY[weekday]}, ${MONTH[month - 1]} ${day}`;
};
const dateList = (dates: ISODate[]) => (dates.length === 1 ? fmt(dates[0]) : `${dates.slice(0, -1).map(fmt).join("; ")} and ${fmt(dates[dates.length - 1])}`);
const names = (plan: FamilyPlan, ids: string[] = []) => {
  const n = ids.map((id) => plan.children.find((c) => c.id === id)?.name).filter(Boolean) as string[];
  if (n.length === 0) return "the kids";
  return n.length === 1 ? n[0] : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};

/** Draft the message a parent would send for this task, or null when there's nobody to message (in-app requests). */
export function draftMessage(plan: FamilyPlan, task: PlanTask): DraftMessage | null {
  const kids = names(plan, task.kidIds);
  const days = dateList(task.dates);
  const n = task.dates.length;
  switch (task.kind) {
    case "pto": {
      const me = plan.parents.find((p) => p.id === task.ref)?.name ?? "";
      return {
        channel: "email",
        to: "your manager",
        subject: `Time off request: ${days}`,
        body: `Hi,\n\nI'd like to request ${n} day${n === 1 ? "" : "s"} of vacation on ${days}. My kids' school is closed ${n === 1 ? "that day" : "those days"}, and I've arranged care for the rest of the break.\n\nI'll make sure my work is covered before I'm out. Please let me know if that works.\n\nThanks,\n${me}`,
      };
    }
    case "helper": {
      const h = plan.helpers.find((x) => x.id === task.ref);
      return {
        channel: "text",
        to: h?.name ?? "your helper",
        body: `Hi ${h?.name ?? ""}! School's closed on ${days}. Could you watch ${kids} ${n === 1 ? "that day" : "those days"}? We'd drop them off in the morning and pick them up after work. Thank you so much! ❤️`,
      };
    }
    case "paid": {
      const care = plan.paidCare.find((x) => x.id === task.ref);
      return {
        channel: "text",
        to: care?.name ?? "your sitter",
        body: `Hi! Are you available to watch ${kids} on ${days}, roughly 8 am to 5:30 pm? School is closed. Please let me know if those days work. Thanks!`,
      };
    }
    case "pickup":
      return {
        channel: "text",
        to: plan.custody ? "your co-parent" : "family or a sitter",
        body: `Heads up: school lets out early on ${days}. Could you pick up ${kids} at dismissal? Thanks!`,
      };
    case "camp": {
      const camp = plan.camps.find((x) => x.id === task.ref);
      return {
        channel: "email",
        to: "yourself (a reminder)",
        subject: `Register for ${camp?.name ?? "camp"} by ${fmt(task.due)}`,
        body: `Register ${kids} for ${camp?.name ?? "camp"}: ${task.detail}.\nDeadline: ${fmt(task.due)}.\nPlanned with Gapless.`,
      };
    }
    default:
      return null;
  }
}

/** mailto: / sms: links that open the phone's mail or messages app with the draft filled in. */
export function messageLink(m: DraftMessage): string {
  if (m.channel === "email") return `mailto:?subject=${encodeURIComponent(m.subject ?? "")}&body=${encodeURIComponent(m.body)}`;
  // "sms:?&body=" opens a new message with the body on both iOS and Android.
  return `sms:?&body=${encodeURIComponent(m.body)}`;
}
