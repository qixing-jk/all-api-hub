import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { isRecord } from "~/utils/core/object"

import { NOVITA_AMOUNTS_PER_USD, NOVITA_OPENAPI_ENDPOINTS } from "./constants"

/**
 * Wire contracts of the Novita OpenAPI, validated against live responses
 * captured on 2026-10-25 (.scratch/novita-adaptation/evidence/wire).
 */

export type NovitaUserInfo = {
  /** Stable account UUID; the console displays it as "User ID". */
  id: string
  username: string
  access_token: null
}

export type NovitaBalanceDetail = {
  availableUsd: number
  cashUsd: number
  creditLimitUsd: number
}

export type NovitaApiKey = {
  name: string
  id: string
  stringId: string
  maskedKey: string
  /** `""` (live) or `"never"` (docs) both mean the key never expires. */
  isPermanent: boolean
  expireTime: string
  createTime: string
  /** Unix seconds; `-1` when the key has never been used. */
  lastUsedAt: number
  modelAccessPolicy: unknown
  ipAccessPolicy: unknown
}

const invalidResponseError = (endpoint: string): ApiError =>
  new ApiError(
    "Invalid Novita response",
    undefined,
    endpoint,
    API_ERROR_CODES.JSON_PARSE_ERROR,
  )

/** Reads a non-negative integer 1/10000 USD amount string. */
function readAmount(value: unknown, endpoint: string): number {
  if (typeof value !== "string" || !/^\d{1,15}$/.test(value.trim()))
    throw invalidResponseError(endpoint)
  return Number(value) / NOVITA_AMOUNTS_PER_USD
}

/** Parses and validates the `/v1/user/info` identity payload. */
export function parseNovitaUserInfo(body: unknown): NovitaUserInfo {
  if (!isRecord(body))
    throw invalidResponseError(NOVITA_OPENAPI_ENDPOINTS.userInfo)
  const uuid = typeof body.uuid === "string" ? body.uuid.trim() : ""
  const email = typeof body.email === "string" ? body.email.trim() : ""
  if (!uuid || !email) {
    throw invalidResponseError(NOVITA_OPENAPI_ENDPOINTS.userInfo)
  }
  return { id: uuid, username: email, access_token: null }
}

/** Parses and validates the `/v1/billing/balance/detail` payload. */
export function parseNovitaBalanceDetail(body: unknown): NovitaBalanceDetail {
  const endpoint = NOVITA_OPENAPI_ENDPOINTS.balanceDetail
  if (!isRecord(body)) throw invalidResponseError(endpoint)
  const availableUsd = readAmount(body.availableBalance, endpoint)
  const cashUsd = readAmount(body.cashBalance, endpoint)
  const creditLimitUsd = readAmount(body.creditLimit, endpoint)
  return { availableUsd, cashUsd, creditLimitUsd }
}

/** Parses and validates the `/v2/user/key` inventory payload. */
export function parseNovitaKeys(body: unknown): NovitaApiKey[] {
  const endpoint = NOVITA_OPENAPI_ENDPOINTS.keys
  if (!isRecord(body) || !Array.isArray(body.keys))
    throw invalidResponseError(endpoint)
  return body.keys.map((raw): NovitaApiKey => {
    if (!isRecord(raw)) throw invalidResponseError(endpoint)
    const stringId = typeof raw.stringId === "string" ? raw.stringId : ""
    const maskedKey = typeof raw.maskedKey === "string" ? raw.maskedKey : ""
    if (!stringId.trim() || !maskedKey.trim()) {
      throw invalidResponseError(endpoint)
    }
    const rawExpiry = typeof raw.expireTime === "string" ? raw.expireTime : ""
    // The console's zone-less timestamp is explicitly UTC in its formatter.
    const expireTime = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(rawExpiry)
      ? `${rawExpiry.replace(" ", "T")}Z`
      : rawExpiry
    const lastUsedAt =
      typeof raw.lastUsedAt === "number" && Number.isFinite(raw.lastUsedAt)
        ? raw.lastUsedAt
        : -1
    return {
      name: typeof raw.name === "string" ? raw.name : "",
      id: typeof raw.id === "string" ? raw.id : String(raw.id ?? ""),
      stringId,
      maskedKey,
      isPermanent: expireTime === "" || expireTime === "never",
      expireTime,
      createTime: typeof raw.createTime === "string" ? raw.createTime : "",
      lastUsedAt,
      modelAccessPolicy: raw.modelAccessPolicy ?? null,
      ipAccessPolicy: raw.ipAccessPolicy ?? null,
    }
  })
}
