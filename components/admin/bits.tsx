"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { StatusChip } from "@/components/ui";

/** Fetch JSON from an admin API route. On 401 it throws — the admin layout
 * gate redirects to the login page on the next navigation anyway. */
export async function adminGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) {
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function adminPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function fmtDay(iso: string): string {
  return iso.slice(5); // MM-DD
}

/** Status pill using the shared tr.status.* labels. */
export function StatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  return <StatusChip status={status} label={t(`tr.status.${status}`)} />;
}

export function KpiCard({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: ReactNode;
  tone?: "plain" | "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good"
      ? "text-primary-700"
      : tone === "warn"
        ? "text-accent-600"
        : tone === "bad"
          ? "text-red-700"
          : "text-ink";
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-sm font-bold text-ink/60">{label}</span>
      <span className={`text-3xl font-extrabold ${toneCls}`}>{value}</span>
    </div>
  );
}

export function BarChart({
  title,
  data,
  renderLabel,
}: {
  title: string;
  data: { label: string; count: number }[];
  renderLabel?: (label: string) => string;
}) {
  const { t } = useI18n();
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="card">
      <h3 className="mb-3 text-lg font-extrabold text-ink">{title}</h3>
      {data.length === 0 || data.every((d) => d.count === 0) ? (
        <p className="text-sm font-bold text-ink/50">{t("adm.noData")}</p>
      ) : (
        <ul className="space-y-2.5">
          {data.map((d) => (
            <li key={d.label} className="flex items-center gap-3">
              <span className="w-36 shrink-0 truncate text-sm font-bold text-ink/70">
                {renderLabel ? renderLabel(d.label) : d.label}
              </span>
              <span className="h-4 flex-1 overflow-hidden rounded-full bg-ink/8">
                <span
                  className="block h-4 rounded-full bg-primary"
                  style={{
                    width: `${Math.max(4, Math.round((d.count / max) * 100))}%`,
                  }}
                />
              </span>
              <span className="w-10 shrink-0 text-right text-sm font-extrabold text-ink">
                {d.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
