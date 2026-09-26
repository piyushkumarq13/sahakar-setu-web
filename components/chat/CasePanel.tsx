"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { getCase, type CaseResponse } from "@/lib/api";
import { StrengthMeter, Skeleton } from "../ui";
import { IconDoc, IconUpload } from "../icons";

export function CasePanel({
  caseId,
  refreshKey,
}: {
  caseId: string | null;
  refreshKey: number;
}) {
  const { t } = useI18n();
  // Tagged with the case id it belongs to: if caseId changes while a request
  // is in flight, the stale answer is ignored instead of being shown.
  const [result, setResult] = useState<{
    caseId: string;
    data: CaseResponse | null;
  } | null>(null);

  const current = result && result.caseId === caseId ? result : null;
  // No case selected → "no case yet"; selected but no answer yet → skeleton;
  // answered with null → the server does not know this case.
  const missing = !caseId;
  const loading = !!caseId && current === null;

  // Promise-chain style (not async/await): every setState sits in a .then
  // callback, which keeps the effect below free of synchronous state updates.
  const load = useCallback(() => {
    if (!caseId) return;
    getCase(caseId)
      .then((c) => setResult({ caseId, data: c }))
      .catch(() => setResult({ caseId, data: null }));
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (missing) {
    return (
      <div className="card">
        <h3 className="mb-2 text-lg font-extrabold text-ink">{t("chat.caseCard")}</h3>
        <p className="text-sm font-bold text-ink/60">{t("chat.noCaseYet")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card">
        <h3 className="mb-3 text-lg font-extrabold text-ink">{t("chat.caseCard")}</h3>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const data = current?.data;
  if (!data) {
    return (
      <div className="card">
        <h3 className="mb-2 text-lg font-extrabold text-ink">{t("chat.caseCard")}</h3>
        <p className="text-sm font-bold text-ink/60">{t("cs.noCase")}</p>
      </div>
    );
  }

  const score = data.strength_score ?? data.verdict?.score ?? 0;

  return (
    <div className="card">
      <h3 className="mb-3 text-lg font-extrabold text-ink">{t("chat.caseCard")}</h3>
      <div className="flex items-center gap-4">
        <StrengthMeter score={score} />
        <div className="text-sm font-bold text-ink/70">
          <p>
            {t("chat.factsCount")}:{" "}
            <span className="text-ink">{data.facts?.length ?? 0}</span>
          </p>
          <p>
            {t("cs.documents")}:{" "}
            <span className="text-ink">{data.documents?.length ?? 0}</span>
          </p>
          <p className="mt-1 break-all text-xs text-ink/50">{data.id}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Link href="/grievance" className="btn-primary w-full py-2.5 text-base">
          <IconDoc className="text-lg" aria-hidden="true" />
          {t("chat.draftBtn")}
        </Link>
        <Link href={`/case/${data.id}`} className="btn-outline w-full py-2.5 text-base">
          <IconUpload className="text-lg" aria-hidden="true" />
          {t("chat.uploadBtn")}
        </Link>
      </div>
    </div>
  );
}
