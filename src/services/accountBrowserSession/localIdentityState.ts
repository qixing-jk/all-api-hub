import { parseCookieHeader } from "~/utils/browser/cookieString"
import { isRecord } from "~/utils/core/object"

/** Reads page-local session evidence without recovering or changing login state. */
export function readIdentityStorageString(key: string): string | null {
  try {
    return localStorage.getItem(key)?.trim() || null
  } catch {
    return null
  }
}

/** Reads a provider-owned object; cached user data alone is not verified identity. */
export function readIdentityStorageRecord(key: string) {
  try {
    const value: unknown = JSON.parse(readIdentityStorageString(key) ?? "null")
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

/** Kept only in the current document's memory to invalidate cached Cookie checks. */
export function readIdentityCookieState(): string {
  try {
    return document.cookie
  } catch {
    return ""
  }
}

/** Reads a page-visible Cookie; HttpOnly sessions remain opaque to this capability. */
export function readIdentityCookie(name: string): string | null {
  try {
    const token = parseCookieHeader(readIdentityCookieState()).get(name)
    return token ? decodeURIComponent(token).trim() || null : null
  } catch {
    return null
  }
}

/** JWT expiry is a local reason to skip a request, never proof of authentication. */
export function readIdentityJwtExpiry(token: string): number | undefined {
  try {
    const payload = token.split(".")[1]
    if (!payload) return undefined
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const parsed: unknown = JSON.parse(
      atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    )
    const expiry = isRecord(parsed) ? parsed.exp : undefined
    return typeof expiry === "number" && Number.isFinite(expiry)
      ? expiry * 1000
      : undefined
  } catch {
    return undefined
  }
}
