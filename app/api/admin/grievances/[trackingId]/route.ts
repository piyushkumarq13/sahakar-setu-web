import { requireAdmin } from "@/lib/admin/auth";
import {
  getCaseWithFacts,
  getDraft,
  latestStatus,
  sortedTimeline,
} from "@/lib/admin/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ trackingId: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const { trackingId } = await ctx.params;
    const draft = await getDraft(trackingId);
    if (!draft) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    const caseRow = draft.case_id ? await getCaseWithFacts(draft.case_id) : null;

    return Response.json({
      tracking_id: draft.tracking_id,
      case_id: draft.case_id,
      subject: draft.subject,
      addressee: draft.addressee,
      body: draft.body,
      language: draft.language,
      status: latestStatus(draft.grievance_tracking),
      created_at: draft.created_at,
      timeline: sortedTimeline(draft.grievance_tracking),
      case: caseRow,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "detail failed" },
      { status: 500 }
    );
  }
}
