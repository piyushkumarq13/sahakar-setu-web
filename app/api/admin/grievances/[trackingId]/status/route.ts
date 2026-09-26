import { isAdminStatus, requireAdmin } from "@/lib/admin/auth";
import { addTrackingEntry, getDraft, sortedTimeline } from "@/lib/admin/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ trackingId: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { trackingId } = await ctx.params;
    let body: { status?: unknown; note?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      // validated below
    }

    if (!isAdminStatus(body.status)) {
      return Response.json(
        { error: "invalid status" },
        { status: 400 }
      );
    }
    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim().slice(0, 500)
        : body.status;

    const draft = await getDraft(trackingId);
    if (!draft) {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    await addTrackingEntry(draft.id, body.status, note);

    const refreshed = await getDraft(trackingId);
    return Response.json({
      ok: true,
      status: body.status,
      timeline: sortedTimeline(refreshed?.grievance_tracking),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "update failed" },
      { status: 500 }
    );
  }
}
