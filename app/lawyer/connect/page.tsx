"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { lawyerConnect, type LawyerResponse } from "@/lib/api";
import { getCaseId } from "@/lib/storage";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import { IconCheck, IconPhone, IconScale } from "@/components/icons";

function LawyerInner() {
  const { t } = useI18n();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const caseId = searchParams.get("caseId") || getCaseId() || "";

  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LawyerResponse | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const connect = useCallback(
    async (confirmed: boolean) => {
      if (!caseId) {
        toast(t("cs.noCase"), "error");
        return;
      }
      if (!/^\d{10}$/.test(phone.trim())) {
        toast(t("lw.phonePh"), "error");
        return;
      }
      setBusy(true);
      try {
        const res = await lawyerConnect(caseId, phone.trim(), confirmed);
        if (res.requires_confirmation) {
          setNeedsConfirm(true);
          setResult(res);
          return;
        }
        setNeedsConfirm(false);
        setResult(res);
        toast(t("lw.success"), "success");
      } catch (err) {
        const msg = (err as { data?: { error?: unknown } })?.data?.error;
        const text = typeof msg === "string" ? msg : "";
        const lower = text.toLowerCase();
        if (lower.includes("strength") || lower.includes("score too low")) {
          toast(t("lw.weakCase"), "error");
        } else if (lower.includes("no verified lawyer")) {
          toast(t("lw.noLawyers"), "error");
        } else {
          toast(t("common.networkError"), "error");
        }
      } finally {
        setBusy(false);
      }
    },
    [caseId, phone, t, toast]
  );

  return (
    <div className="container-page mx-auto max-w-2xl">
      <h1 className="section-title flex items-center gap-2">
        <IconScale className="text-primary" aria-hidden="true" />
        {t("lw.title")}
      </h1>
      <p className="mb-5 text-base font-bold text-ink/60">{t("lw.subtitle")}</p>

      {!result && (
        <div className="card space-y-4">
          {caseId ? (
            <p className="break-all rounded-xl bg-cream px-4 py-2.5 font-mono text-sm font-bold text-ink/70">
              {t("cs.caseId")}: {caseId}
            </p>
          ) : (
            <div className="rounded-xl border-s-4 border-accent bg-accent/10 px-4 py-3">
              <p className="text-base font-extrabold text-ink">{t("cs.noCase")}</p>
              <Link href="/chat" className="btn-outline mt-2 inline-flex min-h-[44px] px-4 py-2 text-sm">
                {t("cs.goChat")}
              </Link>
            </div>
          )}
          <div>
            <label className="label" htmlFor="phone">{t("lw.phone")} *</label>
            <div className="flex items-center gap-2">
              <IconPhone className="text-2xl text-primary" aria-hidden="true" />
              <input
                id="phone"
                className="input min-h-[56px]"
                inputMode="numeric"
                maxLength={10}
                placeholder={t("lw.phonePh")}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-cream px-4 py-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-5 w-5 accent-[#2E8B57]"
            />
            <span className="text-base font-bold text-ink">{t("lw.confirm")}</span>
          </label>
          <button
            onClick={() => connect(consent)}
            disabled={busy || !consent || phone.length !== 10 || !caseId}
            className="btn-primary w-full"
          >
            {busy ? (
              <>
                <Spinner className="border-white/30 border-t-white" />
                {t("lw.connecting")}
              </>
            ) : (
              t("lw.connect")
            )}
          </button>
        </div>
      )}

      {result && needsConfirm && (
        <div className="card border-2 border-accent">
          <p className="text-base font-bold text-ink">{t("lw.confirmMsg")}</p>
          {result.message && (
            <p className="mt-2 text-sm font-bold text-ink/70">{result.message}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={() => connect(true)} disabled={busy} className="btn-accent">
              {busy ? <Spinner /> : t("lw.yes")}
            </button>
            <button onClick={() => setResult(null)} className="btn-ghost">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {result && !needsConfirm && (
        <div className="card border-t-4 border-success">
          <p className="mb-4 flex items-center gap-2 text-xl font-extrabold text-ink">
            <IconCheck className="text-primary-700" aria-hidden="true" />
            {t("lw.success")}
          </p>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm font-extrabold uppercase text-ink/50">{t("lw.advocate")}</dt>
              <dd className="text-lg font-extrabold text-ink">{result.advocate_name}</dd>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-extrabold uppercase text-ink/50">{t("lw.specialization")}</dt>
                <dd className="text-base font-bold text-ink">{result.specialization || "—"}</dd>
              </div>
              <div>
                <dt className="text-sm font-extrabold uppercase text-ink/50">{t("lw.languages")}</dt>
                <dd className="text-base font-bold text-ink">
                  {(result.languages || []).join(", ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-extrabold uppercase text-ink/50">{t("lw.callback")}</dt>
                <dd className="text-base font-bold text-ink">{result.callback_window || "—"}</dd>
              </div>
              <div>
                <dt className="text-sm font-extrabold uppercase text-ink/50">{t("lw.fees")}</dt>
                <dd className="text-base font-bold text-ink">{result.fees || "—"}</dd>
              </div>
            </div>
            {result.tracking_id && (
              <div>
                <dt className="text-sm font-extrabold uppercase text-ink/50">{t("lw.tracking")}</dt>
                <dd className="font-mono text-lg font-extrabold text-primary">{result.tracking_id}</dd>
              </div>
            )}
            {result.message && (
              <p className="rounded-xl bg-cream px-4 py-3 text-base font-bold text-ink/70">
                {result.message}
              </p>
            )}
          </dl>
          <Link href={caseId ? `/case/${caseId}` : "/track"} className="btn-outline mt-4">
            {t("common.back")}
          </Link>
        </div>
      )}
    </div>
  );
}

export default function LawyerPage() {
  return (
    <Suspense fallback={null}>
      <LawyerInner />
    </Suspense>
  );
}
