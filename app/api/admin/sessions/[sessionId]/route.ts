import { requireAdmin } from "@/lib/admin/auth";
import { getSession, getSessionMessages } from "@/lib/admin/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { sessionId } = await ctx.params;
    const session = await getSession(sessionId);
    if (!session) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    const messages = await getSessionMessages(sessionId);
    return Response.json({
      session: {
        id: session.id,
        channel: session.channel,
        language: session.language,
        started_at: session.started_at,
        ended_at: session.ended_at,
      },
      messages,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "messages failed" },
      { status: 500 }
    );
  }
}
