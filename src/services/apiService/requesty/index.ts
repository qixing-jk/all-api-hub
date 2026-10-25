import { QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import {
  REQUESTY_ENDPOINTS,
  REQUESTY_RESPONSE_ERRORS,
} from "~/services/apiService/requesty/constants"
import { readDecimal, readString } from "~/services/apiService/requesty/parsing"
import {
  fetchRequestyManageData,
  readRequestyRecord,
} from "~/services/apiService/requesty/transport"
import { ApiError } from "~/services/apiTransport/errors"
import { isRecord } from "~/utils/core/object"

export type { RequestyApiKey } from "./keyManagement"
export type { RequestyPublicModel } from "./publicModelCatalog"

/** Minimal account request fields the management API actually consumes. */
export type RequestyManageRequest = Pick<
  ApiServiceAccountRequest,
  "auth" | "baseUrl" | "abortSignal" | "accountId" | "siteType"
> &
  Partial<Pick<ApiServiceAccountRequest, "checkIn">>

export interface RequestyOrg {
  name: string
  /** Prepaid USD credit balance (string-decimal on the live deployment). */
  balance: number
}

/** Reads the verified organization identity and prepaid USD balance. */
export async function fetchRequestyOrg(
  request: RequestyManageRequest,
): Promise<RequestyOrg> {
  const endpoint = REQUESTY_ENDPOINTS.org
  const body = readRequestyRecord(
    await fetchRequestyManageData<unknown>(request, endpoint),
    endpoint,
  )
  const name = readString(body.name)
  const balance = readDecimal(body.balance)
  if (name === undefined || balance === undefined || balance < 0) {
    throw new Error(REQUESTY_RESPONSE_ERRORS.Organization)
  }
  return { name, balance }
}

/** Resolves the balance-owning organization, independently of the calling key. */
export async function fetchRequestyAccountIdentity(
  request: RequestyManageRequest,
): Promise<{ orgName: string; orgId?: string }> {
  const org = await fetchRequestyOrg(request)
  // The org endpoint has no ID. Group inventory is scoped to this same
  // authenticated organization and exposes its organization_id.
  let payload: unknown
  try {
    payload = await fetchRequestyManageData<unknown>(
      request,
      REQUESTY_ENDPOINTS.groups,
    )
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.statusCode === 403 || error.statusCode === 404)
    ) {
      return { orgName: org.name }
    }
    throw error
  }
  const body = readRequestyRecord(payload, REQUESTY_ENDPOINTS.groups)
  if (!Array.isArray(body.groups))
    throw new Error(REQUESTY_RESPONSE_ERRORS.Groups)
  const ids = new Set<string>()
  for (const group of body.groups) {
    const id = isRecord(group)
      ? readString(group.organization_id)?.trim()
      : undefined
    if (!id) throw new Error(REQUESTY_RESPONSE_ERRORS.GroupOrganization)
    ids.add(id)
  }
  if (ids.size > 1) throw new Error(REQUESTY_RESPONSE_ERRORS.GroupOrganization)
  const [orgId] = ids
  return { orgName: org.name, ...(orgId ? { orgId } : {}) }
}

/** Identity of the calling manage key: its own key record and the org name. */
export async function fetchRequestySelfKeyInfo(
  request: RequestyManageRequest,
): Promise<{ keyId: string; keyName: string; orgName: string }> {
  const endpoint = REQUESTY_ENDPOINTS.apiKey("self")
  const body = readRequestyRecord(
    await fetchRequestyManageData<unknown>(request, endpoint),
    endpoint,
  )
  const keyId = readString(body.id)
  const keyName = readString(body.name)
  if (keyId === undefined || keyName === undefined) {
    throw new Error(REQUESTY_RESPONSE_ERRORS.SelfKey)
  }
  const org = await fetchRequestyOrg(request)
  return { keyId, keyName, orgName: org.name }
}

/** Converts the org balance into canonical account data. */
export async function fetchAccountData(
  request: RequestyManageRequest,
): Promise<AccountData> {
  const org = await fetchRequestyOrg(request)

  return {
    quota: Math.round(org.balance * QUOTA_PER_USD),
    // One fungible prepaid USD balance, not a scoped or expiring allowance.
    // Native balances are excluded from monetary totals and balance history.
    today_quota_consumption: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_requests_count: 0,
    today_income: 0,
    // The org usage API aggregates an arbitrary date window; its day-boundary
    // timezone semantics are not verified, so today stats stay unavailable.
    todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
    checkIn: request.checkIn as AccountData["checkIn"],
  }
}

export * from "./keyManagement"
