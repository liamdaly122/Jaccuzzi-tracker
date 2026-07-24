// =============================================================================
//  middleware.ts
//  The single passcode gate for the whole app. Runs on Vercel's Edge runtime
//  in front of every request that matches the config below. Protecting both
//  pages AND mutating API routes here means no per-route auth checks elsewhere.
//
//  Routes that must stay reachable WITHOUT a session cookie are allow-listed:
//    /login, /api/login        — the login flow itself
//    /api/cron/*               — protected separately by a bearer token
//    /api/calendar.ics         — protected separately by a URL token
//  (Static assets and icons are excluded by the matcher at the bottom.)
// =============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/auth";

const PUBLIC_PATHS = ["/login", "/api/login"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/api/cron")) return true;
  if (pathname === "/api/calendar.ics") return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = await verifySessionToken(token);

  if (valid) {
    return NextResponse.next();
  }

  // API calls get a clean 401; page navigations get redirected to /login.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("redirect", pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything EXCEPT Next internals and static asset files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.png|apple-icon.png|icon.svg|robots.txt).*)",
  ],
};
