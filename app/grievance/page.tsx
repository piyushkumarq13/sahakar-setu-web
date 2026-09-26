"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  RateLimitError,
  chat,
  cooldownRemainingMs,
  ensureAwake,
  getCase,
  grievanceDraft,
  isRateLimited,
  uploadDocument,
  type GrievanceDraftResponse,
} from "@/lib/api";
import { clearCaseId, clearSessionId, getCaseId, saveCase, setCaseId, setSessionId } from "@/lib/storage";
import { isSupportedUpload, isTooLarge, toUploadableFile } from "@/lib/pdf";
import { escapeHtml } from "@/lib/print";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import {
  IconCheck,
  IconCopy,
  IconDoc,
  IconPrint,
  IconShield,
  IconUpload,
} from "@/components/icons";

const CATEGORIES = ["grievance", "insurance", "loan", "scheme", "laws", "other"];
const GTYPES = ["society", "registrar", "insurance", "govt", "other"];

const STEPS = ["gr.step1", "gr.step2", "gr.step3", "gr.step4"] as const;

/** Statuses the server returns when the stored case does not exist on it. */
function isMissingCase(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 400);
}

/** The extractor may file a Hindi spelling of a slot; accept either alias. */
const CORE_FACT_ALIASES: string[][] = [
  ["name", "naam"],
  ["village", "gaon"],
  ["district", "zila"],
];

/** Fact extraction is an LLM call: it can come back empty, so allow re-sends. */
const FACT_ROUNDS = 3;
const FACT_RETRY_DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasCoreFacts(keys: string[]): boolean {
  return CORE_FACT_ALIASES.every((aliases) =>
    aliases.some((alias) => keys.includes(alias))
  );
}

/** Fact keys the server holds for the case; `null` means it could not be asked. */
async function caseFactKeys(caseId: string): Promise<string[] | null> {
  try {
    const c = await getCase(caseId);
    return (c.facts ?? []).map((f) => f.key);
  } catch {
    // Offline or degraded: let the draft request itself decide.
    return null;
  }
}

