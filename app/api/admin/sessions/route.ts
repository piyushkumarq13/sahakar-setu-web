import { requireAdmin } from "@/lib/admin/auth";
import { listSessions } from "@/lib/admin/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const sessions = await listSessions();
    const items = sessions.map((s) => ({
      id: s.id,
      channel: s.channel,
      language: s.language,
      started_at: s.started_at,
      ended_at: s.ended_at,
      messageCount: s.messages?.length || 0,
    }));
    return Response.json({ total: items.length, items });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "sessions failed" },
      { status: 500 }
    );
  }
}
