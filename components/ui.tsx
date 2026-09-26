"use client";

import { useI18n } from "@/lib/i18n";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function LoadingBlock({
  lines = 3,
  note,
}: {
  lines?: number;
  note?: string;
}) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      {note && <p className="text-base font-bold text-ink/70">{note}</p>}
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-5 ${i === 0 ? "w-3/4" : i === 1 ? "w-full" : "w-1/2"}`} />
      ))}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-[3px] border-ink/20 border-t-primary ${className}`}
      aria-hidden="true"
    />
  );
}

export function StrengthMeter({ score }: { score: number }) {
  const { t } = useI18n();
  const r = 44;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 60 ? "#2E8B57" : pct >= 30 ? "#FFA500" : "#D64545";
  return (
    <div className="relative h-32 w-32" role="img" aria-label={`${t("cs.strength")}: ${pct}/100`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#E8E3DA" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-ink">{pct}</span>
        <span className="text-xs font-bold text-ink/60">/100</span>
      </div>
    </div>
  );
}

export function StatusChip({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  const map: Record<string, string> = {
    drafted: "chip-gray",
    submitted: "chip-blue",
    acknowledged: "chip-orange",
    escalated: "chip-orange",
    resolved: "chip-success",
    rejected: "chip-red",
    open: "chip-orange",
    pending: "chip-blue",
    closed: "chip-gray",
    current: "chip-orange",
    completed: "chip-success",
  };
  return (
    <span className={`${map[status] || "chip-gray"} whitespace-nowrap`}>
      {label}
    </span>
  );
}
