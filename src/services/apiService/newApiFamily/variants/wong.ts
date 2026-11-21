import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { readAccountRefreshResult } from "~/services/accounts/refresh/accountRefreshResult"
import { normalizeApiTokenKeyValue } from "~/services/accountTokens/apiTokenKey"
import { resolveApiTokenKeyWithFetcher } from "~/services/accountTokens/tokenKeyResolver"
import {
  fetchAccountBalance,
  fetchTodayIncome,
  fetchTodayUsage,
} from "~/services/apiService/newApiFamily/default/accountData"
import { collectAccountData } from "~/services/apiService/newApiFamily/default/accountDataCollection"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("NewApiFamily.Wong")
const ENDPOINT = "/api/user/checkin"

export type WongCheckinStatusData = {
  checked_at: number
  checked_in: boolean
  enabled: boolean
  max_quota: number
  min_quota: number
  quota: number
}

export type WongCheckinApiResponse = {
  success: boolean
  message: string
  data?: WongCheckinStatusData
}

/**
 * Whether the current WONG-compatible site supports check-in.
 */
export async function fetchSupportCheckIn(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  const siteStatus = await fetchCheckInStatus(request)
  return siteStatus !== undefined
}

const fetchWongTokenSecretKeyById = async (
  request: ApiServiceRequest,
  tokenId: number,
) => {
  const response = await newApiFamilyRequests.data<{ key?: string }>(request, {
    // Observed canonical deployment contract; downstream forks may differ.
    // https://wzw.pp.ua/assets/index-JGp5IMg4.js
    endpoint: `/api/token/${tokenId}/key`,
    options: { method: "GET" },
  })
  const key = normalizeApiTokenKeyValue(response?.key ?? "")
  if (!key) throw new Error("token_secret_key_missing")
  return key
}

const normalizeMessage = (message: unknown): string =>
  typeof message === "string" ? message : ""

const isAlreadyCheckedMessage = (message: string): boolean => {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("今天已经签到") ||
    normalized.includes("已签到") ||
    normalized.includes("already")
  )
}

/**
 * Fetch today's WONG check-in status.
 */
export async function fetchCheckInStatus(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  const normalizedRequest: ApiServiceRequest =
    request.auth.authType === AuthTypeEnum.None
      ? {
          ...request,
          auth: {
            ...request.auth,
            authType: AuthTypeEnum.AccessToken,
          },
        }
      : request

  try {
    const response = await newApiFamilyRequests.envelope<
      WongCheckinStatusData | undefined
    >(normalizedRequest, {
      endpoint: ENDPOINT,
      options: {
        method: "GET",
        cache: "no-store",
      },
    })

    if (response.data?.enabled === false) {
      return undefined
    }

    if (typeof response.data?.checked_in === "boolean") {
      if (response.data.checked_in) return false
      return response.success ? true : undefined
    }

    const responseMessage = normalizeMessage(response.message)
    if (responseMessage && isAlreadyCheckedMessage(responseMessage)) {
      return false
    }

    if (!response.success) {
      return undefined
    }

    return undefined
  } catch (error) {
    logger.warn("Failed to fetch check-in status", error)
    return undefined
  }
}

/**
 * Fetch WONG account data by composing default account data helpers and
 * WONG-specific check-in detection.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  return collectAccountData(request, {
    balance: () => fetchAccountBalance(request),
    usage: (range) => fetchTodayUsage(request, undefined, range),
    income: (range) => fetchTodayIncome(request, undefined, range),
  })
}

/**
 * Refresh WONG account data with normalized health status.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  return readAccountRefreshResult(
    () => fetchAccountData(request),
    (error) => logger.error("Failed to refresh account data", error),
  )
}

/**
 * WONG reveals masked token secrets with GET `/api/token/{id}/key`.
 */
export async function resolveApiTokenKey(
  request: ApiServiceRequest,
  token: Pick<NewApiToken, "id" | "key">,
): Promise<string> {
  return resolveApiTokenKeyWithFetcher(
    request,
    token,
    fetchWongTokenSecretKeyById,
  )
}
