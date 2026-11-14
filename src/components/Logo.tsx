/**
 * The Gapless mark, from the team's sketch: a family (Mom, two kids, Dad)
 * holding up a wall calendar. Their hands double as the calendar's rings.
 * The diagonal days are the gaps the family covers; in the large version
 * they spell F-A-M. On load the three days light up one after another.
 */
const INK = "#351a94";
const GRAPE = "#5a32f0";
const SUN = "#ffc83d";

const CELLS: Array<[number, number]> = [
  [9.5, 30], [20, 30], [30.5, 30],
  [9.5, 39], [20, 39], [30.5, 39],
  [9.5, 48], [20, 48], [30.5, 48],
];
const DIAGONAL = [0, 4, 8];
const LETTERS = ["F", "A", "M"];

export function LogoMark({ className = "h-11 w-auto", animate = true, letters = false }: { className?: string; animate?: boolean; letters?: boolean }) {
  return (
    <svg viewBox="0 0 48 58" className={className} role="img" aria-label="Gapless">
      {/* The family, peeking over the top */}
      <g fill={INK}>
        <circle cx="12" cy="9" r="5" />
        <circle cx="16.6" cy="4.6" r="2.3" />
        <rect x="5.5" y="14" width="13" height="9" rx="6" />
        <circle cx="20.6" cy="11.8" r="3.6" />
        <rect x="16.4" y="15.8" width="8.4" height="7" rx="4" />
        <circle cx="27.4" cy="11.8" r="3.6" />
        <rect x="23.2" y="15.8" width="8.4" height="7" rx="4" />
        <circle cx="36" cy="9" r="5" />
        <rect x="29.5" y="14" width="13" height="9" rx="6" />
      </g>
      {/* The calendar, with a sun-yellow header */}
      <rect x="2" y="18" width="44" height="38" rx="9" fill={GRAPE} stroke="#fff" strokeWidth="1.5" />
      <path d="M11 18.75 H37 A8.25 8.25 0 0 1 45.25 27 H2.75 A8.25 8.25 0 0 1 11 18.75 Z" fill={SUN} />
      {/* Parents' hands, holding it up (and reading as the rings) */}
      <rect x="7" y="17" width="9" height="4.5" rx="2.25" fill={INK} stroke="#fff" strokeWidth="1" />
      <rect x="32" y="17" width="9" height="4.5" rx="2.25" fill={INK} stroke="#fff" strokeWidth="1" />
      {CELLS.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="8" height="6.5" rx="2" fill="#fff" />
      ))}
      {/* The covered days */}
      {DIAGONAL.map((cell, k) => {
        const [x, y] = CELLS[cell];
        return (
          <g
            key={cell}
            className={animate ? "gap-fill" : undefined}
            style={{ transformBox: "fill-box", transformOrigin: "center", animationDelay: animate ? `${250 + k * 180}ms` : undefined }}
          >
            <rect x={x} y={y} width="8" height="6.5" rx="2" fill={SUN} stroke={INK} strokeWidth="1" />
            {letters && (
              <text x={x + 4} y={y + 5.1} textAnchor="middle" fontSize="5.4" fontWeight="700" fontFamily="Fredoka, Nunito, sans-serif" fill={INK}>
                {LETTERS[k]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <span className="inline-flex items-end gap-2">
      <LogoMark className={big ? "h-20 w-auto" : "h-14 w-auto"} letters={big} />
      <span className={`pb-0.5 font-[family-name:var(--font-display)] font-bold leading-none tracking-tight text-teal-900 ${big ? "text-5xl" : "text-[1.9rem]"}`} aria-hidden>
        gapless
      </span>
    </span>
  );
}
