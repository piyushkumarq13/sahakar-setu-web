"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import {
  getCaseIdServerSnapshot,
  getCaseIdSnapshot,
  subscribeCaseId,
} from "@/lib/storage";
import { useToast } from "@/components/Toast";
import { LoadingBlock, Spinner } from "@/components/ui";
import { IconArrowRight, IconCheck, IconScale, IconUser } from "@/components/icons";

// The upstream shape is inspected defensively: every field is optional and
// every render guards the type, because Mera Wakeel controls the JSON.
interface WakeelProfile {
  full_name?: string | null;
  city?: string | null;
  state?: string | null;
}

interface WakeelLawyer {
  id?: string | null;
  specialty?: unknown;
  years_experience?: unknown;
  rating_avg?: unknown;
  consultation_fee_range?: string | null;
  review_count?: unknown;
  is_verified?: unknown;
  verification_status?: string | null;
  bio?: string | null;
  profile?: WakeelProfile | null;
}

interface HandoffResponse {
  url?: unknown;
  error?: unknown;
  config?: unknown;
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function asSpecialties(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((s) => asTrimmedString(s))
    .filter((s): s is string => s !== null)
    .slice(0, 4);
}

function isVerified(lawyer: WakeelLawyer): boolean {
  return lawyer.is_verified === true || lawyer.verification_status === "verified";
}

function LawyerInner() {
  const { t } = useI18n();
  const { toast } = useToast();
  // Reactive read: a case created in another tab (or during this visit) must
  // enable the connect actions without a reload.
  const caseId = useSyncExternalStore(
    subscribeCaseId,
    getCaseIdSnapshot,
    getCaseIdServerSnapshot
  );
  const [lawyers, setLawyers] = useState<WakeelLawyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // setState runs inside microtasks only — never synchronously in the
    // effect body (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      setLoadFailed(false);
    });
    (async () => {
      try {
        const res = await fetch("/api/mera-wakeel/lawyers", { cache: "no-store" });
        const data = (await res.json()) as {
          success?: unknown;
          lawyers?: unknown;
        };
        if (!res.ok || data.success !== true) throw new Error("proxy failed");
        const list = Array.isArray(data.lawyers)
          ? (data.lawyers as WakeelLawyer[])
          : [];
        if (!cancelled) setLawyers(list);
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Signs the handoff token server-side, then performs a full-page redirect
  // to Mera Wakeel's login with ?handoff=<token>.
  const startHandoff = useCallback(
    async (lawyerId?: string) => {
      const currentCaseId = getCaseIdSnapshot();
      if (!currentCaseId) {
        toast(t("mw.noCase"), "error");
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/mera-wakeel/handoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseId: currentCaseId,
            ...(lawyerId ? { lawyerId } : {}),
          }),
        });
        const data = (await res.json().catch(() => null)) as HandoffResponse | null;
        if (!res.ok || typeof data?.url !== "string") {
          toast(
            data?.config ? t("mw.handoffConfigError") : t("mw.handoffError"),
            "error"
          );
          return;
        }
        window.location.href = data.url;
      } catch {
        toast(t("mw.handoffError"), "error");
      } finally {
        setBusy(false);
      }
    },
    [t, toast]
  );

  const connected = lawyers.map((lawyer) => {
    const name = asTrimmedString(lawyer?.profile?.full_name) ?? "—";
    const city = asTrimmedString(lawyer?.profile?.city);
    const state = asTrimmedString(lawyer?.profile?.state);
    const cityLine = [city, state].filter(Boolean).join(", ");
    const rating = asFiniteNumber(lawyer?.rating_avg);
    const experience = asFiniteNumber(lawyer?.years_experience);
    const reviews = asFiniteNumber(lawyer?.review_count);
    const fee = asTrimmedString(lawyer?.consultation_fee_range);
    const bio = asTrimmedString(lawyer?.bio);
    const specialties = asSpecialties(lawyer?.specialty);
    const verified = isVerified(lawyer);
    return { lawyer, name, cityLine, rating, experience, reviews, fee, bio, specialties, verified };
  });

  return (
    <div className="container-page">
      <h1 className="section-title flex items-center gap-2">
        <IconScale className="text-primary" aria-hidden="true" />
        {t("mw.title")}
      </h1>
      <p className="mb-5 text-base font-bold text-ink/60">{t("mw.subtitle")}</p>

      {!caseId && (
        <div className="mb-5 rounded-xl border-s-4 border-accent bg-accent/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <IconUser className="mt-0.5 shrink-0 text-xl text-accent" aria-hidden="true" />
            <div>
              <p className="text-base font-bold text-ink">{t("mw.noCase")}</p>
              <Link
                href="/chat"
                className="btn-outline mt-2 inline-flex min-h-[44px] px-4 py-2 text-sm"
              >
                {t("cs.goChat")}
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="card mb-6 flex-col items-start gap-4 border-2 border-primary/30 sm:flex-row sm:items-center">
        <div className="flex-1">
          <h2 className="text-lg font-extrabold text-ink">{t("mw.matchTitle")}</h2>
          <p className="text-sm font-bold text-ink/60">{t("mw.matchAIDesc")}</p>
        </div>
        <button
          onClick={() => startHandoff()}
          disabled={busy || !caseId}
          className="btn-accent min-h-[52px] w-full sm:w-auto"
        >
          {busy ? (
            <Spinner className="border-ink/30 border-t-ink" />
          ) : (
            <IconArrowRight aria-hidden="true" />
          )}
          {t("mw.matchAI")}
        </button>
      </div>

      {loading && (
        <div className="card">
          <LoadingBlock lines={4} note={t("common.loading")} />
        </div>
      )}

      {loadFailed && !loading && (
        <div className="card border-2 border-red-200 text-center">
          <p className="text-base font-bold text-ink">{t("mw.loadError")}</p>
          <button
            onClick={() => {
              setLoadFailed(false);
              setLoading(true);
              (async () => {
                try {
                  const res = await fetch("/api/mera-wakeel/lawyers", {
                    cache: "no-store",
                  });
                  const data = (await res.json()) as { lawyers?: unknown };
                  setLawyers(Array.isArray(data.lawyers) ? (data.lawyers as WakeelLawyer[]) : []);
                } catch {
                  setLoadFailed(true);
                } finally {
                  setLoading(false);
                }
              })();
            }}
            className="btn-outline mt-3 min-h-[48px] px-5 py-2 text-base"
          >
            {t("common.retry")}
          </button>
        </div>
      )}

      {!loading && !loadFailed && connected.length === 0 && (
        <div className="card flex flex-col items-center gap-3 py-8 text-center">
          <IconScale className="text-5xl text-primary/40" aria-hidden="true" />
          <p className="text-base font-bold text-ink/60">{t("mw.empty")}</p>
        </div>
      )}

      {!loading && !loadFailed && connected.length > 0 && (
        <ul className="space-y-4">
          {connected.map(({ lawyer, name, cityLine, rating, experience, reviews, fee, bio, specialties, verified }, i) => (
            <li key={lawyer?.id ?? i} className="card space-y-4">
              <div className="flex items-start gap-4">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10"
                  aria-hidden="true"
                >
                  <IconUser className="text-2xl text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-extrabold text-ink">{name}</h2>
                    {verified && (
                      <span className="chip-green">
                        <IconCheck className="text-sm" aria-hidden="true" />
                        {t("mw.verified")}
                      </span>
                    )}
                  </div>
                  {cityLine && (
                    <p className="text-sm font-bold text-ink/60">
                      {t("mw.city")}: {cityLine}
                    </p>
                  )}
                </div>
              </div>

              {specialties.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label={t("mw.specialty")}>
                  {specialties.map((s) => (
                    <li key={s} className="chip-blue">
                      {s}
                    </li>
                  ))}
                </ul>
              )}

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-cream px-3 py-2">
                  <dt className="text-xs font-extrabold uppercase text-ink/50">{t("mw.rating")}</dt>
                  <dd className="text-base font-extrabold text-ink">
                    {rating !== null ? rating.toFixed(1) : "—"} / 5
                  </dd>
                </div>
                <div className="rounded-xl bg-cream px-3 py-2">
                  <dt className="text-xs font-extrabold uppercase text-ink/50">{t("mw.experience")}</dt>
                  <dd className="text-base font-extrabold text-ink">
                    {experience !== null ? `${experience} ${t("mw.years")}` : "—"}
                  </dd>
                </div>
                <div className="rounded-xl bg-cream px-3 py-2">
                  <dt className="text-xs font-extrabold uppercase text-ink/50">{t("mw.reviews")}</dt>
                  <dd className="text-base font-extrabold text-ink">
                    {reviews !== null ? reviews : "—"}
                  </dd>
                </div>
                <div className="rounded-xl bg-cream px-3 py-2">
                  <dt className="text-xs font-extrabold uppercase text-ink/50">{t("mw.fee")}</dt>
                  <dd className="truncate text-base font-extrabold text-ink">{fee ?? "—"}</dd>
                </div>
              </dl>

              {bio && <p className="text-sm font-bold text-ink/60">{bio}</p>}

              <button
                onClick={() => startHandoff(asTrimmedString(lawyer?.id) ?? undefined)}
                disabled={busy || !caseId}
                className="btn-primary w-full"
              >
                {busy ? (
                  <>
                    <Spinner className="border-white/30 border-t-white" />
                    {t("mw.connecting")}
                  </>
                ) : (
                  t("mw.connect")
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LawyerDirectoryPage() {
  return (
    <Suspense fallback={null}>
      <LawyerInner />
    </Suspense>
  );
}
