import { type NextRequest, NextResponse } from "next/server";
import { authMisconfigured, isValidSession, OPEN_ACCESS, SESSION_COOKIE } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // The gate is switched off for now (see OPEN_ACCESS); the login page just sends people in.
  if (OPEN_ACCESS) return pathname === "/login" ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();

  if (authMisconfigured()) {
    const msg = "Set the APP_PASSWORD environment variable in Vercel and redeploy.";
    return isApi
      ? NextResponse.json({ error: msg }, { status: 503 })
      : new NextResponse(
          `<!doctype html><meta charset="utf-8"><title>Neuroneus</title><body style="font-family:system-ui;background:#f5f5f5;color:#0c0a09;display:grid;place-items:center;height:100vh;margin:0"><p>${msg}</p></body>`,
          { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
        );
  }

  if (pathname === "/login" || pathname === "/api/auth") return NextResponse.next();
  // Server-to-server build steps carry their own secret; the route verifies it.
  if (pathname.startsWith("/api/internal/")) return NextResponse.next();
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
