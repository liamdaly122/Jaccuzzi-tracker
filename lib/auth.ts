// =============================================================================
//  lib/auth.ts
//  Passcode session helpers built on `jose` (Edge-runtime compatible).
//
//  The session is a signed JWT stored in an httpOnly cookie. We sign it with a
//  key DERIVED from APP_PASSCODE, so there is no separate secret to manage: if
//  you change the passcode, old sessions stop verifying — which is what you
//  want anyway.
// =============================================================================

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey(): Uint8Array {
  const passcode = process.env.APP_PASSCODE;
  if (!passcode) {
    throw new Error(
      "APP_PASSCODE is not set. Add it in your Vercel Environment Variables (see README.md).",
    );
  }
  return new TextEncoder().encode(passcode);
}

// Create a signed session token (called after a correct passcode is entered).
export async function createSessionToken(): Promise<string> {
  return new SignJWT({ ok: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

// Verify a session token. Returns true only for a valid, unexpired token.
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, getSecretKey());
    return true;
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

// Constant-time passcode comparison to avoid leaking length/timing.
export function passcodeMatches(submitted: string): boolean {
  const expected = process.env.APP_PASSCODE ?? "";
  if (expected.length === 0) return false;
  // Length-independent comparison: hash-like accumulation over the longer of
  // the two so timing does not reveal the expected length.
  const a = new TextEncoder().encode(submitted);
  const b = new TextEncoder().encode(expected);
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
