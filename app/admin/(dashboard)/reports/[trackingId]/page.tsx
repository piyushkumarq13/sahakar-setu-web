"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/Toast";
import { LoadingBlock, Spinner } from "@/components/ui";
import { StatusPill, adminGet, adminPost, fmtDate } from "@/components/admin/bits";
import type {
  ReportDetail,
  StatusUpdateResponse,
} from "@/lib/admin/types";

// Mirrors ADMIN_STATUSES in lib/admin/auth.ts (server-only).
const STATUS_OPTIONS = [
  "submitted",
  "acknowledged",
  "escalated",
  "resolved",
  "rejected",
] as const;

export default function AdminReportDetailPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const params = useParams<{ trackingId: string }>();
  const trackingId = params?.trackingId || "";

  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [error, setError] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    adminGet<ReportDetail>(`/api/admin/grievances/${encodeURIComponent(trackingId)}`)
      .then(setDetail)
      .catch((e) => setError(String(e?.message || e)));
  }, [trackingId]);

  useEffect(() => {
    if (trackingId) load();
  }, [trackingId, load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!newStatus || saving) return;
    setSaving(true);
    try {
      const res = await adminPost<StatusUpdateResponse>(
        `/api/admin/grievances/${encodeURIComponent(trackingId)}/status`,
        { status: newStatus, note }
      );
      if (detail) {
        setDetail({ ...detail, status: newStatus, timeline: res.timeline });
      }
      setNewStatus("");
      setNote("");
      toast(t("adm.savedOk"), "success");
    } catch {
      toast(t("adm.saveErr"), "error");
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <p className="card rounded-xl bg-red-50 text-base font-bold text-red-700">
        {t("common.error")}: {error}
      </p>
    );
  }
  if (!detail) {
    return <LoadingBlock lines={6} note={t("common.loading")} />;
  }

  return (
    <div>
      <Link
        href="/admin/reports"
        className="mb-3 inline-flex min-h-[44px] items-center text-base font-bold text-logo-blue underline"
      >
        ← {t("adm.reportsTitle")}
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-2xl font-extrabold text-ink">
            {detail.tracking_id}
          </p>
          <p className="text-base font-bold text-ink/70">{detail.subject}</p>
          <p className="text-sm font-bold text-ink/50">
            {detail.addressee} · {detail.language} · {fmtDate(detail.created_at)}
          </p>
        </div>
        <StatusPill status={detail.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Letter + case context */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="mb-2 text-lg font-extrabold text-ink">
              {t("adm.body")}
            </h3>
            <p className="whitespace-pre-wrap text-sm font-bold leading-relaxed text-ink/70">
              {detail.body}
            </p>
          </div>

          {detail.case && (
            <div className="card">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-extrabold text-ink">
                  {t("adm.caseInfo")}
                </h3>
                <Link
                  href={`/case/${detail.case.id}`}
                  className="text-sm font-bold text-logo-blue underline"
                >
                  {t("common.viewDetails")}
                </Link>
              </div>
              <p className="mb-3 text-sm font-bold text-ink/60">
                {t("adm.category")}: {detail.case.category} · {t("adm.strength")}:{" "}
                {detail.case.strength_score}/100
              </p>
              {detail.case.facts && detail.case.facts.length > 0 ? (
                <ul className="space-y-1.5">
                  {detail.case.facts.map((f) => (
                    <li
                      key={f.fact_key}
                      className="flex flex-wrap gap-2 text-sm"
                    >
                      <span className="font-extrabold text-ink/70">
                        {f.fact_key}:
                      </span>
                      <span className="font-bold text-ink/60">{f.fact_value}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm font-bold text-ink/50">{t("adm.noFacts")}</p>
              )}
            </div>
          )}
        </div>

        {/* Status update + timeline */}
        <div className="space-y-4">
          <form onSubmit={save} className="card">
            <h3 className="mb-3 text-lg font-extrabold text-ink">
              {t("adm.updateStatus")}
            </h3>
            <label className="label" htmlFor="adm-status">
              {t("adm.newStatus")}
            </label>
            <select
              id="adm-status"
              className="input min-h-[48px]"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            >
              <option value="">{t("adm.selectStatus")}</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {t(`tr.status.${s}`)}
                </option>
              ))}
            </select>
            <label className="label mt-3" htmlFor="adm-note">
              {t("adm.note")}
            </label>
            <input
              id="adm-note"
              className="input min-h-[48px]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
            <button
              type="submit"
              className="btn-primary mt-4 min-h-[48px] w-full"
              disabled={!newStatus || saving}
            >
              {saving ? (
                <Spinner className="border-white/30 border-t-white" />
              ) : (
                t("adm.saveStatus")
              )}
            </button>
          </form>

          <div className="card">
            <h3 className="mb-3 text-lg font-extrabold text-ink">
              {t("adm.timeline")}
            </h3>
            <ol className="space-y-2.5">
              {detail.timeline.map((e, i) => (
                <li
                  key={`${e.updated_at}-${i}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl bg-cream px-4 py-3"
                >
                  <StatusPill status={e.status} />
                  <span className="min-w-0 flex-1 text-sm font-bold text-ink">
                    {e.note || "—"}
                  </span>
                  <span className="text-xs font-bold text-ink/50">
                    {fmtDate(e.updated_at)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
