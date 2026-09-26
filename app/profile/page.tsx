"use client";

import { useSyncExternalStore, useState } from "react";
import Link from "next/link";
import { LANGUAGES, useI18n } from "@/lib/i18n";
import {
  clearAllData,
  getSavedCasesServerSnapshot,
  getSavedCasesSnapshot,
  subscribeSavedCases,
} from "@/lib/storage";
import { useToast } from "@/components/Toast";
import { IconArrowRight, IconCheck, IconGlobe, IconUser } from "@/components/icons";

export default function ProfilePage() {
  const { t, lang, setLang } = useI18n();
  const { toast } = useToast();
  const cases = useSyncExternalStore(
    subscribeSavedCases,
    getSavedCasesSnapshot,
    getSavedCasesServerSnapshot
  );
  const [confirming, setConfirming] = useState(false);

  const doClear = () => {
    clearAllData();
    setConfirming(false);
    toast(t("pr.clearDone"), "success");
  };

  return (
    <div className="container-page">
      <h1 className="section-title flex items-center gap-2">
        <IconUser /> {t("pr.title")}
      </h1>

      <section className="card">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-ink">
          <IconGlobe /> {t("pr.languageLabel")}
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              aria-pressed={lang === l.code}
              className={`flex min-h-[48px] items-center justify-between rounded-xl px-4 text-base font-extrabold transition-colors ${
                lang === l.code
                  ? "bg-primary text-white"
                  : "bg-cream text-ink/80 hover:bg-primary/10"
              }`}
            >
              {l.name}
              {lang === l.code && <IconCheck />}
            </button>
          ))}
        </div>
      </section>

      <section className="card mt-5">
        <h2 className="mb-3 flex flex-wrap items-center justify-between gap-2 text-lg font-extrabold text-ink">
          {t("pr.myCases")}
          <Link
            href="/my-cases"
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-primary hover:bg-primary/10"
          >
            {t("mc.viewAll")}
            <IconArrowRight className="text-base" aria-hidden="true" />
          </Link>
        </h2>
        {cases.length === 0 ? (
          <p className="text-base font-bold text-ink/60">{t("pr.noCases")}</p>
        ) : (
          <ul className="space-y-3">
            {cases.map((c) => (
              <li
                key={c.trackingId}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-base font-extrabold text-ink">{c.trackingId}</p>
                  <p className="truncate text-sm font-bold text-ink/70">
                    {c.subject || t("common.notFound")}
                  </p>
                  <p className="text-xs font-bold text-ink/50">
                    {c.category} · {c.date}
                  </p>
                </div>
                <Link href="/track" className="btn-outline min-h-[48px] px-4 py-2 text-sm">
                  {t("common.viewDetails")}
                </Link>
                {c.caseId && (
                  <Link
                    href={`/case/${c.caseId}`}
                    className="btn-primary min-h-[48px] px-4 py-2 text-sm"
                  >
                    {t("cs.title")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-5">
        <h2 className="mb-3 text-lg font-extrabold text-ink">{t("pr.clearData")}</h2>
        {confirming ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-base font-bold text-ink/70">{t("pr.clearConfirm")}</p>
            <button onClick={doClear} className="btn-accent min-h-[48px] px-4 py-2 text-sm">
              {t("pr.clearData")}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="btn-outline min-h-[48px] px-4 py-2 text-sm"
            >
              {t("common.cancel")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="btn-outline min-h-[48px] border-red-400 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            {t("pr.clearData")}
          </button>
        )}
      </section>
    </div>
  );
}
