// Admin session gate — passcode login stored as an httpOnly cookie.
// Server-only: used by route handlers and the admin server layout.

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "ss_admin";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function passcode(): string | null {
  const value = process.env.ADMIN_PASSCODE?.trim();
  return value ? value : null;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function cookieValueFor(pass: string): string {
  return sha256(`sahakar-setu-admin::${pass}`).toString("hex");
}

export function verifyPasscode(input: string): boolean {
  const pass = passcode();
  if (!pass) return false;
  const a = sha256(input);
  const b = sha256(pass);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdminSession(): Promise<boolean> {
  const pass = passcode();
  if (!pass) return false;
  const store = await cookies();
  const value = store.get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  const expected = cookieValueFor(pass);
  const a = Buffer.from(value, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Returns a 401 Response when not logged in, or null when authorized. */
export async function requireAdmin(): Promise<Response | null> {
  if (await isAdminSession()) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function adminCookieHeader(pass: string): string {
  return `${ADMIN_COOKIE}=${cookieValueFor(pass)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

export function clearCookieHeader(): string {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Statuses an admin may set on a grievance (timeline is append-only). */
export const ADMIN_STATUSES = [
  "submitted",
  "acknowledged",
  "escalated",
  "resolved",
  "rejected",
] as const;

export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export function isAdminStatus(value: unknown): value is AdminStatus {
  return (
    typeof value === "string" && (ADMIN_STATUSES as readonly string[]).includes(value)
  );
}

/** Grievances not yet closed are the admin's pending queue. */
export function isPendingStatus(status: string): boolean {
  return status !== "resolved" && status !== "rejected";
}
