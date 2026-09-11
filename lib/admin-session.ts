import { env } from "cloudflare:workers";

const COOKIE_NAME = "queueup_admin";
const SESSION_SECONDS = 60 * 60 * 8;
const encoder = new TextEncoder();

function config() {
  const username = env.ADMIN_USERNAME?.trim();
  const password = env.ADMIN_PASSWORD;
  const secret = env.ADMIN_SESSION_SECRET;
  if (!username || !password || !secret || secret.length < 24) {
    throw new Error("Admin login is not configured.");
  }
  return { username, password, secret };
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function signature(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function credentialsAreValid(username: string, password: string) {
  const expected = config();
  const [providedHash, expectedHash] = await Promise.all([
    digest(`${username}\u0000${password}`),
    digest(`${expected.username}\u0000${expected.password}`),
  ]);
  return equalBytes(providedHash, expectedHash);
}

export async function createAdminCookie(username: string, request: Request) {
  const { secret } = config();
  const payload = toBase64Url(
    encoder.encode(JSON.stringify({ username, expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS })),
  );
  const signed = toBase64Url(await signature(payload, secret));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${payload}.${signed}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export function clearAdminCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=0`;
}

export async function getAdminUsername(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const raw = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!raw) return null;
  const separator = raw.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = raw.slice(0, separator);
  const providedSignature = raw.slice(separator + 1);
  try {
    const { username: configuredUsername, secret } = config();
    const expectedSignature = await signature(payload, secret);
    if (!equalBytes(fromBase64Url(providedSignature), expectedSignature)) return null;
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
      username?: string;
      expiresAt?: number;
    };
    if (
      parsed.username !== configuredUsername ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;
    return configuredUsername;
  } catch {
    return null;
  }
}
