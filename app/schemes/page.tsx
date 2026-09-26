"use client";

import { useEffect, useState, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import {
  getSchemes,
  schemeEligibility,
  type SchemeInfo,
} from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import {
  IconCheck,
  IconChat,
  IconClose,
  IconDoc,
  IconGrid,
  IconLandmark,
  IconScale,
  IconShield,
  IconSprout,
} from "@/components/icons";

interface QuizResult {
  eligible: boolean;
  reason?: string;
  docs?: string[];
}

const STATIC_CARDS: {
  key: string;
  descKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  { key: "sch.pmfby", descKey: "sch.pmfbyDesc", Icon: IconSprout },
  { key: "sch.kcc", descKey: "sch.kccDesc", Icon: IconDoc },
  { key: "sch.coopLoan", descKey: "sch.coopLoanDesc", Icon: IconLandmark },
  { key: "sch.pmkisan", descKey: "sch.pmkisanDesc", Icon: IconGrid },
  { key: "sch.mudra", descKey: "sch.mudraDesc", Icon: IconShield },
  { key: "sch.yuva", descKey: "sch.yuvaDesc", Icon: IconScale },
];

export default function SchemesPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [apiSchemes, setApiSchemes] = useState<SchemeInfo[]>([]);
  const [quizScheme, setQuizScheme] = useState<SchemeInfo | null>(null);
  const [pickedScheme, setPickedScheme] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSchemes()
      .then((r) => setApiSchemes(r.schemes || []))
      .catch(() => setApiSchemes([]));
  }, []);

  function openQuiz(s: SchemeInfo) {
    setQuizScheme(s);
    setAnswers({});
    setQuizResult(null);
  }

  function setAnswer(id: string, value: string) {
    setAnswers((a) => ({ ...a, [id]: value }));
  }

  async function submitQuiz() {
    if (!quizScheme) return;
    const parsed: Record<string, unknown> = {};
    for (const q of quizScheme.questions) {
      const v = answers[q.id];
      if (v === undefined || v === "") {
        toast(t("sch.quizIntro"), "error");
        return;
      }
      parsed[q.id] = q.type === "number" ? Number(v) : q.type === "boolean" ? v === "true" : v;
    }
    setBusy(true);
    try {
      const res = await schemeEligibility(quizScheme.scheme, parsed);
      setQuizResult({
        eligible: res.eligible,
        reason: res.reason || res.reasons?.join(", "),
        docs: res.docs || res.nextSteps || [],
      });
    } catch {
      toast(t("common.error"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page">
      <h1 className="section-title">{t("sch.title")}</h1>
      <p className="mb-5 text-base font-bold text-ink/60">{t("sch.subtitle")}</p>

      {/* Eligibility checker in its own row at the top — users can check
          eligibility without scrolling past the scheme cards. */}
      <div className="card mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <IconCheck className="mt-1 text-3xl text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-xl font-extrabold text-ink">{t("sch.quizTitle")}</h2>
            <p className="text-sm font-bold text-ink/60">{t("sch.quizIntro")}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:w-80">
          {apiSchemes.length > 0 ? (
            <>
              <select
                className="input min-h-[48px]"
                value={pickedScheme}
                onChange={(e) => setPickedScheme(e.target.value)}
                aria-label={t("sch.quizTitle")}
              >
                <option value="">— {t("sch.viewMore")} —</option>
                {apiSchemes.map((s) => (
                  <option key={s.scheme} value={s.scheme}>
                    {s.scheme}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const s = apiSchemes.find((x) => x.scheme === pickedScheme);
                  if (s) openQuiz(s);
                  else toast(t("sch.quizIntro"), "error");
                }}
                className="btn-accent py-2.5 text-base"
              >
                {t("sch.checkEligibility")}
              </button>
            </>
          ) : (
            <Link
              href={`/chat?q=${encodeURIComponent(
                `${t("sch.quizTitle")} — eligibility kya hai?`
              )}`}
              className="btn-outline py-2.5 text-base"
            >
              <IconChat className="text-lg" aria-hidden="true" />
              {t("sch.askChat")}
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STATIC_CARDS.map((c) => (
          <div key={c.key} className="card flex flex-col gap-2">
            <c.Icon className="text-4xl text-primary" aria-hidden="true" />
            <h2 className="text-xl font-extrabold text-ink">{t(c.key)}</h2>
            <p className="flex-1 text-sm font-bold text-ink/60">{t(c.descKey)}</p>
            <div className="mt-2 flex flex-col gap-2">
              <Link
                href={`/chat?q=${encodeURIComponent(
                  `${t(c.key)} — eligibility kya hai?`
                )}`}
                className="btn-outline py-2.5 text-base"
              >
                <IconChat className="text-lg" aria-hidden="true" />
                {t("sch.askChat")}
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Quiz modal */}
      {quizScheme && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("sch.quizTitle")}
          onClick={(e) => e.target === e.currentTarget && setQuizScheme(null)}
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-ink">
                {quizScheme.scheme} — {t("sch.quizTitle")}
              </h2>
              <button
                onClick={() => setQuizScheme(null)}
                className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl text-xl text-ink/60 hover:bg-ink/5"
                aria-label={t("common.close")}
              >
                <IconClose />
              </button>
            </div>
            {!quizResult ? (
              <div className="space-y-4">
                <p className="text-sm font-bold text-ink/60">{t("sch.quizIntro")}</p>
                {quizScheme.questions.map((q) => (
                  <div key={q.id}>
                    <label className="label" htmlFor={`q-${q.id}`}>{q.text} *</label>
                    {q.type === "boolean" ? (
                      <div className="flex gap-2">
                        {["true", "false"].map((v) => (
                          <button
                            key={v}
                            onClick={() => setAnswer(q.id, v)}
                            className={`btn min-h-[48px] flex-1 py-2 text-base ${
                              answers[q.id] === v ? "btn-primary" : "btn-ghost"
                            }`}
                          >
                            {v === "true" ? t("common.yes") : t("common.no")}
                          </button>
                        ))}
                      </div>
                    ) : q.type === "choice" && q.options ? (
                      <select
                        id={`q-${q.id}`}
                        className="input"
                        value={answers[q.id] || ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                      >
                        <option value="">—</option>
                        {q.options.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`q-${q.id}`}
                        className="input"
                        type={q.type === "number" ? "number" : "text"}
                        value={answers[q.id] || ""}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                      />
                    )}
                  </div>
                ))}
                <button onClick={submitQuiz} disabled={busy} className="btn-primary w-full">
                  {busy ? <Spinner className="border-white/30 border-t-white" /> : t("sch.done")}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p
                  className={`rounded-xl px-4 py-3 text-lg font-extrabold ${
                    quizResult.eligible
                      ? "bg-success/20 text-primary-700"
                      : "bg-accent/15 text-accent-600"
                  }`}
                >
                  {quizResult.eligible ? (
                    <IconCheck className="me-1 inline" aria-hidden="true" />
                  ) : (
                    <IconClose className="me-1 inline" aria-hidden="true" />
                  )}
                  {quizResult.eligible ? t("sch.eligible") : t("sch.notEligible")}
                </p>
                {quizResult.reason && (
                  <p className="text-base font-bold text-ink/70">
                    <span className="font-extrabold text-ink">{t("sch.reason")}:</span>{" "}
                    {quizResult.reason}
                  </p>
                )}
                {quizResult.docs && quizResult.docs.length > 0 && (
                  <div>
                    <p className="mb-1 text-base font-extrabold text-ink">{t("sch.docs")}:</p>
                    <ul className="list-inside list-disc space-y-1 text-base font-bold text-ink/70">
                      {quizResult.docs.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button onClick={() => setQuizScheme(null)} className="btn-primary w-full">
                  {t("common.close")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
