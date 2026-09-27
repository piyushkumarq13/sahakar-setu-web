"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { getCase, type CaseResponse } from "@/lib/api";
import {
  getCaseIdServerSnapshot,
  getCaseIdSnapshot,
  getSavedCasesServerSnapshot,
  getSavedCasesSnapshot,
  subscribeCaseId,
  subscribeSavedCases,
} from "@/lib/storage";
import { useToast } from "@/components/Toast";
import { LoadingBlock, Spinner } from "@/components/ui";
import {
  IconArrowRight,
  IconCheck,
  IconScale,
  IconSearch,
  IconUser,
} from "@/components/icons";

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

interface ConnectedLawyer {
  lawyer: WakeelLawyer;
  name: string;
  cityLine: string;
  rating: number | null;
  experience: number | null;
  reviews: number | null;
  fee: string | null;
  bio: string | null;
  specialties: string[];
  verified: boolean;
  matched: string[];
}

// Keyword groups map the user's case/grievance vocabulary (from chats, case
// facts and filed grievances) onto the English specialty labels Mera Wakeel
// stores. Matching is substring-based, so "Land Acquisition" matches "land".
const KEYWORD_GROUPS: { label: string; words: string[] }[] = [
  { label: "property", words: ["property", "land", "zameen", "ज़मीन", "जमीन", "भूमि", "बैनामा", "sale deed", "partition", "possession", "बागवानी", "tenant", "eviction", "rera", "revenue", "lease", "rent", "भाड़ा"] },
  { label: "family", words: ["family", "matrimonial", "divorce", "inheritance", "custody", "maintenance", "विवाह", "तलाक", "विरासत", "हिंसा"] },
  { label: "insurance", words: ["insurance", "pmfby", "crop", "fasal", "बीमा", "फसल", "दावा", "claim", "फसल बीमा"] },
  { label: "loan", words: ["loan", "kcc", "credit", "debt", "banking", "finance", "ऋण", "कर्ज़", "उधार", "बैंक", "cheque", "ni act", "चेक"] },
  { label: "scheme", words: ["scheme", "yojana", "योजना", "pm-kisan", "pmkisan", "mudra", "सरकारी"] },
  { label: "labour", words: ["labour", "labor", "employment", "worker", "मज़दूर", "श्रम", "कर्मचारी"] },
  { label: "consumer", words: ["consumer", "उपभोक्ता"] },
  { label: "civil", words: ["civil", "सिविल"] },
  { label: "criminal", words: ["criminal", "आपराधिक", "fir", "फर्जी"] },
  { label: "constitutional", words: ["constitutional", "संवैधानिक"] },
];

// Grievance/case categories (gr.cat.* values) → keyword groups.
const CATEGORY_GROUPS: Record<string, string[]> = {
  grievance: ["civil", "criminal", "consumer"],
  insurance: ["insurance"],
  loan: ["loan"],
  scheme: ["scheme"],
  laws: ["civil", "criminal", "family", "constitutional"],
  property: ["property"],
  family: ["family"],
  labour: ["labour"],
  other: [],
};

const SORTS = {
  rating: (a: ConnectedLawyer, b: ConnectedLawyer) =>
    (b.rating ?? 0) - (a.rating ?? 0) || (b.experience ?? 0) - (a.experience ?? 0),
  experience: (a: ConnectedLawyer, b: ConnectedLawyer) =>
    (b.experience ?? 0) - (a.experience ?? 0) || (b.rating ?? 0) - (a.rating ?? 0),
  reviews: (a: ConnectedLawyer, b: ConnectedLawyer) =>
    (b.reviews ?? 0) - (a.reviews ?? 0),
  name: (a: ConnectedLawyer, b: ConnectedLawyer) => a.name.localeCompare(b.name),
} as const;

type SortKey = keyof typeof SORTS;

/** Lawyers per page — the current page lives in the URL fragment (#1, #2…). */
const PAGE_SIZE = 6;

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

