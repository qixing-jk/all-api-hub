import { readIdentityStorageString } from "~/services/accountBrowserSession/localIdentityState"

// Wei-Shaw/sub2api/frontend/src/stores/auth.ts: website-owned session storage.
export const SUB2API_AUTH_STORAGE_KEYS = {
  accessToken: "auth_token",
  refreshToken: "refresh_token",
  tokenExpiresAt: "token_expires_at",
  authUser: "auth_user",
  pendingAuthSession: "pending_auth_session",
} as const

/** Reads the website session without rotating tokens or invoking onboarding. */
export function readSub2ApiBrowserToken() {
  const storedExpiry = readIdentityStorageString(
    SUB2API_AUTH_STORAGE_KEYS.tokenExpiresAt,
  )
  const expiresAt = storedExpiry ? Number.parseInt(storedExpiry, 10) : NaN
  return {
    token: readIdentityStorageString(SUB2API_AUTH_STORAGE_KEYS.accessToken),
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : undefined,
  }
}

/** Clears the website's local session after its logout endpoint has completed. */
export function clearSub2ApiBrowserSession() {
  for (const key of Object.values(SUB2API_AUTH_STORAGE_KEYS)) {
    localStorage.removeItem(key)
  }
}
