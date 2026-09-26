const DEFAULT_API_BASE = "https://sahakar-setu-server.onrender.com";

/**
 * API origin. Override with NEXT_PUBLIC_API_BASE (e.g. a local or staging
 * server); otherwise the hosted deployment is used.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || DEFAULT_API_BASE)
  .trim()
  .replace(/\/+$/, "");

const TIMEOUT_MS = 120_000;
const WARMUP_TIMEOUT_MS = 45_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 700;
/** A request that fails this fast never reached the API, so replaying is safe. */
const FAST_FAILURE_MS = 20_000;
/** Edge/gateway failures that mean the request was not processed. */
const RETRYABLE_STATUS = new Set([408, 502, 503, 504]);
/** OCR of a scanned document can outlast the default request budget. */
const UPLOAD_TIMEOUT_MS = 180_000;
/** Health pings are cheap; a short budget keeps a dead instance from hanging the UI. */
const HEALTH_TIMEOUT_MS = 12_000;
/** Render's free tier idles out after ~15 minutes without traffic. */
const KEEPALIVE_MS = 4 * 60_000;

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export class RateLimitError extends ApiError {
  retryAfterMs: number;
  constructor() {
    super("rate-limited", 429);
    this.name = "RateLimitError";
    this.retryAfterMs = RATE_LIMIT_COOLDOWN_MS;
  }
}

let cooldownUntil = 0;

export function isRateLimited(): boolean {
  return Date.now() < cooldownUntil;
}

export function cooldownRemainingMs(): number {
  return Math.max(0, cooldownUntil - Date.now());
}

function markRateLimited() {
  cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Abort signal that fires after `ms`; used for the lightweight health pings. */
function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

// ---------- connection status ----------

export type ServerStatus = "ok" | "waking" | "offline";

let serverStatus: ServerStatus = "ok";
const statusListeners = new Set<(status: ServerStatus) => void>();

export function getServerStatus(): ServerStatus {
  return serverStatus;
}

export function subscribeServerStatus(
  listener: (status: ServerStatus) => void
): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

function setServerStatus(next: ServerStatus) {
  if (next === serverStatus) return;
  serverStatus = next;
  statusListeners.forEach((listener) => listener(next));
}

function markReachable() {
  setServerStatus("ok");
}

/** Distinguishes "no internet" from "host is cold" so the UI can say which. */
function noteConnectionTrouble() {
  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;
  setServerStatus(offline ? "offline" : "waking");
}

/**
 * Pings /health until the API answers or `maxWaitMs` elapses. A sleeping free
 * instance needs 30-90s to boot; waiting here turns that into a bounded pause
 * instead of a request that dies against the cold start.
 */
export async function ensureAwake(maxWaitMs = 90_000): Promise<boolean> {
  if (typeof window === "undefined") return true;
  if (navigator.onLine === false) {
    setServerStatus("offline");
    return false;
  }
  const startedAt = Date.now();
  let delay = 1_000;
  for (;;) {
    try {
      const res = await fetch(`${API_BASE}/health`, {
        cache: "no-store",
        signal: timeoutSignal(HEALTH_TIMEOUT_MS),
      });
      if (res.ok) {
        markReachable();
        return true;
      }
      setServerStatus("waking");
    } catch {
      noteConnectionTrouble();
    }
    if (Date.now() - startedAt >= maxWaitMs) return false;
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.6), 6_000);
  }
}

/**
 * Keeps the hosted instance warm for as long as the tab is alive and open:
 * a health ping every few minutes, one on every return to the tab, and one
 * when the connection comes back. Returns a cleanup function.
 */
export function startKeepAlive(): () => void {
  if (typeof window === "undefined") return () => {};
  if (navigator.onLine === false) setServerStatus("offline");

  const ping = () => {
    if (document.visibilityState === "hidden") return;
    void fetch(`${API_BASE}/health`, {
      cache: "no-store",
      signal: timeoutSignal(HEALTH_TIMEOUT_MS),
    })
      .then((res) => {
        if (res.ok) markReachable();
        else setServerStatus("waking");
      })
      .catch(() => noteConnectionTrouble());
  };

  const timer = window.setInterval(ping, KEEPALIVE_MS);
  const onVisibility = () => {
    if (document.visibilityState === "visible") ping();
  };
  const onOffline = () => setServerStatus("offline");
  const onOnline = () => {
    setServerStatus("waking");
    ping();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
  };
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * Builds request headers. FormData bodies must not get an explicit
 * Content-Type, otherwise the browser cannot add the multipart boundary and
 * the upload arrives unparsable at the server.
 */
function buildHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers || {});
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

