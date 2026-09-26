"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import {
  ApiError,
  escalationPath,
  getCase,
  getDocument,
  getVerdict,
  uploadDocument,
  type CaseResponse,
  type DocumentDetail,
  type EscalationStep,
  type UploadResponse,
  type Verdict,
} from "@/lib/api";
import { isSupportedUpload, isTooLarge, toUploadableFile } from "@/lib/pdf";
import { useToast } from "@/components/Toast";
import { LoadingBlock, Skeleton, StrengthMeter, StatusChip } from "@/components/ui";
import {
  IconCheck,
  IconChevronDown,
  IconDoc,
  IconRefresh,
  IconScale,
  IconUpload,
} from "@/components/icons";

const DOC_TYPES = ["fir", "sale_deed", "notice", "land_record", "sowing_cert"];

function bandLabelKey(band: string): string {
  const known = ["weak", "needs_evidence", "strong_preliminary", "strong"];
  return known.includes(band) ? `cs.band.${band}` : "cs.band.needs_evidence";
}

export default function CaseDashboardPage() {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const params = useParams<{ caseId: string }>();
  const caseId = params.caseId;

  // Fetched data is tagged with the case id it belongs to: a reply that
  // arrives after navigating to another case is ignored instead of flashed.
  const [loaded, setLoaded] = useState<{
    id: string;
    data: CaseResponse | null;
    verdict: Verdict | null;
  } | null>(null);

  const [docType, setDocType] = useState("fir");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [ocrDoc, setOcrDoc] = useState<DocumentDetail | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  const [steps, setSteps] = useState<EscalationStep[] | null>(null);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);

  // Promise-chain style (not async/await): every setState sits in a .then
  // callback, so calling this from the effect below never updates state
  // synchronously during the effect body.
  const load = useCallback(() => {
    if (!caseId) return;
    // The verdict only decorates the page; a failed verdict call must not
    // hide a case that exists.
    Promise.all([getCase(caseId), getVerdict(caseId).catch(() => null)])
      .then(([c, v]) => setLoaded({ id: caseId, data: c, verdict: v }))
      .catch((err: unknown) => {
        if (!(err instanceof ApiError && err.status === 404)) {
          toast(t("common.networkError"), "error");
        }
        setLoaded({ id: caseId, data: null, verdict: null });
      });
  }, [caseId, t, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const current = loaded && loaded.id === caseId ? loaded : null;
  const loading = current === null;
  const caseData = current?.data ?? null;
  const verdict = current?.verdict ?? null;

  const doUpload = useCallback(
    async (file: File) => {
      if (!caseId || !file) return;
      if (!isSupportedUpload(file) || isTooLarge(file)) {
        toast(t("gr.badFileType"), "error");
        return;
      }
      setUploading(true);
      setUploadResult(null);
      try {
        // PDFs are rasterised in the browser: the API's OCR only reads images.
        const res = await uploadDocument(
          await toUploadableFile(file),
          caseId,
          docType,
          lang
        );
        setUploadResult(res);
        toast(t("cs.uploadResult"), "success");
        load();
      } catch {
        toast(t("common.networkError"), "error");
      } finally {
        setUploading(false);
      }
    },
    [caseId, docType, lang, load, t, toast]
  );

  const openOcr = useCallback(
    async (docId: string) => {
      setOcrLoading(true);
      setOcrDoc(null);
      try {
        const d = await getDocument(docId);
        setOcrDoc(d);
      } catch {
        toast(t("common.error"), "error");
      } finally {
        setOcrLoading(false);
      }
    },
    [t, toast]
  );

  const loadEscalation = useCallback(async () => {
    if (!caseId) return;
    setStepsLoading(true);
    setStepsOpen(true);
    try {
      const res = await escalationPath(caseId);
      setSteps(res.steps || []);
    } catch {
      toast(t("common.error"), "error");
    } finally {
      setStepsLoading(false);
    }
  }, [caseId, t, toast]);

  if (loading) {
    return (
      <div className="container-page">
        <LoadingBlock lines={6} note={t("common.loading")} />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="container-page mx-auto max-w-xl">
        <div className="card flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-lg font-extrabold text-ink">{t("cs.noCase")}</p>
          <Link href="/chat" className="btn-primary">
            {t("cs.goChat")}
          </Link>
        </div>
      </div>
    );
  }

  const score = caseData.strength_score ?? verdict?.score ?? 0;
  const band = verdict?.band || caseData.verdict?.band || "needs_evidence";
  const missing = verdict?.missing_items || [];

  return (
    <div className="container-page">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="section-title">{t("cs.title")}</h1>
          <p className="mt-1 break-all font-mono text-sm font-bold text-ink/60">{caseId}</p>
          <p className="text-sm font-bold text-ink/50">
            {t("cs.createdAt")}: {new Date(caseData.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={caseData.status} label={t(`tr.status.${caseData.status}`) || caseData.status} />
          <button onClick={load} className="btn-ghost min-h-[48px] px-4 py-2 text-base">
            <IconRefresh className="text-lg" aria-hidden="true" />
            {t("cs.refresh")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        {/* Left column */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-3 text-lg font-extrabold text-ink">{t("cs.strength")}</h2>
            <div className="flex items-center gap-4">
              <StrengthMeter score={score} />
              <div>
                <p className="text-base font-extrabold text-ink">{t("cs.band")}:</p>
                <span className={`chip mt-1 ${score >= 60 ? "chip-success" : score >= 30 ? "chip-orange" : "chip-gray"}`}>
                  {t(bandLabelKey(band))}
                </span>
                {verdict?.message && (
                  <p className="mt-2 text-sm font-bold text-ink/70">{verdict.message}</p>
                )}
              </div>
            </div>

            <Link
              href={`/lawyer/connect?caseId=${caseId}`}
              aria-disabled={score < 60}
              tabIndex={score < 60 ? -1 : 0}
              className={`btn mt-4 w-full ${score >= 60 ? "btn-primary" : "btn-ghost pointer-events-none opacity-60"}`}
            >
              <IconScale className="text-lg" aria-hidden="true" />
              {t("cs.lawyer")}
            </Link>
            {score < 60 && (
              <p className="mt-2 text-sm font-bold text-ink/60">{t("cs.lawyerGate")}</p>
            )}
          </div>

          <div className="card">
            <h2 className="mb-3 text-lg font-extrabold text-ink">{t("cs.missing")}</h2>
            {missing.length === 0 ? (
              <p className="flex items-center gap-2 text-base font-bold text-success">
                <IconCheck aria-hidden="true" /> —
              </p>
            ) : (
              <ul className="space-y-2">
                {missing.map((m) => (
                  <li key={m} className="chip-orange min-h-[36px] w-full justify-start px-4 text-base">
                    ✕ {t(`cs.missing.${m}`)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2 className="mb-3 text-lg font-extrabold text-ink">{t("cs.facts")}</h2>
            {caseData.facts.length === 0 ? (
              <p className="text-sm font-bold text-ink/60">{t("chat.noCaseYet")}</p>
            ) : (
              <dl className="space-y-1.5">
                {caseData.facts.map((f) => (
                  <div key={f.id} className="flex gap-2 text-sm">
                    <dt className="font-extrabold text-primary-700">{f.key}:</dt>
                    <dd className="font-bold text-ink">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-3 text-lg font-extrabold text-ink">{t("cs.documents")}</h2>
            <div
              className={`flex min-h-[130px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-3 border-dashed p-4 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-ink/20 bg-cream"
              }`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) doUpload(f);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
            >
              <IconUpload className="text-4xl text-primary" aria-hidden="true" />
              <p className="text-base font-extrabold text-ink">{t("cs.uploadDoc")}</p>
              <p className="text-sm font-bold text-ink/50">{t("gr.uploadHint")}</p>
              <div className="mt-1 flex items-center gap-2">
                <label className="label mb-0" htmlFor="docType">{t("cs.docType")}:</label>
                <select
                  id="docType"
                  className="input min-h-[44px] w-auto py-1.5"
                  value={docType}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setDocType(e.target.value)}
                >
                  {DOC_TYPES.map((d) => (
                    <option key={d} value={d}>{t(`cs.docType.${d}`)}</option>
                  ))}
                </select>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  // Reset so choosing the same file again (e.g. after an
                  // error) fires change; the value is already captured above.
                  e.target.value = "";
                  if (f) doUpload(f);
                }}
              />
              {uploading && <Skeleton className="h-6 w-40" />}
            </div>

            {uploadResult && (
              <div className="mt-3 rounded-xl border border-success/40 bg-success/10 p-3">
                <p className="text-base font-extrabold text-ink">
                  <IconCheck className="me-1 inline text-primary-700" aria-hidden="true" />
                  {t("cs.uploadResult")} ({uploadResult.verdict_update?.score}/100)
                </p>
                <p className="mt-1 text-sm font-bold text-ink/70">{uploadResult.summary}</p>
                {uploadResult.extracted_facts?.length > 0 && (
                  <p className="mt-2 text-xs font-extrabold uppercase text-ink/50">
                    {t("cs.extractedFacts")}
                  </p>
                )}
                {uploadResult.extracted_facts?.map((f) => (
                  <p key={f.key} className="text-sm font-bold text-ink">
                    {f.key}: {f.value}
                  </p>
                ))}
              </div>
            )}

            {caseData.documents.length === 0 ? (
              <p className="mt-3 text-sm font-bold text-ink/60">—</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {caseData.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream px-3 py-2.5">
                    <IconDoc className="text-xl text-primary" aria-hidden="true" />
                    <span className="min-w-[100px] flex-1 truncate text-base font-bold text-ink">
                      {d.original_filename || d.filename || d.doc_type}
                    </span>
                    <span className="chip-blue">{t(`cs.docType.${d.doc_type}`)}</span>
                    <span className="text-xs font-bold text-ink/50">
                      {new Date(d.uploaded_at).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => openOcr(d.id)}
                      className="flex min-h-[40px] cursor-pointer items-center gap-1 rounded-lg px-2 text-sm font-bold text-logo-blue hover:bg-logo-blue/10"
                    >
                      {t("cs.ocr")}
                      <IconChevronDown className="text-base" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {ocrLoading && <LoadingBlock lines={2} note={t("common.loading")} />}
            {ocrDoc && (
              <div className="mt-3 rounded-xl border border-ink/10 bg-cream p-3">
                <p className="text-xs font-extrabold uppercase text-ink/50">{t("cs.ocr")}</p>
                <p className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-sm font-medium text-ink">
                  {ocrDoc.ocr_text}
                </p>
                <p className="mt-2 text-xs font-extrabold uppercase text-ink/50">{t("cs.summary")}</p>
                <p className="mt-1 text-sm font-bold text-ink/70">{ocrDoc.analysis_summary}</p>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="mb-3 flex items-center justify-between text-lg font-extrabold text-ink">
              {t("cs.escalation")}
              <button
                onClick={() => (stepsOpen ? setStepsOpen(false) : loadEscalation())}
                className="flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl bg-accent/15 px-4 py-2 text-base font-bold text-accent-600 hover:bg-accent/25"
              >
                {stepsOpen ? t("common.close") : t("cs.showEscalation")}
                <IconChevronDown
                  className={`text-lg transition-transform ${stepsOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
            </h2>
            {stepsOpen && (
              stepsLoading ? (
                <LoadingBlock lines={3} />
              ) : steps && steps.length > 0 ? (
                <ol className="space-y-0">
                  {steps.map((s, i) => (
                    <li key={i} className="relative flex gap-3 pb-4">
                      {i < steps.length - 1 && (
                        <span className="absolute start-[15px] top-8 h-full w-0.5 bg-ink/15" aria-hidden="true" />
                      )}
                      <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-white">
                        {s.step ?? s.level ?? i + 1}
                      </span>
                      <div className="flex-1 rounded-xl bg-cream px-3 py-2">
                        <p className="text-base font-extrabold text-ink">{s.authority}</p>
                        <p className="text-sm font-bold text-ink/70">
                          {s.deadline || s.action || (s.timeline_days ? `${s.timeline_days} days` : "")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm font-bold text-ink/60">{t("common.notFound")}</p>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
