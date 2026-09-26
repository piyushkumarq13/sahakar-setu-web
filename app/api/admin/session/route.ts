import { NextResponse } from "next/server";
import {
  adminCookieHeader,
  clearCookieHeader,
  requireAdmin,
  verifyPasscode,
} from "@/lib/admin/auth";

export async function POST(req: Request) {
  let pass = "";
  try {
    const body = await req.json();
    pass = typeof body?.passcode === "string" ? body.passcode : "";
  } catch {
    // fall through — empty passcode fails verification below
  }
  if (!pass || !verifyPasscode(pass)) {
    return NextResponse.json({ error: "invalid passcode" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", adminCookieHeader(pass));
  return res;
}

export async function DELETE() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", clearCookieHeader());
  return res;
}
