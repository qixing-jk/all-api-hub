import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import {
  accountBalanceObservation,
  accountBalanceScope,
} from "~/services/accounts/balanceSnapshot"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_FUNDING,
  BALANCE_LABEL_KEYS,
  BALANCE_NATURES,
  BALANCE_RELATIONS,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
} from "~/services/amounts/financialConstants"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

import { XIAOEN_ENDPOINTS } from "./constants"
import { parseXiaoenIdentity } from "./identity"
import {
  invalidXiaoenResponse,
  readXiaoen,
  withXiaoenSession,
} from "./transport"

/** Validate all account facts against the saved identity before accepting them. */
export async function fetchIdentity(
  request: ApiServiceRequest,
  options: RequestInit = {},
) {
  const data = await readXiaoen(request, XIAOEN_ENDPOINTS.Identity, options)
  const user = parseXiaoenIdentity({ success: true, data })
  if (!user) throw invalidXiaoenResponse(XIAOEN_ENDPOINTS.Identity)
  if (request.auth.userId && String(request.auth.userId) !== user.id)
    throw new ApiError(
      "肖恩 AI account identity mismatch",
      undefined,
      XIAOEN_ENDPOINTS.Identity,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  return { user, data }
}
/** Return the live console identity after checking its saved-account binding. */
export async function fetchUserInfo(request: ApiServiceRequest) {
  return (await fetchIdentity(request)).user
}
/** Credits have no verified cash exchange rate. Daily credit expires independently of fixed credit. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return withXiaoenSession(request, async (request) => {
    const { data } = await fetchIdentity(request)
    const observedAt = Date.now()
    const scope = accountBalanceScope(request)
    const source = {
      adapter: "xiaoen",
      operation: XIAOEN_ENDPOINTS.Identity,
      contractVersion: "credits/v1",
      kind: EVIDENCE_KINDS.Reported,
    }
    const asset = {
      kind: ASSET_KINDS.Quota,
      id: "xiaoen:credits",
      label: "credits",
      displayLabel: "credits",
      displayScale: 1,
    }
    const positions = [
      balancePosition({
        id: "available",
        collectionKey: "credits",
        scope,
        asset,
        value: data.quota,
        nature: BALANCE_NATURES.Mixed,
        source,
        observedAt,
      }),
      balancePosition({
        id: "permanent",
        labelKey: BALANCE_LABEL_KEYS.Permanent,
        collectionKey: "credits",
        scope,
        asset,
        value: data.permanentQuota,
        nature: BALANCE_NATURES.Prepaid,
        validity: { kind: BALANCE_VALIDITY_KINDS.NoExpiry },
        parentId: "available",
        relation: BALANCE_RELATIONS.Component,
        source,
        observedAt,
      }),
      balancePosition({
        id: "daily",
        labelKey: BALANCE_LABEL_KEYS.Daily,
        collectionKey: "credits",
        scope,
        asset,
        value: data.dailyQuota,
        funding: BALANCE_FUNDING.Granted,
        parentId: "available",
        relation: BALANCE_RELATIONS.Component,
        source,
        observedAt,
      }),
    ]
    return {
      ...accountBalanceObservation(
        scope,
        positions,
        observedAt,
        FINANCIAL_ENUMERATION.Complete,
      ),
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
      checkIn: request.checkIn,
    }
  })
}
