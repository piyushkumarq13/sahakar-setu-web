"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { getCase, type CaseResponse } from "@/lib/api";
import {
  getSavedCasesServerSnapshot,
  getSavedCasesSnapshot,
  removeSavedCase,
  saveCase,
  subscribeSavedCases,
  type SavedCase,
} from "@/lib/storage";
import { useToast } from "@/components/Toast";
import { Skeleton, StatusChip } from "@/components/ui";
import {
  IconClose,
  IconCopy,
  IconDoc,
  IconDownload,
  IconRefresh,
  IconSearch,
} from "@/components/icons";

const CASE_STATUSES = ["open", "pending", "escalated", "resolved", "closed"];
const ACTIVE_STATUSES = new Set(["open", "pending", "escalated"]);

function statusKey(status: string): string {
  return CASE_STATUSES.includes(status) ? `mc.status.${status}` : status;
}

function scoreOf(c: CaseResponse): number {
  return c.strength_score ?? c.verdict?.score ?? 0;
}

function scoreColor(score: number): string {
  return score >= 60 ? "#2E8B57" : score >= 30 ? "#FFA500" : "#D64545";
}

type FilterKey = "all" | "active" | "resolved" | "closed";
type SortKey = "newest" | "oldest" | "score" | "az";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "mc.all" },
  { key: "active", label: "mc.filterActive" },
  { key: "resolved", label: "mc.filterResolved" },
  { key: "closed", label: "mc.filterClosed" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "mc.sort.newest" },
  { key: "oldest", label: "mc.sort.oldest" },
  { key: "score", label: "mc.sort.score" },
  { key: "az", label: "mc.sort.az" },
];

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint?: string;
}) {
  return (
    <div className="card">
      <p className="text-xs font-extrabold uppercase tracking-wide text-ink/50">
        {label}
      </p>
      <p className="mt-1 text-3xl font-extrabold text-ink">
        {value === null ? "—" : value}
      </p>
      {hint && <p className="mt-0.5 text-xs font-bold text-ink/40">{hint}</p>}
    </div>
  );
}

