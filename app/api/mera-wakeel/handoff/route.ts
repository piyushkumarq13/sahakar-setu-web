// Signs a one-time handoff token and returns the full-page redirect URL:
// {MERA_WAKEEL_URL}/login?handoff=<token>. The secret stays server-side;
// the browser only ever receives the signed token for its own redirect.

import {
  handoffLoginUrl,
  missingHandoffConfig,
  signHandoffToken,
} from "@/lib/mera-wakeel";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let caseId = "";
  let lawyerId = "";
  try {
    const body: unknown = await request.json();
    if (body !== null && typeof body === "object") {
      const { caseId: cid, lawyerId: lid } = body as {
        caseId?: unknown;
        lawyerId?: unknown;
      };
      if (typeof cid === "string" && cid.trim()) caseId = cid.trim();
      if (typeof lid === "string" && lid.trim()) lawyerId = lid.trim();
    }
  } catch {
    // non-JSON body falls through to the caseId check below
  }

  if (!caseId) {
    return Response.json({ error: "caseId is required" }, { status: 400 });
  }

  // Missing env config fails cleanly (translated toast on the client) rather
  // than crashing or redirecting to a broken URL.
  if (missingHandoffConfig()) {
    return Response.json(
      { error: "handoff not configured", config: true },
      { status: 503 }
    );
  }

  try {
    const url = handoffLoginUrl(signHandoffToken({ caseId, lawyerId }));
    return Response.json({ url });
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : "handoff failed",
        config: false,
      },
      { status: 503 }
    );
  }
}
