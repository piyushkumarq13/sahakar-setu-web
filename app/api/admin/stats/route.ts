import { requireAdmin } from "@/lib/admin/auth";
import {
  countTable,
  latestStatus,
  listCases,
  listDrafts,
  listSessions,
  messagesSince,
  type DraftRow,
} from "@/lib/admin/db";

export const dynamic = "force-dynamic";

interface Bucket {
  label: string;
  count: number;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const since14d = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

    const [drafts, sessions, cases, totalMessages, recentMessages] =
      await Promise.all([
        listDrafts(),
        listSessions(),
        listCases(),
        countTable("messages"),
        messagesSince(since14d),
      ]);

    // --- grievance aggregates ---
    const statusCount: Record<string, number> = {};
    let pending = 0;
    let resolved = 0;
    let rejected = 0;
    for (const d of drafts) {
      const s = latestStatus(d.grievance_tracking);
      statusCount[s] = (statusCount[s] || 0) + 1;
      if (s === "resolved") resolved++;
      else if (s === "rejected") rejected++;
      else pending++;
    }
    const grievanceStatus: Bucket[] = Object.entries(statusCount)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    const byMonth: Record<string, number> = {};
    for (const d of drafts) {
      const ym = d.created_at.slice(0, 7);
      byMonth[ym] = (byMonth[ym] || 0) + 1;
    }
    const grievanceByMonth = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, count]) => ({ ym, count }));

    const recentReports = drafts.slice(0, 8).map((d: DraftRow) => ({
      tracking_id: d.tracking_id,
      subject: d.subject,
      status: latestStatus(d.grievance_tracking),
      created_at: d.created_at,
    }));

    // --- sessions aggregates ---
    const channels: Record<string, number> = {};
    const languages: Record<string, number> = {};
    for (const s of sessions) {
      const ch = s.channel || "unknown";
      channels[ch] = (channels[ch] || 0) + 1;
      const lg = s.language || "unknown";
      languages[lg] = (languages[lg] || 0) + 1;
    }
    const toBuckets = (m: Record<string, number>): Bucket[] =>
      Object.entries(m)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

    // --- messages per day, last 14 days (always emit every day) ---
    const dayCount: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      dayCount[d.toISOString().slice(0, 10)] = 0;
    }
    for (const m of recentMessages) {
      const day = m.created_at.slice(0, 10);
      dayCount[day] = (dayCount[day] || 0) + 1;
    }
    const messagesByDay = Object.entries(dayCount).map(([day, count]) => ({
      day,
      count,
    }));

    // --- cases aggregates ---
    const categories: Record<string, number> = {};
    let strengthSum = 0;
    for (const c of cases) {
      const cat = c.category || "unknown";
      categories[cat] = (categories[cat] || 0) + 1;
      strengthSum += c.strength_score || 0;
    }
    const casesByCategory = Object.entries(categories)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    return Response.json({
      kpis: {
        grievances: drafts.length,
        pending,
        resolved,
        rejected,
        sessions: sessions.length,
        messages: totalMessages,
        cases: cases.length,
        avgStrength: cases.length
          ? Math.round(strengthSum / cases.length)
          : 0,
      },
      grievanceStatus,
      grievanceByMonth,
      recentReports,
      channels: toBuckets(channels),
      languages: toBuckets(languages),
      messagesByDay,
      casesByCategory,
      timelineCount: drafts.reduce(
        (n, d) => n + (d.grievance_tracking?.length || 0),
        0
      ),
      lastRefresh: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "stats failed" },
      { status: 500 }
    );
  }
}