export default function MyCasesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const saved = useSyncExternalStore(
    subscribeSavedCases,
    getSavedCasesSnapshot,
    getSavedCasesServerSnapshot
  );

  // caseId -> fetched case, or null when it no longer exists / the call failed.
  const [details, setDetails] = useState<Record<string, CaseResponse | null>>(
    {}
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [refreshing, setRefreshing] = useState(false);

  // Promise-chain style: every setState sits in a .then callback, so calling
  // this from the effect below never updates state synchronously there.
  const enrich = useCallback((cases: SavedCase[]) => {
    const withId = cases.filter((c) => c.caseId);
    const finish = () => setRefreshing(false);
    if (withId.length === 0) {
      Promise.resolve().then(finish);
      return;
    }
    Promise.allSettled(withId.map((c) => getCase(c.caseId))).then(
      (results) => {
        const next: Record<string, CaseResponse | null> = {};
        withId.forEach((c, i) => {
          const r = results[i];
          next[c.caseId] = r.status === "fulfilled" ? r.value : null;
        });
        setDetails(next);
        finish();
      }
    );
  }, []);

  useEffect(() => {
    enrich(saved);
  }, [saved, enrich]);

  const refresh = () => {
    setRefreshing(true);
    enrich(saved);
  };

  const remove = (entry: SavedCase) => {
    removeSavedCase(entry.trackingId);
    toast(t("mc.removed"), "success", {
      label: t("mc.undo"),
      onClick: () => saveCase(entry),
    });
  };

  const copyId = async (trackingId: string) => {
    try {
      await navigator.clipboard.writeText(trackingId);
      toast(t("common.copied"), "success");
    } catch {
      // Clipboard unavailable (permissions / insecure context).
    }
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = saved.filter((c) => {
      if (!q) return true;
      return (
        c.subject.toLowerCase().includes(q) ||
        c.trackingId.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        t(`gr.cat.${c.category}`).toLowerCase().includes(q)
      );
    });
    if (filter !== "all") {
      out = out.filter((c) => {
        const d = c.caseId ? details[c.caseId] : undefined;
        if (!d) return false;
        if (filter === "active") return ACTIVE_STATUSES.has(d.status);
        if (filter === "resolved") return d.status === "resolved";
        return d.status === "closed";
      });
    }
    const score = (c: SavedCase) => {
      const d = c.caseId ? details[c.caseId] : undefined;
      return d ? scoreOf(d) : null;
    };
    return [...out].sort((a, b) => {
      if (sort === "newest") return +new Date(b.date) - +new Date(a.date);
      if (sort === "oldest") return +new Date(a.date) - +new Date(b.date);
      if (sort === "az") return a.subject.localeCompare(b.subject);
      return (score(b) ?? -1) - (score(a) ?? -1);
    });
  }, [saved, query, filter, sort, details, t]);

  const stats = useMemo(() => {
    const live: CaseResponse[] = [];
    for (const c of saved) {
      if (c.caseId) {
        const d = details[c.caseId];
        if (d) live.push(d);
      }
    }
    return {
      total: saved.length,
      active: live.filter((d) => ACTIVE_STATUSES.has(d.status)).length,
      strong: live.filter((d) => scoreOf(d) >= 60).length,
      docs: live.reduce((n, d) => n + d.documents.length, 0),
      fetched: Object.keys(details).length > 0,
    };
  }, [saved, details]);
  const statsReady = stats.fetched || !saved.some((c) => c.caseId);

  const exportCsv = () => {
    if (list.length === 0) {
      toast(t("mc.exportEmpty"), "error");
      return;
    }
    const head = [
      t("mc.col.id"),
      t("mc.col.subject"),
      t("mc.col.category"),
      t("common.date"),
      t("common.status"),
      t("cs.strength"),
      t("mc.facts"),
      t("mc.documents"),
    ];
    const rows = list.map((c) => {
      const d = c.caseId ? details[c.caseId] : undefined;
      return [
        c.trackingId,
        c.subject,
        t(`gr.cat.${c.category}`),
        new Date(c.date).toLocaleDateString(),
        d ? t(statusKey(d.status)) : "",
        d ? String(scoreOf(d)) : "",
        d ? String(d.facts.length) : "",
        d ? String(d.documents.length) : "",
      ];
    });
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv =
      "\uFEFF" +
      [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sahakar-setu-my-cases.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(t("mc.exportOk"), "success");
  };

  return (
    <div className="container-page">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="section-title">{t("mc.title")}</h1>
          <p className="mt-1 text-base font-bold text-ink/60">
            {t("mc.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={refresh}
            disabled={refreshing || saved.length === 0}
            className="btn-ghost min-h-[48px] px-4 py-2 text-base"
          >
            <IconRefresh
              className={`text-lg ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {t("cs.refresh")}
          </button>
          <button
            onClick={exportCsv}
            disabled={list.length === 0}
            className="btn-outline min-h-[48px] px-4 py-2 text-base"
          >
            <IconDownload className="text-lg" aria-hidden="true" />
            {t("mc.export")}
          </button>
        </div>
      </div>

      {saved.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 py-10 text-center">
          <IconDoc className="text-5xl text-primary/40" aria-hidden="true" />
          <p className="text-lg font-extrabold text-ink">{t("mc.empty")}</p>
          <p className="text-base font-bold text-ink/60">{t("mc.emptyText")}</p>
          <div className="mt-1 flex flex-wrap justify-center gap-3">
            <Link href="/grievance" className="btn-primary min-h-[48px] px-5">
              {t("tr.fileNow")}
            </Link>
            <Link href="/chat" className="btn-outline min-h-[48px] px-5">
              {t("chat.newChat")}
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={t("mc.total")}
              value={statsReady ? stats.total : null}
            />
            <StatCard
              label={t("mc.active")}
              value={statsReady ? stats.active : null}
            />
            <StatCard
              label={t("mc.strong")}
              value={statsReady ? stats.strong : null}
              hint="≥ 60"
            />
            <StatCard
              label={t("mc.docs")}
              value={statsReady ? stats.docs : null}
            />
          </div>

          {/* Search / filter / sort */}
          <div className="card mt-4 space-y-3">
            <div className="relative">
              <IconSearch
                className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-xl text-ink/40"
                aria-hidden="true"
              />
              <input
                className="input min-h-[52px] ps-12"
                placeholder={t("mc.search")}
                aria-label={t("mc.searchLabel")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-extrabold text-ink/60">
                {t("common.status")}:
              </span>
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  aria-pressed={filter === f.key}
                  className={`flex min-h-[44px] items-center rounded-xl px-4 text-sm font-extrabold transition-colors ${
                    filter === f.key
                      ? "bg-primary text-white"
                      : "bg-cream text-ink/80 hover:bg-primary/10"
                  }`}
                >
                  {t(f.label)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-bold text-ink/60">
                {t("mc.results", { shown: list.length, total: saved.length })}
              </p>
              <label className="flex items-center gap-2 text-sm font-extrabold text-ink/60">
                {t("mc.sort")}
                <select
                  className="input min-h-[44px] w-auto py-1.5"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                >
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {t(s.label)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Cases */}
          {list.length === 0 ? (
            <div className="card mt-4 flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-base font-bold text-ink/60">
                {t("mc.noMatch")}
              </p>
              <button
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="btn-outline min-h-[48px] px-5"
              >
                {t("mc.clear")}
              </button>
            </div>
          ) : (
            <ul className="mt-4 grid gap-4 lg:grid-cols-2">
              {list.map((c) => {
                const fetched = c.caseId ? c.caseId in details : false;
                const d = c.caseId ? details[c.caseId] : undefined;
                const score = d ? scoreOf(d) : null;
                return (
                  <li
                    key={c.trackingId}
                    className="card flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate font-mono text-lg font-extrabold text-ink">
                          {c.trackingId}
                        </p>
                        <button
                          onClick={() => copyId(c.trackingId)}
                          aria-label={t("common.copy")}
                          title={t("common.copy")}
                          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-base text-ink/50 hover:bg-ink/5 hover:text-ink"
                        >
                          <IconCopy aria-hidden="true" />
                        </button>
                      </div>
                      <button
                        onClick={() => remove(c)}
                        aria-label={t("mc.remove")}
                        title={t("mc.remove")}
                        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-base text-ink/50 hover:bg-red-50 hover:text-red-600"
                      >
                        <IconClose aria-hidden="true" />
                      </button>
                    </div>

                    <p className="break-words text-base font-extrabold text-ink">
                      {c.subject}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip-blue">
                        {t(`gr.cat.${c.category}`)}
                      </span>
                      <span className="chip-gray">
                        {new Date(c.date).toLocaleDateString()}
                      </span>
                      {c.caseId && !fetched && (
                        <Skeleton className="h-6 w-24" />
                      )}
                      {fetched &&
                        (d ? (
                          <StatusChip
                            status={d.status}
                            label={t(statusKey(d.status))}
                          />
                        ) : (
                          <span className="chip-gray">
                            {t("mc.unavailable")}
                          </span>
                        ))}
                    </div>

                    {!fetched && c.caseId && (
                      <Skeleton className="h-2.5 w-full" />
                    )}
                    {score !== null && (
                      <div>
                        <div className="flex items-center justify-between text-xs font-extrabold text-ink/60">
                          <span>{t("cs.strength")}</span>
                          <span>{score}/100</span>
                        </div>
                        <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${score}%`,
                              backgroundColor: scoreColor(score),
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {d && (
                      <p className="text-xs font-bold text-ink/50">
                        {t("mc.facts")}: {d.facts.length} · {t("mc.documents")}:{" "}
                        {d.documents.length}
                      </p>
                    )}

                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      {d && (
                        <Link
                          href={`/case/${c.caseId}`}
                          className="btn-primary min-h-[44px] px-4 py-2 text-sm"
                        >
                          {t("cs.title")}
                        </Link>
                      )}
                      <Link
                        href="/track"
                        className="btn-outline min-h-[44px] px-4 py-2 text-sm"
                      >
                        {t("mc.track")}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