function isRetryable(err: ApiError, elapsedMs: number): boolean {
  if (err instanceof RateLimitError) return false;
  if (RETRYABLE_STATUS.has(err.status)) return true;
  // status 0 covers DNS, socket and CORS failures as well as our own timeout.
  // Only fast failures are replayed, so a hung server does not multiply the wait.
  return err.status === 0 && elapsedMs < FAST_FAILURE_MS;
}

/**
 * Wakes the hosted instance when the app mounts. Free hosting tiers sleep after
 * a period of inactivity, so the first request of a visit would otherwise be
 * the one that pays the 30-90s cold start — or times out entirely.
 */
export function warmUpServer(): void {
  if (typeof window === "undefined") return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);
  void fetch(`${API_BASE}/health`, {
    cache: "no-store",
    signal: controller.signal,
  })
    .then((res) => {
      if (res.ok) markReachable();
      else setServerStatus("waking");
    })
    .catch(() => noteConnectionTrouble())
    .finally(() => clearTimeout(timer));
}

async function requestOnce<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      ...init,
      signal: controller.signal,
      headers: buildHeaders(init),
    });
    markReachable();

    if (res.status === 429) {
      markRateLimited();
      throw new RateLimitError();
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (!res.ok) {
      const msg =
        (body as { error?: string | unknown })?.error ||
        (body as { hint?: string })?.hint ||
        `HTTP ${res.status}`;
      throw new ApiError(
        typeof msg === "string" ? msg : `HTTP ${res.status}`,
        res.status,
        body
      );
    }
    return body as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    noteConnectionTrouble();
    if (isAbortError(err)) {
      throw new ApiError("timeout", 0);
    }
    throw new ApiError(
      err instanceof Error ? err.message : "network-error",
      0
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Performs a request, replaying it on transient network and gateway failures.
 * Retries stay bounded: at most MAX_ATTEMPTS, each with a fresh timeout.
 */
async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = TIMEOUT_MS
): Promise<T> {
  let lastError = new ApiError("network-error", 0);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const startedAt = Date.now();
    try {
      return await requestOnce<T>(path, init, timeoutMs);
    } catch (err) {
      lastError = err instanceof ApiError ? err : lastError;
      if (
        attempt >= MAX_ATTEMPTS ||
        !isRetryable(lastError, Date.now() - startedAt)
      ) {
        throw lastError;
      }
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}

// ---------- types ----------

export interface Citation {
  source: string;
  section?: string;
}

export interface ChatRequest {
  message: string;
  sessionId?: string | null;
  caseId?: string | null;
  language: string;
  channel?: string;
}

export interface ChatResponse {
  answer: string;
  citations: string[];
  sessionId: string;
  caseId: string;
  language: string;
}

export interface StreamEvent {
  type: "start" | "retrieving" | "answer" | "error" | string;
  sessionId?: string;
  caseId?: string;
  passagesFound?: number;
  answer?: string;
  citations?: string[];
  model?: string;
  error?: string;
}

export interface VoiceResponse {
  transcript: string;
  answer: string;
  citations: string[];
  audio: string | null;
  audioFormat: string;
  sessionId: string;
  caseId: string;
  language: string;
}

export interface GrievanceDraftResponse {
  tracking_id: string;
  addressee: string;
  subject: string;
  body: string;
  language: string;
  status: string;
  next_step: string;
}

export interface GrievanceTrackResponse extends GrievanceDraftResponse {
  timeline: { status: string; note: string; updated_at: string }[];
  created_at: string;
}

export interface CaseFact {
  id: string;
  key: string;
  value: string;
  confirmed: boolean;
}

export interface CaseDocument {
  id: string;
  doc_type: string;
  original_filename?: string;
  filename?: string;
  uploaded_at: string;
}

export interface Verdict {
  score: number;
  band: string;
  message: string;
  missing_items?: string[];
}

export interface CaseResponse {
  id: string;
  category: string;
  subcategory?: string | null;
  status: string;
  strength_score: number;
  language: string;
  facts: CaseFact[];
  documents: CaseDocument[];
  verdict: Verdict;
  created_at: string;
  updated_at: string;
}

export interface UploadResponse {
  doc_id: string;
  doc_type: string;
  summary: string;
  extracted_facts: { key: string; value: string }[];
  verdict_update: { score: number; band: string };
}

export interface DocumentDetail {
  doc_id: string;
  doc_type: string;
  ocr_text: string;
  analysis_summary: string;
  language: string;
  uploaded_at: string;
}

export interface EscalationStep {
  step?: number;
  level?: number;
  authority: string;
  deadline?: string;
  action?: string;
  timeline_days?: number;
  status?: string;
  draftTemplate?: string;
}

export interface LawyerResponse {
  advocate_id?: string;
  advocate_name: string;
  specialization?: string;
  languages?: string[];
  callback_window?: string;
  fees?: string;
  tracking_id?: string;
  message?: string;
  requires_confirmation?: boolean;
}

export interface SchemeInfo {
  scheme: string;
  description: string;
  questions: {
    id: string;
    text: string;
    type: "number" | "boolean" | "choice" | "text";
    options?: string[];
  }[];
}

export interface LessonInfo {
  lesson_id: string;
  title: string;
  duration: string;
  language: string;
}

export interface EmiResponse {
  emi: number;
  totalInterest: number;
  totalPayment: number;
}

export interface PmfbyResponse {
  farmerShare: number;
  govtShare: number;
  rate: number;
}

// ---------- endpoints ----------

function chatBody(body: ChatRequest): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body, channel: "web" };
  if (out.sessionId == null) delete out.sessionId;
  if (out.caseId == null) delete out.caseId;
  return out;
}