function GrievanceInner() {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  const [step, setStep] = useState(0);
  const [category, setCategory] = useState("grievance");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [name, setName] = useState("");
  const [village, setVillage] = useState("");
  const [district, setDistrict] = useState("");
  const [pacs, setPacs] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [gtype, setGtype] = useState("society");
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState<GrievanceDraftResponse | null>(null);
  /** Case id behind the displayed draft; used by the "attach later" link. */
  const [resultCaseId, setResultCaseId] = useState<string | null>(null);
  /** The complaint landed but its attachment did not — surfaced, not toasted. */
  const [docNotAttached, setDocNotAttached] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const submitRef = useRef<() => void>(() => {});

  // prefill from existing case (?caseId= or storage)
  useEffect(() => {
    const cid = searchParams.get("caseId") || getCaseId();
    if (!cid) return;
    let cancelled = false;
    getCase(cid)
      .then((c) => {
        if (cancelled) return;
        const get = (key: string) => c.facts?.find((f) => f.key === key)?.value || "";
        setName(get("name"));
        setVillage(get("village"));
        setDistrict(get("district"));
        setPacs(get("pacs"));
        setIncidentDate(get("loss_date") || get("issue_date") || "");
        if (c.category && CATEGORIES.includes(c.category)) setCategory(c.category);
      })
      .catch((err) => {
        // An id kept from an earlier deployment can point at a case that no
        // longer exists; drop it so submission creates a fresh one.
        if (!cancelled && isMissingCase(err)) {
          clearCaseId();
          clearSessionId();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const canNext = () => {
    if (step === 0) return description.trim().length >= 10;
    if (step === 1) return true; // file optional
    if (step === 2) return name.trim() && village.trim() && district.trim();
    return true;
  };

  const pickFile = useCallback(
    (f: File | null | undefined) => {
      if (!f) return;
      if (!isSupportedUpload(f) || isTooLarge(f)) {
        toast(t("gr.badFileType"), "error");
        return;
      }
      setFile(f);
    },
    [t, toast]
  );

  const submit = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    setResult(null);
    setResultCaseId(null);
    setDocNotAttached(false);

    const retryAction = {
      label: t("common.retry"),
      onClick: () => submitRef.current(),
    };

    try {
      // A 429 cooldown means every call bounces for the next minute; say so
      // instead of walking the user through a doomed request.
      if (isRateLimited()) {
        toast(
          t("common.retryIn", { s: Math.ceil(cooldownRemainingMs() / 1000) }),
          "error",
          retryAction
        );
        return;
      }

      // Cold starts run 30-90s. Waiting here keeps the submit from dying on a
      // sleeping instance and gives the user an honest "waking up" stage.
      setStage(t("common.waitCold"));
      if (!(await ensureAwake(60_000))) {
        throw new ApiError("server-unreachable", 0);
      }

      setStage(t("gr.creatingCase"));
      const factsMessage = `मेरा नाम ${name} है। मैं ${village} गांव, ${district} जिले का निवासी हूँ। मेरी PACS/समिति: ${pacs || "नहीं बताई"}। घटना की तारीख: ${incidentDate || "नहीं बताई"}। मेरी शिकायत: ${description}`;

      // Only reuse the stored case while the server still knows it. A stale id
      // makes the server silently drop the facts we send, which later surfaces
      // as "case not found" on upload and "no facts" on draft.
      let caseId = getCaseId();
      if (caseId) {
        try {
          await getCase(caseId);
        } catch (err) {
          if (!isMissingCase(err)) throw err;
          clearCaseId();
          clearSessionId();
          caseId = null;
        }
      }

      const sendFacts = async (existing: string | null) => {
        // Deliberately no stored sessionId: a session the server does not know
        // (redeployed database, cleared data) makes its case insert fail
        // silently, which the user then sees as "first share your details in
        // chat". Letting the server mint the session keeps this reliable.
        const res = await chat({
          message: factsMessage,
          sessionId: null,
          caseId: existing,
          language: "hi",
        });
        if (!res.caseId) {
          clearSessionId();
          throw new ApiError("case-not-created", 500);
        }
        setSessionId(res.sessionId);
        setCaseId(res.caseId);
        return res.caseId;
      };

      // Facts are extracted by an LLM on the server and can land empty or
      // incomplete; the draft endpoint refuses a case without them. Re-send a
      // few times before telling the user their details did not get through.
      let factsReady = false;
      for (let round = 1; round <= FACT_ROUNDS; round++) {
        caseId = await sendFacts(caseId);
        const keys = await caseFactKeys(caseId);
        if (keys === null || hasCoreFacts(keys)) {
          factsReady = true;
          break;
        }
        // Anything at all is enough to draft with; only a fully empty case is fatal.
        if (keys.length > 0 && round === FACT_ROUNDS) {
          factsReady = true;
          break;
        }
        setStage(t("gr.retryingFacts"));
        await sleep(FACT_RETRY_DELAY_MS * round);
      }
      if (!factsReady) throw new ApiError("missing-facts", 400);
      if (!caseId) throw new ApiError("case-not-created", 500);

      let docFailed = false;
      if (file) {
        setStage(t("common.uploading"));
        try {
          // The API's OCR only understands images, so PDFs are rasterised here
          // first instead of being posted raw (which the server rejects).
          const uploadable = await toUploadableFile(file);
          await uploadDocument(uploadable, caseId, "notice", lang);
        } catch {
          // The attachment is optional; the complaint must still be filed.
          docFailed = true;
        }
      }

      setStage(t("gr.generatingDraft"));
      const draft = await grievanceDraft(caseId, category, lang);
      setResult(draft);
      setResultCaseId(caseId);
      setDocNotAttached(docFailed);
      saveCase({
        trackingId: draft.tracking_id,
        caseId,
        category,
        subject: draft.subject,
        date: new Date().toISOString(),
      });
      toast(t("gr.trackingTitle"), "success");
    } catch (err) {
      if (err instanceof RateLimitError) {
        toast(
          t("common.retryIn", { s: Math.ceil(err.retryAfterMs / 1000) }),
          "error",
          retryAction
        );
      } else if (err instanceof ApiError && err.status === 400) {
        toast(t("gr.noFacts"), "error", retryAction);
      } else {
        toast(t("common.networkError"), "error", retryAction);
      }
    } finally {
      busyRef.current = false;
      setSubmitting(false);
      setStage("");
    }
  }, [category, description, district, file, incidentDate, lang, name, pacs, t, toast, village]);

  // Toast retry buttons outlive the render that created them, so they call
  // through a ref instead of closing over `submit` itself.
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  const printDraft = () => {
    if (!result) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html><head><title>${escapeHtml(
        result.tracking_id
      )}</title><style>body{font-family:'Noto Sans Devanagari','Nirmala UI',sans-serif;padding:24px;line-height:1.6}</style></head><body><h3>${escapeHtml(
        result.addressee
      )}</h3><h4>${escapeHtml(
        result.subject
      )}</h4><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(
        result.body
      )}</pre><p>${escapeHtml(result.tracking_id)}</p></body></html>`
    );
    w.document.close();
    w.print();
  };

  const copyDraft = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        `${result.addressee}\n${result.subject}\n\n${result.body}\n\n${result.tracking_id}`
      );
      toast(t("common.copied"), "success");
    } catch {
      toast(t("common.error"), "error");
    }
  };

  if (result) {
    return (
      <div className="container-page">
        <div className="card border-t-4 border-success text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/20 text-3xl text-primary-700">
            <IconCheck />
          </span>
          <h1 className="mt-3 text-2xl font-extrabold text-ink md:text-3xl">
            {t("gr.trackingTitle")}
          </h1>
          <p className="mt-1 text-base font-bold text-ink/70">
            {t("gr.trackingHint")}
          </p>
          <p className="mt-4 inline-block rounded-xl bg-primary px-6 py-3 text-2xl font-extrabold tracking-wider text-white">
            {result.tracking_id}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/track" className="btn-primary">
              {t("tr.title")}
            </Link>
            <button onClick={printDraft} className="btn-outline">
              <IconPrint className="text-lg" aria-hidden="true" />
              {t("common.print")}
            </button>
            <button onClick={copyDraft} className="btn-outline">
              <IconCopy className="text-lg" aria-hidden="true" />
              {t("common.copy")}
            </button>
          </div>
          {file && !docNotAttached && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary-700">
              <IconCheck aria-hidden="true" />
              {t("gr.docAttached")}
            </p>
          )}
        </div>

        {docNotAttached && (
          <div className="card mt-4 border-s-4 border-accent bg-accent/10">
            <p className="text-base font-extrabold text-ink">
              {t("gr.docNotAttachedTitle")}
            </p>
            <p className="mt-1 text-sm font-bold text-ink/70">
              {t("gr.docNotAttached")}
            </p>
            {resultCaseId && (
              <Link
                href={`/case/${resultCaseId}`}
                className="btn-outline mt-3 min-h-[48px] px-4 py-2 text-base"
              >
                {t("common.viewDetails")}
              </Link>
            )}
          </div>
        )}

        <div className="card mt-4">
          <h2 className="mb-1 text-lg font-extrabold text-ink">{result.addressee}</h2>
          <p className="mb-3 text-base font-bold text-ink/70">{result.subject}</p>
          <h3 className="mb-2 text-base font-extrabold text-ink">
            {t("gr.bodyPreview")}
          </h3>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-cream p-4 text-base font-medium leading-relaxed text-ink">
            {result.body}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page">
      <h1 className="section-title">{t("gr.title")}</h1>
      <p className="mb-5 text-base font-bold text-ink/60">{t("gr.subtitle")}</p>

      <div className="grid gap-4 lg:grid-cols-[3fr_1fr]">
        <section className="card">
          {/* Step indicator */}
          <ol className="mb-6 flex items-center gap-1 sm:gap-2" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 items-center gap-1 sm:gap-2">
                <button
                  onClick={() => i < step && setStep(i)}
                  disabled={i > step}
                  className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-base font-extrabold ${
                    i < step
                      ? "bg-primary text-white"
                      : i === step
                      ? "bg-accent text-ink"
                      : "bg-ink/10 text-ink/50"
                  }`}
                  aria-current={i === step ? "step" : undefined}
                >
                  {i < step ? <IconCheck /> : i + 1}
                </button>
                <span
                  className={`hidden text-sm font-bold sm:block ${
                    i === step ? "text-ink" : "text-ink/50"
                  }`}
                >
                  {t(s)}
                </span>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="cat">{t("gr.category")} *</label>
                <p className="mb-1.5 text-sm font-bold text-ink/50">{t("gr.categoryHint")}</p>
                <select
                  id="cat"
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{t(`gr.cat.${c}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="desc">{t("gr.description")} *</label>
                <textarea
                  id="desc"
                  className="input min-h-[140px]"
                  placeholder={t("gr.descriptionPh")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div
              className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-3 border-dashed p-6 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-ink/20 bg-cream"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files?.[0]);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            >
              <IconUpload className="text-5xl text-primary" aria-hidden="true" />
              <p className="text-lg font-extrabold text-ink">{t("gr.uploadBox")}</p>
              <p className="text-sm font-bold text-ink/50">{t("gr.uploadHint")}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {file && (
                <p className="chip-green max-w-full break-all">
                  <IconDoc className="shrink-0 text-lg" aria-hidden="true" />
                  {t("gr.fileSelected", { name: file.name })}
                  <button
                    className="ms-2 cursor-pointer underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                  >
                    {t("gr.removeFile")}
                  </button>
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="name">{t("gr.name")} *</label>
                  <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="village">{t("gr.village")} *</label>
                  <input id="village" className="input" value={village} onChange={(e) => setVillage(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="district">{t("gr.district")} *</label>
                  <input id="district" className="input" value={district} onChange={(e) => setDistrict(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="pacs">{t("gr.pacs")}</label>
                  <input id="pacs" className="input" value={pacs} onChange={(e) => setPacs(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="date">{t("gr.date")}</label>
                  <input
                    id="date"
                    type="date"
                    className="input"
                    value={incidentDate}
                    onChange={(e) => setIncidentDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="gtype">{t("gr.gtype")} *</label>
                <select
                  id="gtype"
                  className="input"
                  value={gtype}
                  onChange={(e) => setGtype(e.target.value)}
                >
                  {GTYPES.map((c) => (
                    <option key={c} value={c}>{t(`gr.type.${c}`)}</option>
                  ))}
                </select>
              </div>
              <div className="rounded-xl bg-cream p-4">
                <p className="text-sm font-bold text-ink/70">
                  <IconShield className="me-1 inline text-primary" aria-hidden="true" />
                  {t("gr.safeTitle")}
                </p>
                <ul className="mt-2 space-y-1 text-sm font-bold text-ink/70">
                  <li>✓ {t("gr.safe1")}</li>
                  <li>✓ {t("gr.safe2")}</li>
                  <li>✓ {t("gr.safe3")}</li>
                </ul>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              onClick={() => {
                if (submitting) return;
                if (step === 0) {
                  setCategory("grievance");
                  setDescription("");
                  setFile(null);
                  setName("");
                  setVillage("");
                  setDistrict("");
                  setPacs("");
                  setIncidentDate("");
                  setGtype("society");
                } else setStep((s) => s - 1);
              }}
              className="btn-ghost"
            >
              {step === 0 ? t("common.cancel") : t("common.back")}
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext()}
                className="btn-primary"
              >
                {t("common.next")}
              </button>
            ) : (
              <button onClick={submit} disabled={submitting} className="btn-primary min-w-[160px]">
                {submitting ? (
                  <>
                    <Spinner className="border-white/30 border-t-white" />
                    {stage}
                  </>
                ) : (
                  t("common.submit")
                )}
              </button>
            )}
          </div>
        </section>

        {/* Safe panel */}
        <aside className="card h-fit">
          <h2 className="mb-3 text-lg font-extrabold text-ink">{t("gr.safeTitle")}</h2>
          <ul className="space-y-3 text-base font-bold text-ink/70">
            <li className="flex gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/20 text-sm text-primary-700">✓</span>
              {t("gr.safe1")}
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/20 text-sm text-primary-700">✓</span>
              {t("gr.safe2")}
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/20 text-sm text-primary-700">✓</span>
              {t("gr.safe3")}
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

export default function GrievancePage() {
  return (
    <Suspense fallback={null}>
      <GrievanceInner />
    </Suspense>
  );
}
