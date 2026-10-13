import { SITE_TYPES } from "~/constants/siteType"
import { VOAPI_V2_ENDPOINTS } from "~/services/apiService/voapiV2/type"
import { isRecord } from "~/utils/core/object"

import {
  ContentSessionProtocolError,
  type ContentSessionExtractionContext,
  type ContentSessionExtractor,
} from "../contracts"
import { runContentSessionRequest } from "./network"

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

/** Reads the dashboard's own token, without generating or renewing credentials. */
export function readVoApiV2BrowserToken() {
  const auth = getRecord(
    parseStorageObject(VOAPI_V2_USER_STORE_STORAGE_KEY)?.auth,
  )
  return getString(auth?.token) || null
}

const readVoApiV2StoredIdentity = (token: string) => {
  const user = parseStorageObject(COMPATIBLE_USER_STORAGE_KEY)
  const jwtPayload = decodeJwtPayload(token)
  const storedId = pickIdentityField(user, "id")
  const jwtId = pickIdentityField(jwtPayload, "userId")
  if (
    storedId !== undefined &&
    jwtId !== undefined &&
    String(storedId) !== String(jwtId)
  ) {
    return null
  }
  return { userId: storedId ?? jwtId, user, jwtPayload }
}

const identityMatches = (actual: unknown, expected: string | number) =>
  (typeof actual === "string" || typeof actual === "number") &&
  String(actual).trim() === String(expected)

export const voApiV2ContentSessionExtractor: ContentSessionExtractor = {
  id: "voapi-v2",
  canExtract: (context) =>
    context.siteTypeHint === SITE_TYPES.VO_API_V2 &&
    localStorage.getItem(VOAPI_V2_USER_STORE_STORAGE_KEY) !== null,
  async probe(context: ContentSessionExtractionContext) {
    const origin = location.origin
    if (typeof context.url === "string") {
      try {
        if (new URL(context.url).origin !== origin) return null
      } catch {
        return null
      }
    }
    const userStoreRaw = localStorage.getItem(VOAPI_V2_USER_STORE_STORAGE_KEY)
    const accessToken = readVoApiV2BrowserToken()
    if (!userStoreRaw || !accessToken) return null
    const identity = readVoApiV2StoredIdentity(accessToken)
    if (!identity || identity.userId === undefined) return null

    let responseBody: unknown
    try {
      responseBody = await runContentSessionRequest(async (signal) => {
        const response = await fetch(
          new URL(VOAPI_V2_ENDPOINTS.UserInfo, origin),
          {
            method: "GET",
            cache: "no-store",
            credentials: "omit",
            redirect: "error",
            headers: { Authorization: accessToken },
            signal,
          },
        )
        if (response.status >= 500 || response.status === 429) {
          throw new Error("VoAPI session probe unavailable")
        }
        if (!response.ok) return null
        return await response.json()
      })
    } catch {
      throw new Error("VoAPI session probe request failed")
    }
    if (
      !isRecord(responseBody) ||
      responseBody.code !== 0 ||
      !isRecord(responseBody.data) ||
      !identityMatches(responseBody.data.id, identity.userId)
    ) {
      return null
    }
    if (
      location.origin !== origin ||
      localStorage.getItem(VOAPI_V2_USER_STORE_STORAGE_KEY) !== userStoreRaw ||
      readVoApiV2BrowserToken() !== accessToken
    ) {
      return null
    }

    try {
      const result = await voApiV2ContentSessionExtractor.extract({
        ...context,
        siteTypeHint: SITE_TYPES.VO_API_V2,
      })
      if (!result) {
        throw new ContentSessionProtocolError(
          "VoAPI session extraction failed after identity verification",
        )
      }
      if (!identityMatches(result.userId, identity.userId)) {
        throw new ContentSessionProtocolError(
          "VoAPI session identity changed after verification",
        )
      }
      return result
    } catch (error) {
      if (error instanceof ContentSessionProtocolError) throw error
      throw new ContentSessionProtocolError("VoAPI session extraction failed")
    }
  },
  async extract() {
    const accessToken = readVoApiV2BrowserToken()
    if (!accessToken) return null

    const identity = readVoApiV2StoredIdentity(accessToken)
    if (!identity || identity.userId === undefined) return null

    const { access_token: _accessToken, ...safeUser } = identity.user ?? {}

    return {
      userId: identity.userId,
      user: safeUser,
      accessToken,
      siteTypeHint: SITE_TYPES.VO_API_V2,
    }
  },
}
