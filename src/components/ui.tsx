import { useEffect, useId, useState, type ReactNode } from "react";

export function Card({ title, aside, children, className = "" }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border-2 border-b-4 border-slate-200 bg-white p-5 sm:p-6 ${className}`}>
      {(title || aside) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-slate-900">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  min?: number;
  max?: number;
  step?: number;
  hideLabel?: boolean;
  className?: string;
}

/**
 * Number input that keeps the raw text while you type, so clearing the
 * field or typing "12." doesn't snap back to a number mid-keystroke.
 */
export function NumberField({ label, value, onChange, prefix, min, max, step = 1, hideLabel, className = "" }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "mb-1 block text-xs font-medium text-slate-600"}>
        {label}
      </label>
      <div className="flex items-center rounded-lg border border-slate-300 bg-white focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/20">
        {prefix && <span className="pl-2.5 text-sm text-slate-400">{prefix}</span>}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseFloat(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => setText(String(value))}
          className="w-full min-w-0 rounded-lg bg-transparent px-2.5 py-1.5 text-sm text-slate-900 outline-none"
        />
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm text-slate-700"
    >
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-teal-600" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

export function ProBadge() {
  return <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold text-slate-900">Pro</span>;
}
