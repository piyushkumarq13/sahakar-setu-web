import { requireAdmin } from "@/lib/admin/auth";
import { latestStatus, lastUpdated, listDrafts } from "@/lib/admin/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const statusFilter = (url.searchParams.get("status") || "").trim();
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    const drafts = await listDrafts();
    const items = drafts.map((d) => ({
      tracking_id: d.tracking_id,
      case_id: d.case_id,
      subject: d.subject,
      addressee: d.addressee,
      language: d.language,
      status: latestStatus(d.grievance_tracking),
      created_at: d.created_at,
      updated_at: lastUpdated(d),
      updates: d.grievance_tracking?.length || 0,
    }));

    const filtered = items.filter((it) => {
      if (statusFilter && it.status !== statusFilter) return false;
      if (
        q &&
        !(
          it.tracking_id.toLowerCase().includes(q) ||
          it.subject.toLowerCase().includes(q) ||
          it.addressee.toLowerCase().includes(q)
        )
      ) {
        return false;
      }
      return true;
    });

    return Response.json({
      total: items.length,
      items: filtered,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "list failed" },
      { status: 500 }
    );
  }
}
