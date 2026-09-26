"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { LoadingBlock } from "@/components/ui";
import { BarChart, KpiCard, adminGet, fmtDay } from "@/components/admin/bits";
import type { StatsPayload } from "@/lib/admin/types";

export default function AdminAnalyticsPage() {
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

  return (
    <div>
      <h1 className="section-title">{t("adm.analyticsTitle")}</h1>
      <p className="mb-5 text-sm font-bold text-ink/50">
        {t("adm.kpiAvgStrength")}: {stats.kpis.avgStrength}/100
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart
          title={t("adm.byStatus")}
          data={stats.grievanceStatus}
          renderLabel={(label) => t(`tr.status.${label}`)}
        />
        <BarChart
          title={t("adm.byChannel")}
          data={stats.channels}
        />
        <BarChart
          title={t("adm.byLanguage")}
          data={stats.languages}
        />
        <BarChart
          title={t("adm.byCategory")}
          data={stats.casesByCategory}
        />
        <div className="lg:col-span-2">
          <BarChart
            title={t("adm.messages14")}
            data={stats.messagesByDay.map((d) => ({
              label: fmtDay(d.day),
              count: d.count,
            }))}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label={t("adm.kpiGrievances")} value={stats.kpis.grievances} />
        <KpiCard label={t("adm.kpiSessions")} value={stats.kpis.sessions} />
        <KpiCard label={t("adm.kpiMessages")} value={stats.kpis.messages} />
      </div>
    </div>
  );
}
