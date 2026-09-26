"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { LoadingBlock } from "@/components/ui";
import { StatusPill, adminGet, fmtDate } from "@/components/admin/bits";
import type { ReportListItem, ReportListResponse } from "@/lib/admin/types";

// Admin-settable statuses (kept in sync with lib/admin/auth.ts — that module
// is server-only, so the list is mirrored here for the client filter).
const STATUS_OPTIONS = [
  "submitted",
  "acknowledged",
  "escalated",
  "resolved",
  "rejected",
] as const;

export default function AdminReportsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<ReportListItem[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    adminGet<ReportListResponse>("/api/admin/grievances")
      .then((r) => alive && setItems(r.items))
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (status && it.status !== status) return false;
      if (
        needle &&
        !(
          it.tracking_id.toLowerCase().includes(needle) ||
          it.subject.toLowerCase().includes(needle) ||
          it.addressee.toLowerCase().includes(needle)
        )
      ) {
        return false;
      }
      return true;
    });
  }, [items, q, status]);

  if (error) {
    return (
      <p className="card rounded-xl bg-red-50 text-base font-bold text-red-700">
        {t("common.error")}: {error}
      </p>
    );
  }

  return (
    <div>
      <h1 className="section-title">{t("adm.reportsTitle")}</h1>
      <p className="mb-4 text-sm font-bold text-ink/50">
        {items ? `${filtered.length} / ${items.length}` : ""}
      </p>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          className="input min-h-[48px] flex-1"
          placeholder={t("adm.searchPh")}
          aria-label={t("adm.searchPh")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input min-h-[48px] sm:w-64"
          aria-label={t("adm.colStatus")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t("adm.allStatuses")}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {t(`tr.status.${s}`)}
            </option>
          ))}
        </select>
      </div>

      {!items ? (
        <LoadingBlock lines={5} note={t("common.loading")} />
      ) : filtered.length === 0 ? (
        <div className="card py-10 text-center">
          <p className="text-base font-bold text-ink/60">{t("adm.empty")}</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-start">
            <thead>
              <tr className="border-b-2 border-ink/10 text-start text-sm font-extrabold text-ink/60">
                <th className="px-4 py-3 text-start">{t("adm.colId")}</th>
                <th className="px-4 py-3 text-start">{t("adm.colSubject")}</th>
                <th className="px-4 py-3 text-start">{t("adm.colStatus")}</th>
                <th className="px-4 py-3 text-start">{t("adm.colUpdates")}</th>
                <th className="px-4 py-3 text-start">{t("adm.colUpdated")}</th>
                <th className="px-4 py-3 text-start"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/8">
              {filtered.map((it) => (
                <tr key={it.tracking_id} className="text-sm">
                  <td className="px-4 py-3 font-mono font-extrabold text-ink">
                    {it.tracking_id}
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-3 font-bold text-ink/80">
                    {it.subject}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={it.status} />
                  </td>
                  <td className="px-4 py-3 font-bold text-ink/60">{it.updates}</td>
                  <td className="px-4 py-3 font-bold text-ink/60">
                    {fmtDate(it.updated_at)}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/admin/reports/${it.tracking_id}`}
                      className="btn-outline min-h-[40px] px-4 py-1.5 text-sm"
                    >
                      {t("adm.open")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