function LawyerCard({
  item,
  busy,
  canConnect,
  recommended,
  onConnect,
}: {
  item: ConnectedLawyer;
  busy: boolean;
  canConnect: boolean;
  recommended?: boolean;
  onConnect: (lawyerId?: string) => void;
}) {
  const { t } = useI18n();
  const matched = recommended ? item.matched : [];
  const unmatched = item.specialties.filter((s) => !matched.includes(s));
  const chips = [...matched, ...unmatched].slice(0, 4);

  return (
    <li className="card space-y-4">
      <div className="flex items-start gap-4">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10"
          aria-hidden="true"
        >
          <IconUser className="text-2xl text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-extrabold text-ink">{item.name}</h3>
            {item.verified && (
              <span className="chip-green">
                <IconCheck className="text-sm" aria-hidden="true" />
                {t("mw.verified")}
              </span>
            )}
          </div>
          {item.cityLine && (
            <p className="text-sm font-bold text-ink/60">
              {t("mw.city")}: {item.cityLine}
            </p>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t("mw.specialty")}>
          {matched.map((s) => (
            <li key={`m-${s}`} className="chip-green">
              <IconCheck className="text-sm" aria-hidden="true" />
              {s}
            </li>
          ))}
          {unmatched.map((s) => (
            <li key={`u-${s}`} className="chip-blue">
              {s}
            </li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-cream px-3 py-2">
          <dt className="text-xs font-extrabold uppercase text-ink/50">{t("mw.rating")}</dt>
          <dd className="text-base font-extrabold text-ink">
            {item.rating !== null ? item.rating.toFixed(1) : "—"} / 5
          </dd>
        </div>
        <div className="rounded-xl bg-cream px-3 py-2">
          <dt className="text-xs font-extrabold uppercase text-ink/50">{t("mw.experience")}</dt>
          <dd className="text-base font-extrabold text-ink">
            {item.experience !== null ? `${item.experience} ${t("mw.years")}` : "—"}
          </dd>
        </div>
        <div className="rounded-xl bg-cream px-3 py-2">
          <dt className="text-xs font-extrabold uppercase text-ink/50">{t("mw.reviews")}</dt>
          <dd className="text-base font-extrabold text-ink">
            {item.reviews !== null ? item.reviews : "—"}
          </dd>
        </div>
        <div className="rounded-xl bg-cream px-3 py-2">
          <dt className="text-xs font-extrabold uppercase text-ink/50">{t("mw.fee")}</dt>
          <dd className="truncate text-base font-extrabold text-ink">{item.fee ?? "—"}</dd>
        </div>
      </dl>

      {item.bio && <p className="text-sm font-bold text-ink/60">{item.bio}</p>}

      <button
        onClick={() => onConnect(asTrimmedString(item.lawyer?.id) ?? undefined)}
        disabled={busy || !canConnect}
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
  );
}

function LawyerInner() {
  const { t } = useI18n();
  const { toast } = useToast();
  // Reactive reads: a case created in another tab (or during this visit) must
  // enable the connect actions and refresh recommendations without a reload.
  const caseId = useSyncExternalStore(
    subscribeCaseId,
    getCaseIdSnapshot,
    getCaseIdServerSnapshot
  );
  const savedCases = useSyncExternalStore(
    subscribeSavedCases,
    getSavedCasesSnapshot,
    getSavedCasesServerSnapshot
  );
  const [lawyers, setLawyers] = useState<WakeelLawyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [caseInfo, setCaseInfo] = useState<CaseResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [city, setCity] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("rating");
  // Current slice of results. Kept in the URL fragment (#1, #2, …) so a
  // refresh, a shared link and the Back button all land on the same page.
  const [page, setPage] = useState(1);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let cancelled = false;
    // setState runs inside microtasks only — never synchronously in the
    // effect body (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true);
        setLoadFailed(false);
      }
    });
    (async () => {
      const cid = getCaseIdSnapshot();
      const [lawyerFetch, caseFetch] = await Promise.allSettled([
        fetch("/api/mera-wakeel/lawyers", { cache: "no-store" }),
        cid ? getCase(cid) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      let ok = true;
      if (lawyerFetch.status === "fulfilled") {
        const res = lawyerFetch.value;
        const data = (await res.json().catch(() => null)) as {
          success?: unknown;
          lawyers?: unknown;
        } | null;
        if (res.ok && data?.success === true) {
          setLawyers(Array.isArray(data.lawyers) ? (data.lawyers as WakeelLawyer[]) : []);
        } else {
          ok = false;
        }
      } else {
        ok = false;
      }
      if (caseFetch.status === "fulfilled" && caseFetch.value) {
        setCaseInfo(caseFetch.value);
      }
      setLoadFailed(!ok);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // First read of #N happens in a microtask (never setState synchronously in
  // the effect body); the listener then follows Back/Forward fragment changes.
  useEffect(() => {
    const readHash = () => {
      const n = Number.parseInt(window.location.hash.slice(1), 10);
      setPage(Number.isFinite(n) && n > 0 ? n : 1);
    };
    Promise.resolve().then(readHash);
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  // Any change to the result set restarts at page 1 and drops the fragment,
  // so refreshing after filtering keeps the first page in the URL.
  const resetPage = useCallback(() => {
    setPage((p) => (p === 1 ? p : 1));
    if (window.location.hash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  }, []);

  const goToPage = useCallback((n: number) => {
    setPage(n);
    const target = n <= 1 ? "" : `#${n}`;
    // pushState (not a plain link) so nothing scrolls for a fragment that has
    // no matching element; Back/Forward still replay via "hashchange" above.
    if (window.location.hash !== target) {
      window.history.pushState(
        null,
        "",
        window.location.pathname + window.location.search + target
      );
    }
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const connected = useMemo<ConnectedLawyer[]>(
    () =>
      lawyers.map((lawyer) => {
        const name = asTrimmedString(lawyer?.profile?.full_name) ?? "—";
        const city = asTrimmedString(lawyer?.profile?.city);
        const state = asTrimmedString(lawyer?.profile?.state);
        return {
          lawyer,
          name,
          cityLine: [city, state].filter(Boolean).join(", "),
          rating: asFiniteNumber(lawyer?.rating_avg),
          experience: asFiniteNumber(lawyer?.years_experience),
          reviews: asFiniteNumber(lawyer?.review_count),
          fee: asTrimmedString(lawyer?.consultation_fee_range),
          bio: asTrimmedString(lawyer?.bio),
          specialties: asSpecialties(lawyer?.specialty),
          verified: isVerified(lawyer),
          matched: [],
        };
      }),
    [lawyers]
  );

  // Which subject areas the user's own history points at: the active case's
  // category and chat-extracted facts, plus every filed grievance's category
  // and subject.
  const matchGroups = useMemo(() => {
    const groups = new Set<string>();
    const pushCategory = (cat?: string | null) => {
      if (!cat) return;
      (CATEGORY_GROUPS[cat.toLowerCase()] ?? []).forEach((g) => groups.add(g));
    };
    pushCategory(caseInfo?.category);
    savedCases.forEach((s) => pushCategory(s.category));
    const haystacks = [
      ...(caseInfo?.facts ?? []).map((f) => `${f.key} ${f.value}`),
      ...savedCases.map((s) => s.subject),
    ].map((s) => s.toLowerCase());
    KEYWORD_GROUPS.forEach((g) => {
      if (haystacks.some((h) => g.words.some((w) => h.includes(w)))) groups.add(g.label);
    });
    return groups;
  }, [caseInfo, savedCases]);

  // Best-fit lawyers: most matched specialties first, then rating and
  // experience as tiebreakers.
  const recommended = useMemo<ConnectedLawyer[]>(() => {
    if (matchGroups.size === 0) return [];
    return connected
      .map((c) => {
        const matched = c.specialties.filter((sp) => {
          const low = sp.toLowerCase();
          return KEYWORD_GROUPS.some(
            (g) => matchGroups.has(g.label) && g.words.some((w) => low.includes(w))
          );
        });
        return { ...c, matched };
      })
      .filter((c) => c.matched.length > 0)
      .sort(
        (a, b) =>
          b.matched.length - a.matched.length ||
          (b.rating ?? 0) - (a.rating ?? 0) ||
          (b.experience ?? 0) - (a.experience ?? 0)
      );
  }, [connected, matchGroups]);

  const specialtyOptions = useMemo(() => {
    const counts = new Map<string, number>();
    lawyers.forEach((l) =>
      asSpecialties(l?.specialty).forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1))
    );
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([s]) => s)
      .slice(0, 8);
  }, [lawyers]);

  const cityOptions = useMemo(() => {
    const cities = new Set<string>();
    lawyers.forEach((l) => {
      const c = asTrimmedString(l?.profile?.city);
      if (c) cities.add(c);
    });
    return [...cities].sort((a, b) => a.localeCompare(b));
  }, [lawyers]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = connected.filter((c) => {
      if (verifiedOnly && !c.verified) return false;
      if (specialty && !c.specialties.includes(specialty)) return false;
      if (city && asTrimmedString(c.lawyer?.profile?.city) !== city) return false;
      if (q) {
        const hay = [
          c.name,
          ...c.specialties,
          c.lawyer?.profile?.city ?? "",
          c.lawyer?.profile?.state ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return [...list].sort(SORTS[sort]);
  }, [connected, query, specialty, city, verifiedOnly, sort]);

  // Clamped so a stale fragment (#5 after filters shrank the list) still
  // renders the last real page instead of an empty one.
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visible, safePage]
  );

  const hasFilters = Boolean(query.trim() || specialty || city || verifiedOnly);
  const clearFilters = () => {
    resetPage();
    setQuery("");
    setSpecialty("");
    setCity("");
    setVerifiedOnly(false);
  };

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

      {recommended.length > 0 && (
        <section aria-label={t("mw.recTitle")} className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <IconCheck className="text-xl text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-lg font-extrabold text-ink">{t("mw.recTitle")}</h2>
              <p className="text-sm font-bold text-ink/60">{t("mw.recDesc")}</p>
            </div>
          </div>
          <ul className="space-y-4">
            {recommended.map((item, i) => (
              <LawyerCard
                key={`rec-${item.lawyer?.id ?? i}`}
                item={item}
                busy={busy}
                canConnect={Boolean(caseId)}
                recommended
                onConnect={startHandoff}
              />
            ))}
          </ul>
        </section>
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

      <div className="card mb-5 space-y-3">
        <div className="relative">
          <IconSearch
            className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-xl text-ink/40"
            aria-hidden="true"
          />
          <input
            type="search"
            className="input min-h-[52px] ps-12"
            placeholder={t("mw.searchPh")}
            aria-label={t("mw.searchPh")}
            value={query}
            onChange={(e) => {
              resetPage();
              setQuery(e.target.value);
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label
              htmlFor="mw-specialty"
              className="text-xs font-extrabold uppercase text-ink/50"
            >
              {t("mw.filterSpecialty")}
            </label>
            <select
              id="mw-specialty"
              className="input min-h-[48px] py-2 text-base"
              value={specialty}
              onChange={(e) => {
                resetPage();
                setSpecialty(e.target.value);
              }}
            >
              <option value="">{t("mw.filterAll")}</option>
              {specialtyOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mw-city" className="text-xs font-extrabold uppercase text-ink/50">
              {t("mw.filterCity")}
            </label>
            <select
              id="mw-city"
              className="input min-h-[48px] py-2 text-base"
              value={city}
              onChange={(e) => {
                resetPage();
                setCity(e.target.value);
              }}
            >
              <option value="">{t("mw.filterAll")}</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mw-sort" className="text-xs font-extrabold uppercase text-ink/50">
              {t("mc.sort")}
            </label>
            <select
              id="mw-sort"
              className="input min-h-[48px] py-2 text-base"
              value={sort}
              onChange={(e) => {
                resetPage();
                setSort(e.target.value as SortKey);
              }}
            >
              <option value="rating">{t("mw.sortRating")}</option>
              <option value="experience">{t("mw.sortExperience")}</option>
              <option value="reviews">{t("mw.sortReviews")}</option>
              <option value="name">{t("mw.sortName")}</option>
            </select>
          </div>
          <div>
            <span className="text-xs font-extrabold uppercase text-ink/50" id="mw-verified-label">
              {t("mw.verifiedOnly")}
            </span>
            <button
              type="button"
              aria-labelledby="mw-verified-label"
              aria-pressed={verifiedOnly}
              onClick={() => {
                resetPage();
                setVerifiedOnly((v) => !v);
              }}
              className={`w-full min-h-[48px] px-4 text-base ${
                verifiedOnly
                  ? "btn-primary"
                  : "btn-ghost"
              }`}
            >
              {verifiedOnly && <IconCheck aria-hidden="true" />}
              {t("mw.verifiedOnly")}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-ink/50">
            {t("mc.results", { shown: visible.length, total: connected.length })}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="btn-ghost min-h-[44px] px-4 py-2 text-sm"
            >
              {t("mc.clear")}
            </button>
          )}
        </div>
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

      {!loading && !loadFailed && connected.length > 0 && visible.length === 0 && (
        <div className="card flex flex-col items-center gap-3 py-8 text-center">
          <IconSearch className="text-5xl text-primary/40" aria-hidden="true" />
          <p className="text-base font-bold text-ink/60">{t("mw.noMatch")}</p>
          <button
            type="button"
            onClick={clearFilters}
            className="btn-outline min-h-[48px] px-5 py-2 text-base"
          >
            {t("mc.clear")}
          </button>
        </div>
      )}

      {!loading && !loadFailed && visible.length > 0 && (
        <>
          <ul ref={listRef} className="space-y-4">
            {pageItems.map((item, i) => (
              <LawyerCard
                key={item.lawyer?.id ?? i}
                item={item}
                busy={busy}
                canConnect={Boolean(caseId)}
                onConnect={startHandoff}
              />
            ))}
          </ul>

          {pageCount > 1 && (
            <nav
              className="mt-6 flex flex-wrap items-center justify-center gap-2"
              aria-label={t("mw.pageNav")}
            >
              <button
                type="button"
                onClick={() => goToPage(safePage - 1)}
                disabled={safePage <= 1}
                className="btn-ghost min-h-[44px] px-4 py-2 text-sm disabled:opacity-40"
              >
                ‹ {t("mw.pagePrev")}
              </button>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => goToPage(n)}
                  aria-current={n === safePage ? "page" : undefined}
                  aria-label={t("mw.pageGo", { n })}
                  className={`min-h-[44px] min-w-[44px] px-4 py-2 text-base ${
                    n === safePage ? "btn-primary" : "btn-ghost"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => goToPage(safePage + 1)}
                disabled={safePage >= pageCount}
                className="btn-ghost min-h-[44px] px-4 py-2 text-sm disabled:opacity-40"
              >
                {t("mw.pageNext")} ›
              </button>
            </nav>
          )}
        </>
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
