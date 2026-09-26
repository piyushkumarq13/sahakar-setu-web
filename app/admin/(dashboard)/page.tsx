"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { LoadingBlock } from "@/components/ui";
import {
  BarChart,
  KpiCard,
  StatusPill,
  adminGet,
  fmtDate,
} from "@/components/admin/bits";
import type { StatsPayload } from "@/lib/admin/types";

export default function AdminDashboardPage() {
  const { t } = useI18n();
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    adminGet<StatsPayload>("/api/admin/stats")
      .then((s) => alive && setStats(s))
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <p className="card rounded-xl bg-red-50 text-base font-bold text-red-700">
        {t("common.error")}: {error}
      </p>
    );
  }

  if (!stats) {
    return <LoadingBlock lines={6} note={t("common.loading")} />;
  }

  const k = stats.kpis;

  return (
    <div>
      <h1 className="section-title">{t("adm.title")}</h1>
      <p className="mb-5 text-sm font-bold text-ink/50">
        {fmtDate(stats.lastRefresh)}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label={t("adm.kpiGrievances")} value={k.grievances} />
        <KpiCard label={t("adm.kpiPending")} value={k.pending} tone="warn" />
        <KpiCard label={t("adm.kpiResolved")} value={k.resolved} tone="good" />
        <KpiCard label={t("adm.kpiRejected")} value={k.rejected} tone="bad" />
        <KpiCard label={t("adm.kpiSessions")} value={k.sessions} />
        <KpiCard label={t("adm.kpiMessages")} value={k.messages} />
        <KpiCard label={t("adm.kpiCases")} value={k.cases} />
        <KpiCard label={t("adm.kpiAvgStrength")} value={`${k.avgStrength}/100`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <BarChart
          title={t("adm.byStatus")}
          data={stats.grievanceStatus}
          renderLabel={(label) => t(`tr.status.${label}`)}
        />

        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-extrabold text-ink">{t("adm.recent")}</h3>
            <Link
              href="/admin/reports"
              className="text-sm font-bold text-logo-blue underline"
            >
              {t("adm.viewAll")}
            </Link>
          </div>
          {stats.recentReports.length === 0 ? (
            <p className="text-sm font-bold text-ink/50">{t("adm.empty")}</p>
          ) : (
            <ul className="divide-y divide-ink/8">
              {stats.recentReports.map((r) => (
                <li
                  key={r.tracking_id}
                  className="flex flex-wrap items-center gap-3 py-2.5"
                >
                  <Link
                    href={`/admin/reports/${r.tracking_id}`}
                    className="font-mono text-sm font-extrabold text-logo-blue underline"
                  >
                    {r.tracking_id}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink/70">
                    {r.subject}
                  </span>
                  <StatusPill status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
