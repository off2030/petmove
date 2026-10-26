import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export const ADMIN_COOKIE = "pm_www_admin";
export const SESSION_SECONDS = 8 * 3600;
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function equal(a: string, b: string): boolean {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function verifySecret(
  value: string | null,
  expectedHash: string | undefined,
): boolean {
  return (
    !!value &&
    value.length <= 300 &&
    !!expectedHash &&
    /^[a-f0-9]{64}$/.test(expectedHash) &&
    equal(sha256(value), expectedHash)
  );
}
function signature(
  payload: string,
  secret: string,
  accessHash: string,
): string {
  return createHmac("sha256", secret)
    .update(`${accessHash}:${payload}`)
    .digest("base64url");
}
export function createAdminSession(
  secret: string,
  accessHash: string,
  now = Date.now(),
): string {
  if (secret.length < 32)
    throw new Error("관리자 세션 키가 설정되지 않았습니다.");
  const payload = `v1.${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${signature(payload, secret, accessHash)}`;
}
export function verifyAdminSession(
  token: string | undefined,
  secret: string | undefined,
  accessHash: string | undefined,
  now = Date.now(),
): boolean {
  if (
    !token ||
    token.length > 300 ||
    !secret ||
    secret.length < 32 ||
    !accessHash
  )
    return false;
  const parts = token.split(".");
  if (
    parts.length !== 4 ||
    parts[0] !== "v1" ||
    !/^\d+$/.test(parts[1]) ||
    !/^[\w-]{22}$/.test(parts[2])
  )
    return false;
  const expires = Number(parts[1]),
    current = Math.floor(now / 1000);
  if (expires <= current || expires > current + SESSION_SECONDS) return false;
  return equal(
    signature(parts.slice(0, 3).join("."), secret, accessHash),
    parts[3],
  );
}
export function isSameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}
