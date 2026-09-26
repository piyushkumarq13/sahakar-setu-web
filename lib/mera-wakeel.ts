// Server-side config + token signing for the Mera Wakeel AI handoff.
//
// IMPORTANT: this module is imported ONLY by app/api/mera-wakeel/* route
// handlers — never by client components — so HANDOFF_SECRET and the Mera
// Wakeel origin never reach the browser bundle.

import { createHmac } from "node:crypto";

export const HANDOFF_SOURCE = "sahakar-setu";
export const HANDOFF_INTENT = "lawyer-handoff";
/** Short-lived, one-time redirect handoff: 10 minutes. */
export const HANDOFF_TTL_SECONDS = 600;

export type MissingHandoffConfig = "secret" | "url" | null;

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/**
 * Names the missing handoff env var ("secret" | "url") or null when both
 * HANDOFF_SECRET and MERA_WAKEEL_URL are configured. Route handlers turn
 * this into a clean failure instead of signing with an empty secret or
 * redirecting to a broken URL.
 */
export function missingHandoffConfig(): MissingHandoffConfig {
  if (!readEnv("HANDOFF_SECRET")) return "secret";
  if (!readEnv("MERA_WAKEEL_URL")) return "url";
  return null;
}

export function meraWakeelUrl(): string {
  const url = readEnv("MERA_WAKEEL_URL");
  if (!url) throw new Error("MERA_WAKEEL_URL is not configured");
  return url.replace(/\/+$/, "");
}

export interface HandoffTokenInput {
  caseId: string;
  lawyerId?: string | null;
}

/**
 * Signs a one-time handoff token: base64url(payload).hmac-sha256-hex.
 *
 * The payload carries the user's existing case (so Mera Wakeel can pull it
 * over server-to-server via this app's public /api/v1/case/:caseId endpoint
 * — the user never repeats themselves after login), an optional lawyerId when
 * a specific card was clicked, fixed source/intent markers, and a 10-minute
 * expiry. Verified by Mera Wakeel with the identical HANDOFF_SECRET — the
 * only shared trust between the two apps.
 */
export function signHandoffToken(input: HandoffTokenInput): string {
  const secret = readEnv("HANDOFF_SECRET");
  if (!secret) throw new Error("HANDOFF_SECRET is not configured");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    caseId: input.caseId,
    lawyerId: input.lawyerId || null,
    source: HANDOFF_SOURCE,
    intent: HANDOFF_INTENT,
    iat: now,
    exp: now + HANDOFF_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("hex");
  return `${encoded}.${signature}`;
}

/** Mera Wakeel's real auth route is /login; it routes internally after auth. */
export function handoffLoginUrl(token: string): string {
  return `${meraWakeelUrl()}/login?handoff=${encodeURIComponent(token)}`;
}
