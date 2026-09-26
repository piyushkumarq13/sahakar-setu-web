// Server-side Supabase (PostgREST) access for the admin section.
//
// IMPORTANT: this module is imported ONLY by app/api/admin/* route handlers
// and the admin server layout — never by client components — so the service
// key never reaches the browser bundle. It talks straight to Supabase (the
// same database the backend server uses); no backend code is involved.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export interface TrackingRow {
  id: string;
  draft_id: string;
  status: string;
  note: string | null;
  updated_at: string;
}

export interface DraftRow {
  id: string;
  case_id: string | null;
  tracking_id: string;
  addressee: string;
  subject: string;
  body: string;
  language: string;
  delivery_channel: string | null;
  delivered_at: string | null;
  created_at: string;
  grievance_tracking?: TrackingRow[];
}

export interface FactRow {
  fact_key: string;
  fact_value: string;
  confirmed: boolean;
}

export interface CaseRow {
  id: string;
  category: string;
  subcategory: string | null;
  status: string;
  strength_score: number;
  language: string;
  created_at: string;
  facts?: FactRow[];
}

export interface SessionRow {
  id: string;
  channel: string;
  language: string;
  started_at: string;
  last_active_at: string | null;
  ended_at: string | null;
  messages?: { id: string }[];
}

export interface MessageRow {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

function baseHeaders(): Record<string, string> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      "Admin DB not configured: set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env"
    );
  }
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

async function rest<T>(pathAndQuery: string, init?: RequestInit): Promise<T> {
  const url = `${SUPABASE_URL}/rest/v1/${pathAndQuery}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...baseHeaders(), ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status} on ${pathAndQuery}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function countOf(table: string, filter = ""): Promise<number> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*${filter}`;
  const res = await fetch(url, {
    method: "HEAD",
    // Without count=exact Supabase answers "0-15/*" (total unknown).
    headers: { ...baseHeaders(), Prefer: "count=exact" },
    cache: "no-store",
  });
  if (!res.ok) return 0;
  const range = res.headers.get("content-range"); // e.g. "0-15/16"
  const total = range && range.includes("/") ? range.split("/")[1] : "";
  const n = total && total !== "*" ? parseInt(total, 10) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function byUpdatedDesc(a: TrackingRow, b: TrackingRow): number {
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

/** Latest status of a grievance (timeline is append-only, newest wins). */
export function latestStatus(tracking?: TrackingRow[] | null): string {
  if (!tracking || tracking.length === 0) return "drafted";
  return [...tracking].sort(byUpdatedDesc)[0].status;
}

/** Most recent update timestamp for a draft. */
export function lastUpdated(draft: DraftRow): string {
  const t = draft.grievance_tracking;
  if (!t || t.length === 0) return draft.created_at;
  return [...t].sort(byUpdatedDesc)[0].updated_at;
}

export function sortedTimeline(tracking?: TrackingRow[] | null): TrackingRow[] {
  return tracking ? [...tracking].sort(byUpdatedDesc) : [];
}

export async function listDrafts(): Promise<DraftRow[]> {
  return rest<DraftRow[]>(
    "grievance_drafts?select=*,grievance_tracking(id,draft_id,status,note,updated_at)&order=created_at.desc&limit=10000"
  );
}

export async function getDraft(trackingId: string): Promise<DraftRow | null> {
  const rows = await rest<DraftRow[]>(
    `grievance_drafts?select=*,grievance_tracking(id,draft_id,status,note,updated_at)&tracking_id=eq.${encodeURIComponent(trackingId)}&limit=1`
  );
  return rows[0] || null;
}

export async function getCaseWithFacts(caseId: string): Promise<CaseRow | null> {
  const rows = await rest<CaseRow[]>(
    `cases?select=id,category,subcategory,status,strength_score,language,created_at,facts(fact_key,fact_value,confirmed)&id=eq.${encodeURIComponent(caseId)}&limit=1`
  );
  return rows[0] || null;
}

export async function addTrackingEntry(
  draftId: string,
  status: string,
  note: string
): Promise<TrackingRow> {
  const rows = await rest<TrackingRow[]>("grievance_tracking", {
    method: "POST",
    body: JSON.stringify({ draft_id: draftId, status, note }),
    headers: { Prefer: "return=representation" },
  });
  if (!rows || !rows[0]) throw new Error("Failed to insert tracking entry");
  return rows[0];
}

export async function listSessions(): Promise<SessionRow[]> {
  return rest<SessionRow[]>(
    "sessions?select=id,channel,language,started_at,last_active_at,ended_at,messages(id)&order=started_at.desc&limit=5000"
  );
}

export async function getSession(sessionId: string): Promise<SessionRow | null> {
  const rows = await rest<SessionRow[]>(
    `sessions?select=id,channel,language,started_at,last_active_at,ended_at&id=eq.${encodeURIComponent(sessionId)}&limit=1`
  );
  return rows[0] || null;
}

export async function getSessionMessages(sessionId: string): Promise<MessageRow[]> {
  return rest<MessageRow[]>(
    `messages?select=id,role,content,created_at&session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.asc&limit=10000`
  );
}

export async function listCases(): Promise<CaseRow[]> {
  return rest<CaseRow[]>(
    "cases?select=id,category,status,strength_score,language,created_at&order=created_at.desc&limit=10000"
  );
}

export async function messagesSince(iso: string): Promise<{ created_at: string }[]> {
  return rest<{ created_at: string }[]>(
    `messages?select=created_at&created_at=gte.${encodeURIComponent(iso)}&order=created_at.asc&limit=10000`
  );
}

export async function countTable(
  table: "sessions" | "messages" | "cases" | "grievance_drafts" | "grievance_tracking" | "facts" | "documents"
): Promise<number> {
  return countOf(table);
}
