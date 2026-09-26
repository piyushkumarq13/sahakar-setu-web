"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { trackGrievance, type GrievanceTrackResponse } from "@/lib/api";
import {
  getSavedCasesServerSnapshot,
  getSavedCasesSnapshot,
  subscribeSavedCases,
} from "@/lib/storage";
import { LoadingBlock, StatusChip } from "@/components/ui";
import { escapeHtml } from "@/lib/print";
import {
  IconArrowRight,
  IconCheck,
  IconDoc,
  IconPrint,
} from "@/components/icons";

const STAGE_KEYS = ["tr.stage1", "tr.stage2", "tr.stage3", "tr.stage4"] as const;
const TRACKING_RE = /^SS-\d{4}-\d{6}$/;

function stageIndex(status: string): number {
  switch (status) {
    case "drafted":
      return 0;
    case "submitted":
      return 1;
    case "acknowledged":
    case "escalated":
      return 2;
    case "resolved":
    case "rejected":
      // Both are a final decision, so the last stage is reached either way;
      // the chip colour (green/red) tells apart solved vs not solved.
      return 3;
    default:
      return 0;
  }
}

function statusLabel(status: string): string {
  return `tr.status.${status}`;
}

function TrackInner() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [trackingId, setTrackingId] = useState("");
  const saved = useSyncExternalStore(
    subscribeSavedCases,
    getSavedCasesSnapshot,
    getSavedCasesServerSnapshot
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GrievanceTrackResponse | null>(null);
  const [error, setError] = useState("");
  // Id already requested for the current URL, so arriving at the same
  // ?id= again (router change, effect re-run) never double-fetches.
  const lastRef = useRef("");

  const lookupId = useCallback(
    async (raw: string) => {
      const tid = raw.trim().toUpperCase();
      if (!tid) return;
      if (!TRACKING_RE.test(tid)) {
        setError(t("tr.invalid"));
        setResult(null);
        return;
      }
      lastRef.current = tid;
      // The id lives in the URL, so the result is shareable and survives a
      // reload; the replace happens before the fetch so even a failed
      // lookup keeps the address bar in sync with what is on screen.
      router.replace(`/track?id=${tid}`, { scroll: false });
      setTrackingId(tid);
      setLoading(true);
      setError("");
      setResult(null);
      try {
        const res = await trackGrievance(tid);
        setResult(res);
      } catch {
        setError(t("tr.notFound"));
      } finally {
        setLoading(false);
      }
    },
    [t, router]
  );

  // URL-driven tracking: /track?id=SS-... looks itself up on arrival, so any
  // page can deep-link a result. setState runs inside microtasks only —
  // never synchronously in the effect body (react-hooks/set-state-in-effect).
  const urlId = (searchParams.get("id") || "").trim().toUpperCase();
  useEffect(() => {
    if (!urlId || lastRef.current === urlId) return;
    lastRef.current = urlId;
    if (!TRACKING_RE.test(urlId)) {
      Promise.resolve().then(() => {
        setTrackingId(urlId);
        setError(t("tr.invalid"));
        setResult(null);
      });
      return;
    }
    Promise.resolve().then(() => lookupId(urlId));
  }, [urlId, lookupId, t]);

  const printTimeline = () => {
    if (!result) return;
    const w = window.open("", "_blank");
    if (!w) return;
    const lines = result.timeline
      .map(
        (e) =>
          `${escapeHtml(new Date(e.updated_at).toLocaleString())} — ${escapeHtml(
            e.status
          )}: ${escapeHtml(e.note)}`
      )
      .join("\n");
    w.document.write(
      `<html><head><title>${escapeHtml(result.tracking_id)}</title><style>body{font-family:sans-serif;padding:24px;line-height:1.7}</style></head><body><h2>${escapeHtml(
        result.tracking_id
      )}</h2><h3>${escapeHtml(result.subject)}</h3><pre style="white-space:pre-wrap">${lines}</pre></body></html>`
    );
    w.document.close();
    w.print();
  };

  // The backend's top-level status field can lag behind (grievance_drafts has
  // no status column), so the newest timeline entry is the source of truth —
  // this is what lets admin status updates show up for the tracking user.
  const effectiveStatus =
    (result?.timeline && result.timeline.length > 0
      ? result.timeline[0].status
      : result?.status) || "drafted";
  const currentStage = result ? stageIndex(effectiveStatus) : -1;

  return (
    <div className="container-page">
      <h1 className="section-title">{t("tr.title")}</h1>
      <p className="mb-5 text-base font-bold text-ink/60">{t("tr.subtitle")}</p>

      {/* Lookup */}
      <div className="card">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            lookupId(trackingId);
          }}
        >
          <input
            className="input min-h-[56px] flex-1 font-mono text-lg tracking-wide"
            placeholder={t("tr.placeholder")}
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            aria-label={t("tr.placeholder")}
          />
          <button type="submit" className="btn-primary" disabled={loading || !trackingId.trim()}>
            {t("tr.check")}
          </button>
        </form>

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-base font-bold text-red-700">
            {error}
          </p>
        )}

        {loading && (
          <div className="mt-4">
            <LoadingBlock lines={4} note={t("common.loading")} />
          </div>
        )}

        {result && (
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-2xl font-extrabold text-ink">
                  {result.tracking_id}
                </p>
                <p className="text-base font-bold text-ink/70">{result.subject}</p>
                <p className="text-sm font-bold text-ink/50">{result.addressee}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusChip
                  status={effectiveStatus}
                  label={t(statusLabel(effectiveStatus))}
                />
                <button onClick={printTimeline} className="btn-ghost min-h-[48px] px-4 py-2 text-base">
                  <IconPrint className="text-lg" aria-hidden="true" />
                  {t("common.print")}
                </button>
              </div>
            </div>

            {/* 4-stage timeline */}
            <ol className="mt-6 flex items-start">
              {STAGE_KEYS.map((sk, i) => {
                const done = i <= currentStage;
                const active = i === currentStage;
                return (
                  <li key={sk} className="relative flex flex-1 flex-col items-center">
                    {i > 0 && (
                      <span
                        className={`absolute end-1/2 top-5 h-1 w-full ${done ? "bg-primary" : "bg-ink/15"}`}
                        style={{ insetInlineEnd: "50%" }}
                        aria-hidden="true"
                      />
                    )}
                    <span
                      className={`z-10 flex h-10 w-10 items-center justify-center rounded-full border-4 text-sm font-extrabold ${
                        done
                          ? "border-primary bg-primary text-white"
                          : "border-ink/15 bg-white text-ink/40"
                      }`}
                      aria-hidden="true"
                    >
                      {done ? <IconCheck /> : i + 1}
                    </span>
                    <span
                      className={`mt-2 text-center text-sm font-bold ${
                        active ? "text-primary" : "text-ink/60"
                      }`}
                    >
                      {t(sk)}
                    </span>
                    {active && (
                      <span className="chip-orange mt-1.5 text-xs">{t("common.status")}</span>
                    )}
                  </li>
                );
              })}
            </ol>

            {/* Updates */}
            <h3 className="mt-6 text-lg font-extrabold text-ink">{t("tr.notes")}</h3>
            {result.timeline && result.timeline.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {result.timeline.map((e, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-3 rounded-xl bg-cream px-4 py-3">
                    <StatusChip status={e.status} label={t(statusLabel(e.status))} />
                    <span className="flex-1 text-base font-bold text-ink">{e.note}</span>
                    <span className="text-sm font-bold text-ink/50">
                      {new Date(e.updated_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-base font-bold text-ink/60">
                {t("tr.status.drafted")} · {new Date(result.created_at).toLocaleDateString()}
              </p>
            )}
          </div>
        )}
      </div>

      {/* My cases */}
      <h2 className="section-title mt-8 flex flex-wrap items-center justify-between gap-2">
        {t("tr.myCases")}
        <Link
          href="/my-cases"
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-primary hover:bg-primary/10"
        >
          {t("mc.viewAll")}
          <IconArrowRight className="text-base" aria-hidden="true" />
        </Link>
      </h2>
      {saved.length === 0 ? (
        <div className="card mt-3 flex flex-col items-center gap-3 py-8 text-center">
          <IconDoc className="text-5xl text-primary/40" aria-hidden="true" />
          <p className="text-base font-bold text-ink/60">{t("tr.noSaved")}</p>
          <Link href="/grievance" className="btn-primary">
            {t("tr.fileNow")}
          </Link>
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {saved.map((c) => (
            <li key={c.trackingId} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-[180px] flex-1">
                <p className="font-mono text-lg font-extrabold text-ink">{c.trackingId}</p>
                <p className="truncate text-sm font-bold text-ink/60">{c.subject}</p>
              </div>
              <span className="chip-blue">{t(`gr.cat.${c.category}`) || c.category}</span>
              <span className="chip-gray">{new Date(c.date).toLocaleDateString()}</span>
              {c.caseId ? (
                <Link href={`/case/${c.caseId}`} className="btn-outline min-h-[48px] px-4 py-2 text-base">
                  {t("common.viewDetails")}
                </Link>
              ) : (
                <button
                  onClick={() => lookupId(c.trackingId)}
                  className="btn-outline min-h-[48px] px-4 py-2 text-base"
                >
                  {t("tr.check")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={null}>
      <TrackInner />
    </Suspense>
  );
}
