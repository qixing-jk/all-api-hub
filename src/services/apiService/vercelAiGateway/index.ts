import { QUOTA_PER_USD } from "~/constants/money"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { createUnsupportedTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { SiteHealthStatus } from "~/types"
import { isRecord } from "~/utils/core/object"
import { t } from "~/utils/i18n/core"

import {
  VERCEL_GATEWAY_ENDPOINTS,
  VERCEL_TEAM_ID_QUERY_PARAM,
} from "./constants"
import {
  createVercelGatewayRequest,
  vercelRequests,
  withVercelQuery,
} from "./request"

export * from "./constants"
export * from "./errors"
export * from "./identity"
export * from "./keys"
export * from "./models"

export type VercelCredits = {
  /** Remaining AI Gateway credit in USD. */
  balanceUsd: number
  /** Lifetime credit spend in USD. */
  totalUsedUsd: number
}

const parseUsdAmount = (value: unknown): number | undefined => {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Reads the team's AI Gateway credits. Verified 2026-10-24: the deployment
 * answers USD decimal *strings*, and requires the team on the request — the
 * access token is accepted, but only with `teamId`/`slug`.
 */
export async function fetchVercelCredits(
  request: ApiServiceRequest,
  teamId: string,
  options?: { signal?: AbortSignal },
): Promise<VercelCredits> {
  const body = await vercelRequests.payload<unknown>(
    {
      ...createVercelGatewayRequest(request),
      ...(options?.signal ? { abortSignal: options.signal } : {}),
    },
    {
      endpoint: withVercelQuery(VERCEL_GATEWAY_ENDPOINTS.Credits, {
        [VERCEL_TEAM_ID_QUERY_PARAM]: teamId,
      }),
      options: { method: "GET", cache: "no-store" },
      tempWindowFallback: { statusCodes: [], codes: [] },
    },
  )
  const balanceUsd = isRecord(body) ? parseUsdAmount(body.balance) : undefined
  const totalUsedUsd = isRecord(body)
    ? parseUsdAmount(body.total_used)
    : undefined
  if (balanceUsd === undefined || totalUsedUsd === undefined) {
    throw new VercelCreditsError()
  }
  return { balanceUsd, totalUsedUsd }
}

/** The credits payload did not match the verified `{balance,total_used}` shape. */
class VercelCreditsError extends Error {
  constructor() {
    super("vercel_credits_unreadable")
    this.name = "VercelCreditsError"
  }
}

/** Resolves the team the saved account belongs to (its stored identity). */
function readVercelAccountTeamId(request: ApiServiceRequest): string {
  const teamId =
    typeof request.auth.userId === "string" ? request.auth.userId.trim() : ""
  if (!teamId) throw new VercelCreditsError()
  return teamId
}

/** Fetches the account dashboard data: AI Gateway credit balance only. */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const credits = await fetchVercelCredits(
    request,
    readVercelAccountTeamId(request),
  )
  const quota = Math.round(credits.balanceUsd * QUOTA_PER_USD)
  if (!Number.isFinite(quota)) throw new VercelCreditsError()
  return {
    quota,
    // AI Gateway credit is purchased and free-tier USD, not a token allowance.
    nativeBalance: {
      unit: "USD",
      total: credits.balanceUsd,
      permanent: credits.balanceUsd,
      daily: 0,
    },
    today_quota_consumption: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_requests_count: 0,
    today_income: 0,
    // Spend reports are Pro/Enterprise only and reject the access token, so no
    // today window is published for this account.
    todayStatsAvailability: createUnsupportedTodayStatsAvailability(),
    checkIn: request.checkIn,
  }
}

/** Refreshes the AI Gateway credit balance and maps failures to account health. */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  try {
    return {
      success: true,
      data: await fetchAccountData(request),
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    return {
      success: false,
      healthStatus: determineHealthStatus(
        error instanceof ApiError
          ? error
          : new ApiError(t("account:healthStatus.unknownError")),
      ),
    }
  }
}