export function chat(body: ChatRequest): Promise<ChatResponse> {
  return request<ChatResponse>("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify(chatBody(body)),
  });
}

async function streamChatOnce(
  body: ChatRequest,
  onEvent: (evt: StreamEvent) => void,
  external?: AbortSignal
): Promise<void> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onAbort);
  }
  // Guards only the connect phase; a long answer may legitimately take a while.
  const connectTimer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/api/v1/chat/stream`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatBody(body)),
        signal: controller.signal,
      });
      markReachable();
    } catch (err) {
      if (external?.aborted) throw err;
      noteConnectionTrouble();
      throw isAbortError(err)
        ? new ApiError("timeout", 0)
        : new ApiError(err instanceof Error ? err.message : "network-error", 0);
    } finally {
      clearTimeout(connectTimer);
    }

    if (res.status === 429) {
      markRateLimited();
      throw new RateLimitError();
    }
    if (!res.ok || !res.body) {
      throw new ApiError(`HTTP ${res.status}`, res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          onEvent(JSON.parse(payload) as StreamEvent);
        } catch {
          // ignore malformed events
        }
      }
    }
  } finally {
    clearTimeout(connectTimer);
    external?.removeEventListener("abort", onAbort);
  }
}

export async function streamChat(
  body: ChatRequest,
  onEvent: (evt: StreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  let delivered = false;
  const track = (evt: StreamEvent) => {
    delivered = true;
    onEvent(evt);
  };

  for (let attempt = 1; ; attempt++) {
    const startedAt = Date.now();
    try {
      await streamChatOnce(body, track, signal);
      return;
    } catch (err) {
      if (signal?.aborted) throw err;
      const apiErr =
        err instanceof ApiError ? err : new ApiError("network-error", 0);
      // Replaying a stream that already delivered events would duplicate the
      // answer, so only the connect phase is retried.
      if (
        delivered ||
        attempt >= MAX_ATTEMPTS ||
        !isRetryable(apiErr, Date.now() - startedAt)
      ) {
        throw apiErr;
      }
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
}

export function voice(
  audioBase64: string,
  language: string,
  sessionId?: string | null,
  caseId?: string | null
): Promise<VoiceResponse> {
  const body: Record<string, unknown> = { audio: audioBase64, language };
  if (sessionId) body.sessionId = sessionId;
  if (caseId) body.caseId = caseId;
  return request<VoiceResponse>("/api/v1/voice", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function tts(
  text: string,
  language: string,
  timeoutMs: number = TIMEOUT_MS
): Promise<Blob> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/api/v1/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
      signal: controller.signal,
    });
    markReachable();
    if (res.status === 429) {
      markRateLimited();
      throw new RateLimitError();
    }
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
    return await res.blob();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    noteConnectionTrouble();
    throw new ApiError("tts-failed", 0);
  } finally {
    clearTimeout(timer);
  }
}

export function grievanceDraft(
  caseId: string,
  category: string,
  language: string
): Promise<GrievanceDraftResponse> {
  return request<GrievanceDraftResponse>("/api/v1/grievance/draft", {
    method: "POST",
    body: JSON.stringify({ caseId, category, language }),
  });
}

export function trackGrievance(
  trackingId: string
): Promise<GrievanceTrackResponse> {
  return request<GrievanceTrackResponse>(
    `/api/v1/grievance/track/${encodeURIComponent(trackingId)}`
  );
}

export function getCase(caseId: string): Promise<CaseResponse> {
  return request<CaseResponse>(`/api/v1/case/${caseId}`);
}

export function getVerdict(caseId: string): Promise<Verdict> {
  return request<Verdict>(`/api/v1/case/${caseId}/verdict`);
}

export function uploadDocument(
  file: File,
  caseId: string,
  docType: string,
  language: string
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("caseId", caseId);
  form.append("docType", docType);
  form.append("language", language);
  return request<UploadResponse>(
    "/api/v1/document/upload",
    {
      method: "POST",
      body: form,
    },
    UPLOAD_TIMEOUT_MS
  );
}

export function getDocument(docId: string): Promise<DocumentDetail> {
  return request<DocumentDetail>(`/api/v1/document/${docId}`);
}

export function escalationPath(caseId: string): Promise<{ steps: EscalationStep[] }> {
  return request<{ steps: EscalationStep[] }>("/api/v1/escalation/path", {
    method: "POST",
    body: JSON.stringify({ caseId }),
  });
}

export function lawyerConnect(
  caseId: string,
  memberPhone: string,
  confirmCallback: boolean
): Promise<LawyerResponse> {
  return request<LawyerResponse>("/api/v1/lawyer/connect", {
    method: "POST",
    body: JSON.stringify({ caseId, memberPhone, confirmCallback }),
  });
}

export function getSchemes(): Promise<{ schemes: SchemeInfo[] }> {
  return request<{ schemes: SchemeInfo[] }>("/api/v1/scheme");
}

export function schemeEligibility(
  scheme: string,
  answers: Record<string, unknown>
): Promise<{
  eligible: boolean;
  reason?: string;
  docs?: string[];
  reasons?: string[];
  nextSteps?: string[];
}> {
  return request("/api/v1/scheme/eligibility", {
    method: "POST",
    body: JSON.stringify({ scheme, answers }),
  });
}

export function emiCalc(
  principal: number,
  annualRate: number,
  tenureMonths: number
): Promise<EmiResponse> {
  return request<EmiResponse>("/api/v1/financial/emi", {
    method: "POST",
    body: JSON.stringify({ principal, annualRate, tenureMonths }),
  });
}

export function pmfbyPremium(
  crop: string,
  season: string,
  sumInsured: number
): Promise<PmfbyResponse> {
  return request<PmfbyResponse>("/api/v1/pmfby/premium", {
    method: "POST",
    body: JSON.stringify({ crop, season, sumInsured }),
  });
}

export function getLessons(language: string): Promise<{ lessons: LessonInfo[] }> {
  return request<{ lessons: LessonInfo[] }>(
    `/api/v1/financial/lessons/${encodeURIComponent(language)}`
  );
}

export function lessonAudioUrl(lessonId: string, lang: string): string {
  return `${API_BASE}/api/v1/financial/lessons/${encodeURIComponent(
    lessonId
  )}/audio?lang=${encodeURIComponent(lang)}`;
}
