// Pure types shared between admin route handlers and admin pages.
// No imports — safe for both server and client bundles.

export interface Bucket {
  label: string;
  count: number;
}

export interface ReportListItem {
  tracking_id: string;
  case_id: string | null;
  subject: string;
  addressee: string;
  language: string;
  status: string;
  created_at: string;
  updated_at: string;
  updates: number;
}

export interface ReportListResponse {
  total: number;
  items: ReportListItem[];
}

export interface TimelineEntry {
  id?: string;
  status: string;
  note: string | null;
  updated_at: string;
}

export interface FactInfo {
  fact_key: string;
  fact_value: string;
  confirmed: boolean;
}

export interface CaseInfo {
  id: string;
  category: string;
  subcategory: string | null;
  status: string;
  strength_score: number;
  language: string;
  created_at: string;
  facts?: FactInfo[];
}

export interface ReportDetail {
  tracking_id: string;
  case_id: string | null;
  subject: string;
  addressee: string;
  body: string;
  language: string;
  status: string;
  created_at: string;
  timeline: TimelineEntry[];
  case: CaseInfo | null;
}

export interface StatusUpdateResponse {
  ok: boolean;
  status: string;
  timeline: TimelineEntry[];
}

export interface StatsPayload {
  kpis: {
    grievances: number;
    pending: number;
    resolved: number;
    rejected: number;
    sessions: number;
    messages: number;
    cases: number;
    avgStrength: number;
  };
  grievanceStatus: Bucket[];
  grievanceByMonth: { ym: string; count: number }[];
  recentReports: {
    tracking_id: string;
    subject: string;
    status: string;
    created_at: string;
  }[];
  channels: Bucket[];
  languages: Bucket[];
  messagesByDay: { day: string; count: number }[];
  casesByCategory: Bucket[];
  lastRefresh: string;
}

export interface SessionListItem {
  id: string;
  channel: string;
  language: string;
  started_at: string;
  ended_at: string | null;
  messageCount: number;
}

export interface SessionListResponse {
  total: number;
  items: SessionListItem[];
}

export interface SessionDetailResponse {
  session: {
    id: string;
    channel: string;
    language: string;
    started_at: string;
    ended_at: string | null;
  };
  messages: {
    id: string;
    role: string;
    content: string;
    created_at: string;
  }[];
}
