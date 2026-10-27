import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

export async function POST(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  const body = (await request.json().catch(() => ({}))) as { password?: string };
  if (!password) return NextResponse.json({ ok: true });

  if (typeof body.password !== "string" || body.password !== password) {
    // Slow down guessing a little.
    await new Promise((r) => setTimeout(r, 600));
    const { t } = await getT();
    return NextResponse.json({ error: t.errors.wrongPassword }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
