import { SITE_TYPES } from "~/constants/siteType"
import { RIGHTCODE_HOSTNAMES } from "~/services/accountSiteDefinitions/identifiers"

import type { ContentSessionExtractor } from "../contracts"

/**
 * Right Code keeps its account token as plain page state.
 *
 * The console writes the bearer token the API accepts into `localStorage`
 * under `userToken`, and mirrors the signed-in user through its persisted
 * store. Reading them is the only way in: the token is not a JWT, so nothing
 * about it can be derived or refreshed from its contents.
 */
const RIGHTCODE_USER_TOKEN_STORAGE_KEY = "userToken"
const RIGHTCODE_AUTH_STORAGE_KEY = "auth-storage"

const getRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const getString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

const parseStorageObject = (key: string): Record<string, unknown> | null => {
  const raw = localStorage.getItem(key)
  if (!raw) return null

  try {
    return getRecord(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Reads the console's own token without generating or renewing credentials. */
export function readRightCodeBrowserToken(): string | null {
  return (
    getString(localStorage.getItem(RIGHTCODE_USER_TOKEN_STORAGE_KEY)) || null
  )
}

/** Reads the persisted user object, if the console wrote one. */
function readRightCodeBrowserUser(): Record<string, unknown> | null {
  const state = getRecord(parseStorageObject(RIGHTCODE_AUTH_STORAGE_KEY)?.state)
  return getRecord(state?.user)
}

const pickIdentityField = (
  source: Record<string, unknown> | null,
  key: string,
): string | number | undefined => {
  const value = source?.[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  const text = getString(value)
  return text || undefined
}

const isRightCodeOrigin = (url?: string): boolean => {
  if (!url) return false

  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return RIGHTCODE_HOSTNAMES.some(
      (allowedHostname) => allowedHostname === hostname,
    )
  } catch {
    return false
  }
}

export const rightCodeContentSessionExtractor: ContentSessionExtractor = {
  id: "right-code",
  canExtract: (context) =>
    isRightCodeOrigin(context?.url) &&
    (readRightCodeBrowserToken() !== null ||
      localStorage.getItem(RIGHTCODE_AUTH_STORAGE_KEY) !== null),
  async extract() {
    // A page that merely shares the generic `auth-storage` key must not be
    // claimed: without the console's own token there is nothing to hand over.
    const accessToken = readRightCodeBrowserToken()
    if (!accessToken) return null

    const user = readRightCodeBrowserUser()
    const userId =
      pickIdentityField(user, "id") ?? pickIdentityField(user, "userId")
    if (userId === undefined) return null

    const { user_token: _userToken, ...safeUser } = user ?? {}

    return {
      userId,
      user: safeUser,
      accessToken,
      siteTypeHint: SITE_TYPES.RIGHT_CODE,
    }
  },
}
