import type { SourceKind } from "../engine";

/**
 * One highlighter color per kind of coverage, used by the year strip, the
 * month calendar, the legend and lists. `fill` is for SVG.
 */
export const SOURCE_STYLE: Record<SourceKind, { label: string; emoji: string; cell: string; dot: string; fill: string; stroke: string }> = {
  parentOff: { label: "A parent is off", emoji: "🏡", cell: "bg-[#e2dff0] text-slate-800", dot: "bg-[#9a95b3]", fill: "#e2dff0", stroke: "#9a95b3" },
  helper: { label: "Family & friends", emoji: "👵", cell: "bg-[#9ff0cf] text-[#0b4a37]", dot: "bg-[#14b981]", fill: "#9ff0cf", stroke: "#14a36f" },
  wfh: { label: "Work from home", emoji: "💻", cell: "bg-[#a9dcff] text-[#0f3c66]", dot: "bg-[#2b8fe0]", fill: "#a9dcff", stroke: "#2b8fe0" },
  pto: { label: "Vacation day", emoji: "🏖️", cell: "bg-[#ffd458] text-[#4a3200]", dot: "bg-[#f5b400]", fill: "#ffd458", stroke: "#c48a00" },
  camp: { label: "Camp", emoji: "⛺", cell: "bg-[#cfc2ff] text-[#351a94]", dot: "bg-[#6c47ff]", fill: "#cfc2ff", stroke: "#6c47ff" },
  paid: { label: "Paid by the day", emoji: "🧸", cell: "bg-[#ffb4a6] text-[#7a2013]", dot: "bg-[#f2492f]", fill: "#ffb4a6", stroke: "#f2492f" },
  uncovered: { label: "Nobody available", emoji: "⚠️", cell: "bg-[#d23a22] text-white", dot: "bg-[#d23a22]", fill: "#d23a22", stroke: "#7a2013" },
};

/** Which cover to color a day by when kids are split across sources: the one that matters most. */
const PRIORITY: SourceKind[] = ["uncovered", "paid", "pto", "camp", "wfh", "helper", "parentOff"];
export function dominantKind(kinds: SourceKind[]): SourceKind {
  return PRIORITY.find((k) => kinds.includes(k)) ?? "parentOff";
}
