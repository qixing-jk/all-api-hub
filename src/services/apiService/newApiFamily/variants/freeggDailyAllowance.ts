import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import {
  API_OPERATION_SEMANTICS,
  type ApiServiceRequest,
  type FetchApiOptions,
} from "~/services/apiTransport/type"
import { parseDayKey } from "~/utils/core/dayKey"
import { isRecord } from "~/utils/core/object"

import {
  FREEGG_ALLOWANCE_LOG_ENDPOINT,
  FREEGG_ALLOWANCE_TRIGGER_ENDPOINT,
} from "./freeggDailyAllowanceConfig"

// Opening a logged-in FreeGG page can itself issue the grant. Neither a read
// nor an uncertain trigger may recover by opening a new page or logging in.
const requestOptions: Pick<
  FetchApiOptions,
  "currentTabTransport" | "tempWindowFallback" | "options"
> = {
  currentTabTransport: "disabled",
  tempWindowFallback: { codes: [], statusCodes: [] },
  options: { credentials: "omit", cache: "no-store" },
}

/** Public deployment identity, independent of the standard check-in switch. */
export async function fetchFreeggPublicStatus(request: ApiServiceRequest) {
  return newApiFamilyRequests.envelope<{ system_name?: string }>(request, {
    ...requestOptions,
    endpoint: "/api/status",
  })
}

/** Read the newest system logs; never request self or renew a session here. */
export async function fetchFreeggAllowanceLogs(
  request: ApiServiceRequest,
): Promise<{
  records: Record<string, unknown>[]
  complete: boolean
  serverTime?: number
}> {
  const records: Record<string, unknown>[] = []
  const seen = new Set<string>()
  let total: number | undefined
  let serverTime: number | undefined
  for (let page = 1; page <= 10; page++) {
    request.abortSignal?.throwIfAborted()
    const http = await fetchApiResponse<unknown>(request, {
      ...requestOptions,
      endpoint: `${FREEGG_ALLOWANCE_LOG_ENDPOINT}?p=${page}&page_size=100&type=1`,
    })
    if (!http.ok)
      throw new ApiError(
        "FreeGG ledger request failed",
        http.status,
        FREEGG_ALLOWANCE_LOG_ENDPOINT,
      )
    // The deployed server clock is ahead of the browser. Compare its event
    // timestamps to its HTTP Date, not an arbitrary client-side tolerance.
    const date = Date.parse(http.headers.date ?? "")
    serverTime = Number.isFinite(date) ? date : undefined
    const response = isRecord(http.body) ? http.body : {}
    request.abortSignal?.throwIfAborted()
    const data = response.data
    if (
      response.success !== true ||
      !isRecord(data) ||
      !Array.isArray(data.items) ||
      !data.items.every(isRecord) ||
      typeof data.total !== "number" ||
      !Number.isSafeInteger(data.total) ||
      data.total < 0 ||
      data.page !== page ||
      typeof data.page_size !== "number" ||
      !Number.isSafeInteger(data.page_size) ||
      data.page_size < 1 ||
      data.items.length > data.page_size ||
      data.items.length > data.total
    )
      throw new Error("Invalid FreeGG allowance log response")
    if (total !== undefined && total !== data.total)
      return { records, complete: false, serverTime }
    total = data.total
    for (const item of data.items) {
      const key = freeggLogId(item.id)
      if (!key || seen.has(key)) return { records, complete: false, serverTime }
      seen.add(key)
      records.push(item)
    }
    if (records.length === total) return { records, complete: true, serverTime }
    if (!data.items.length || records.length > total) break
  }
  return { records, complete: false, serverTime }
}

/**
 * An authenticated GET can credit this deployment's daily allowance. Mark its
 * actual semantics so a timeout cannot cause transport fallback to replay it.
 * Live protocol evidence: .scratch/freegg-daily-allowance/spec.md.
 */
export async function triggerFreeggDailyAllowance(request: ApiServiceRequest) {
  const response = await newApiFamilyRequests.envelope<unknown>(request, {
    ...requestOptions,
    endpoint: FREEGG_ALLOWANCE_TRIGGER_ENDPOINT,
    operationSemantics: API_OPERATION_SEMANTICS.Mutation,
  })
  if (response.success !== true || !isRecord(response.data)) return
  let setting = response.data.setting
  if (typeof setting === "string") {
    try {
      setting = JSON.parse(setting)
    } catch {
      setting = undefined
    }
  }
  const allowanceDate =
    isRecord(setting) &&
    typeof setting.allowance_date === "string" &&
    parseDayKey(setting.allowance_date)
      ? setting.allowance_date
      : undefined
  return { id: response.data.id, allowanceDate }
}

/** Accept only the protocol's dedicated grant copy, never a top-up or balance. */
export function isFreeggAllowanceRecord(record: Record<string, unknown>) {
  return !!readFreeggAllowancePart(record)
}

/** Corrupt ledger metadata cannot prove that a grant is absent. */
export function isValidFreeggLog(
  record: Record<string, unknown>,
  userId: unknown,
  now: number,
) {
  if (
    !freeggLogId(record.id) ||
    record.type !== 1 ||
    typeof record.created_at !== "number" ||
    !Number.isSafeInteger(record.created_at) ||
    record.created_at < 0 ||
    record.created_at > now / 1000 ||
    (record.user_id !== undefined && String(record.user_id) !== String(userId))
  )
    return false
  if (
    typeof record.content === "string" &&
    record.content.startsWith("Daily allowance") &&
    !readFreeggAllowancePart(record)
  )
    return false
  let other = record.other
  if (other === undefined || other === null || other === "") return true
  if (typeof other === "string") {
    try {
      other = JSON.parse(other)
    } catch {
      return false
    }
  }
  return (
    isRecord(other) &&
    (other.content_parts === undefined ||
      (Array.isArray(other.content_parts) &&
        other.content_parts.every(
          (part) => isRecord(part) && typeof part.key === "string",
        )))
  )
}

/** The deployed ledger stores the grant in structured copy, with quota=0. */
function readFreeggAllowancePart(record: Record<string, unknown>) {
  if (record.type !== 1) return
  let other = record.other
  if (typeof other === "string") {
    try {
      other = JSON.parse(other)
    } catch {
      return
    }
  }
  if (!isRecord(other) || !Array.isArray(other.content_parts)) return
  return other.content_parts.find(
    (part): part is Record<string, unknown> =>
      isRecord(part) && part.key === "Daily allowance {{quota}}",
  )
}

/** Only an explicit USD marker establishes this monetary amount. */
export function readFreeggAllowanceUsd(record: Record<string, unknown>) {
  const part = readFreeggAllowancePart(record)
  const amount = isRecord(part?.params) ? part.params.quota : undefined
  if (typeof amount !== "string") return
  const match = amount.match(/^[$＄]\s*(\d+(?:\.\d+)?)$/)
  return match && Number.isFinite(Number(match[1])) && Number(match[1]) > 0
    ? match[1]
    : undefined
}

/** IDs are list positions on FreeGG; use them only to validate pagination. */
export function freeggLogId(value: unknown): string | undefined {
  return (typeof value === "number" || typeof value === "string") &&
    /^[1-9]\d*$/.test(String(value))
    ? String(value)
    : undefined
}
