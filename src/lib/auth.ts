// Single-owner password gate. The app calls paid models and writes to your GitHub org,
// so a deployment must never be reachable without APP_PASSWORD.

export const SESSION_COOKIE = "nn_session";

export function authRequired() {
  return Boolean(process.env.APP_PASSWORD);
}

/** Production deployments refuse to serve anything until APP_PASSWORD is set. */
export function authMisconfigured() {
  return !process.env.APP_PASSWORD && process.env.NODE_ENV === "production";
}

export async function sessionToken(password: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("neuroneus-session-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isValidSession(cookie: string | undefined) {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;
  if (!cookie) return false;
  const expected = await sessionToken(password);
  if (cookie.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= cookie.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
