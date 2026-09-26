// Server-side proxy to Mera Wakeel's lawyer directory
// (GET {MERA_WAKEEL_URL}/api/db/lawyers). Proxying through this app keeps
// Mera Wakeel from having to allow-list our origin in their CORS config.

import { meraWakeelUrl } from "@/lib/mera-wakeel";

export const dynamic = "force-dynamic";

export async function GET() {
  let baseUrl: string;
  try {
    baseUrl = meraWakeelUrl();
  } catch {
    return Response.json(
      { success: false, lawyers: [], error: "MERA_WAKEEL_URL is not configured" },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(`${baseUrl}/api/db/lawyers`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const body: unknown = await res.json().catch(() => null);
    const ok =
      res.ok &&
      body !== null &&
      typeof body === "object" &&
      (body as { success?: unknown }).success === true;
    if (!ok) {
      return Response.json(
        { success: false, lawyers: [], error: `HTTP ${res.status}` },
        { status: 502 }
      );
    }
    const lawyers = (body as { lawyers?: unknown }).lawyers;
    return Response.json({
      success: true,
      lawyers: Array.isArray(lawyers) ? lawyers : [],
    });
  } catch {
    return Response.json(
      { success: false, lawyers: [], error: "Mera Wakeel unreachable" },
      { status: 502 }
    );
  }
}
