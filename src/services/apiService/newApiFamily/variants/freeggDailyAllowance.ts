import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  API_OPERATION_SEMANTICS,
  type ApiServiceRequest,
  type FetchApiOptions,
} from "~/services/apiTransport/type"
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
): Promise<Record<string, unknown>[]> {
  const response = await newApiFamilyRequests.envelope<unknown>(request, {
    ...requestOptions,
    endpoint: FREEGG_ALLOWANCE_LOG_ENDPOINT,
  })
  if (
    response.success !== true ||
    !isRecord(response.data) ||
    !Array.isArray(response.data.items) ||
    !response.data.items.every(isRecord)
  ) {
    throw new Error("Invalid FreeGG allowance log response")
  }
  return response.data.items
}

/**
 * An authenticated GET can credit this deployment's daily allowance. Mark its
 * actual semantics so a timeout cannot cause transport fallback to replay it.
 * Protocol reference: ZHT0711/egern-freegg-login, freegg-login.js v2.0.0.
 */
export async function triggerFreeggDailyAllowance(request: ApiServiceRequest) {
  const response = await newApiFamilyRequests.envelope<unknown>(request, {
    ...requestOptions,
    endpoint: FREEGG_ALLOWANCE_TRIGGER_ENDPOINT,
    operationSemantics: API_OPERATION_SEMANTICS.Mutation,
  })
  return response.success === true && isRecord(response.data)
    ? response.data.id
    : undefined
}

/** Accept only the protocol's dedicated grant copy, never a top-up or balance. */
export function isFreeggAllowanceRecord(record: Record<string, unknown>) {
  if (record.type !== 4 || typeof record.content !== "string") return false
  const match = record.content.match(
    /^(?:Daily allowance credited:\s*|每日额度发放\s*)[$＄¥￥]\s*(\d+(?:\.\d+)?)\s*$/i,
  )
  return !!match && Number.isFinite(Number(match[1])) && Number(match[1]) > 0
}

/** Positive server IDs distinguish a newly credited entry from an older one. */
export function freeggLogId(value: unknown): string | undefined {
  return (typeof value === "number" || typeof value === "string") &&
    /^[1-9]\d*$/.test(String(value))
    ? String(value)
    : undefined
}
