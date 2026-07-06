import { SITE_TYPES } from "~/constants/siteType"

import type { ContentSessionExtractor } from "../contracts"

const VOAPI_V2_USER_STORE_STORAGE_KEY = "userStore"
const COMPATIBLE_USER_STORAGE_KEY = "user"

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

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const payload = token.split(".")[1]
  if (!payload) return null

  try {
    const paddedPayload = payload.padEnd(
      payload.length + ((4 - (payload.length % 4)) % 4),
      "=",
    )
    const json = globalThis.atob(
      paddedPayload.replace(/-/g, "+").replace(/_/g, "/"),
    )
    return getRecord(JSON.parse(json))
  } catch {
    return null
  }
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

export const voApiV2ContentSessionExtractor: ContentSessionExtractor = {
  id: "voapi-v2",
  canExtract: () =>
    localStorage.getItem(VOAPI_V2_USER_STORE_STORAGE_KEY) !== null,
  async extract() {
    const userStore = parseStorageObject(VOAPI_V2_USER_STORE_STORAGE_KEY)
    const auth = getRecord(userStore?.auth)
    const accessToken = getString(auth?.token)
    if (!accessToken) return null

    const user = parseStorageObject(COMPATIBLE_USER_STORAGE_KEY)
    const jwtPayload = decodeJwtPayload(accessToken)
    const userId =
      pickIdentityField(user, "id") ?? pickIdentityField(jwtPayload, "userId")
    if (userId === undefined) return null

    const safeUser = {
      ...(user ?? {}),
      access_token: undefined,
    }
    delete safeUser.access_token

    return {
      userId,
      user: safeUser,
      accessToken,
      siteTypeHint: SITE_TYPES.VO_API_V2,
    }
  },
}
