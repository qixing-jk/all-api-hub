import type { AccountLoginProvider } from "~/constants/accountLogin"
import { QUOTA_PER_USD } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { determineHealthStatus } from "~/services/accounts/accountHealth"
import { resolveAccountSiteUserIdentity } from "~/services/accounts/accountSiteProfile"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import type {
  AccessTokenInfo,
  UserInfo,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { extractLoginProviders } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import {
  fetchTodayIncome,
  fetchTodayUsage,
} from "~/services/apiService/newApiFamily/default/accountData"
import { getTodayTimestampRange } from "~/services/apiService/newApiFamily/default/accountDataUtils"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { refreshSelectedStatus } from "~/services/checkin/autoCheckin/scheduling/refresh"
import { SiteHealthStatus, type CheckInConfig } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

const logger = createLogger("NewApiFamily.RixApi")

/**
 * Rix API self DTO fields that can carry the remaining account balance.
 *
 * Rix API replaced the integer `quota` with a US dollar `balance` string while
 * the rest of its New API-family surfaces (logs, tokens, pricing) still report
 * quota units.
 * Source: https://github.com/RixAPI/Rix-API. Observed 2026-09-26 on
 * https://platform.ephone.ai and the vendor demo https://platform.rixapi.com:
 * `quota` absent, `balance: "0"`, and the console renders `$0`.
 */
interface RixApiSelfPayload {
  quota?: unknown
  balance?: unknown
}

/** Reads a finite, non-negative number from a numeric field or numeric string. */
const readNonNegativeAmount = (value: unknown): number | undefined => {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number.parseFloat(value)
        : Number.NaN

  return Number.isFinite(amount) && amount >= 0 ? amount : undefined
}

/**
 * Resolve a Rix API account balance into the quota units the account snapshot
 * uses everywhere else.
 *
 * The USD balance is converted at the shared scale so the existing quota
 * presentation, history and manual-balance override keep working unchanged. A
 * deployment that still reports an integer `quota` keeps its own value, so the
 * older Rix generation is unaffected.
 */
export async function fetchAccountQuota(
  request: ApiServiceRequest,
): Promise<number> {
  const userData = await newApiFamilyRequests.data<RixApiSelfPayload>(request, {
    endpoint: "/api/user/self",
  })

  if (typeof userData?.quota === "number" && Number.isFinite(userData.quota)) {
    return userData.quota
  }

  const balance = readNonNegativeAmount(userData?.balance)
  if (balance === undefined) return 0

  return Math.round(balance * QUOTA_PER_USD)
}

/**
 * Resolve a Rix API account identity from its self DTO.
 *
 * Rix API 6.x omits `id` while keeping `username`, and the shared reader treats
 * a missing id as an invalid response, so an account on such a deployment could
 * never be completed. The identity fields the account definition declares decide
 * the answer instead, which keeps the numeric id first for deployments that
 * still expose it.
 * Observed 2026-09-26 on https://platform.ephone.ai and the vendor demo
 * https://platform.rixapi.com: `id` absent, `username` present.
 */
export async function fetchUserInfo(
  request: ApiServiceRequest,
  expectedIdentity?: string,
): Promise<{
  id: string
  username: string
  access_token: string
  loginProviders?: readonly AccountLoginProvider[]
  user: UserInfo
}> {
  const userData = await newApiFamilyRequests.data<UserInfo>(request, {
    endpoint: "/api/user/self",
  })
  const userId = resolveAccountSiteUserIdentity({
    siteType: SITE_TYPES.RIX_API,
    user: userData,
  })

  if (!userId) {
    throw new ApiError(
      t("messages:errors.api.invalidResponseFormat"),
      undefined,
      "/api/user/self",
    )
  }

  const expectedUserId = normalizeAccountIdentity(
    expectedIdentity ?? request.auth.userId,
  )
  if (expectedUserId && userId !== expectedUserId) {
    throw new ApiError(
      "The authenticated account does not match the expected account",
      undefined,
      "/api/user/self",
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  }

  const loginProviders = extractLoginProviders(userData)

  return {
    id: userId,
    username: userData.username,
    access_token: userData.access_token || "",
    ...(loginProviders.length > 0 ? { loginProviders } : {}),
    user: userData,
  }
}

const RIX_API_ADMIN_KEY_ENDPOINT = "/api/user/admin-keys"

/**
 * Scopes the account surfaces need: profile and balance, the key inventory and
 * its writes, log reads and usage statistics. The deployment reports these names
 * in `available_scopes`, so nothing here is guessed.
 */
const RIX_API_ADMIN_KEY_SCOPES = [
  "account:read",
  "keys:read",
  "keys:write",
  "logs:read",
  "usage:read",
] as const

/**
 * Stable key name. Its plaintext is only returned once, so an account keeps the
 * secret it stored instead of minting another key under a different name.
 */
const RIX_API_ADMIN_KEY_NAME = "All API Hub"

/** Reads the one-time plaintext out of a mint response. */
function readMintedAdminKeySecret(value: unknown): string {
  if (typeof value === "string") return value.trim()

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    for (const field of ["key", "token", "secret", "plaintext"]) {
      const candidate = record[field]
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim()
      }
    }
  }

  return ""
}

/**
 * Mint the console credential Rix API 6.x issues in place of a personal access
 * token.
 *
 * Newer builds removed `GET /api/user/token` and expose scoped, revocable admin
 * keys instead: `POST /api/user/admin-keys {name, scopes, expires_in_days}`
 * answers with the plaintext once — only its hash is stored, and changing the
 * account password invalidates every key. `expires_in_days: 0` means the key
 * never expires, matching the lifetime of a New API personal access token.
 * Source: https://github.com/RixAPI/Rix-API. Observed 2026-09-26 on
 * https://platform.ephone.ai/admin-keys, which also reports `available_scopes`
 * and a maximum expiry of 365 days.
 *
 * Minting counts as a sensitive action: an account without two-factor
 * authentication, a passkey or a bound phone number is answered with 403, and
 * completion falls back to the session cookie in that case.
 */
async function createAdminKey(request: ApiServiceRequest): Promise<string> {
  const mintedKey = await newApiFamilyRequests.data<unknown>(request, {
    endpoint: RIX_API_ADMIN_KEY_ENDPOINT,
    options: {
      method: "POST",
      body: JSON.stringify({
        name: RIX_API_ADMIN_KEY_NAME,
        scopes: [...RIX_API_ADMIN_KEY_SCOPES],
        expires_in_days: 0,
      }),
    },
  })

  const secret = readMintedAdminKeySecret(mintedKey)
  if (!secret) {
    throw new ApiError(
      t("messages:errors.api.invalidResponseFormat"),
      undefined,
      RIX_API_ADMIN_KEY_ENDPOINT,
    )
  }

  return secret
}

/**
 * Return the credential that authenticates a Rix API account.
 *
 * A deployment that still reports `access_token` keeps it; newer ones are asked
 * for an admin key.
 */
export async function getOrCreateAccessToken(
  request: ApiServiceRequest,
  options?: { expectedUserId?: string },
): Promise<AccessTokenInfo> {
  const userInfo = await fetchUserInfo(request, options?.expectedUserId)
  const loginProviders = userInfo.loginProviders?.length
    ? { loginProviders: userInfo.loginProviders }
    : {}

  if (userInfo.access_token) {
    return {
      username: userInfo.username,
      access_token: userInfo.access_token,
      ...loginProviders,
    }
  }

  return {
    username: userInfo.username,
    access_token: await createAdminKey(request),
    ...loginProviders,
  }
}

/**
 * Fetch a full Rix API account snapshot.
 */
export async function fetchAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const resolvedCheckIn: CheckInConfig = request.checkIn
  const timestampRange = getTodayTimestampRange()

  const quotaPromise = fetchAccountQuota(request)
  const todayUsagePromise = fetchTodayUsage(request, undefined, timestampRange)
  const todayIncomePromise = fetchTodayIncome(
    request,
    undefined,
    timestampRange,
  )
  const checkInPromise = refreshSelectedStatus({
    config: resolvedCheckIn,
    siteType: request.siteType ?? SITE_TYPES.RIX_API,
    request,
  })

  const [quota, todayUsage, todayIncome, checkIn] = await Promise.all([
    quotaPromise,
    todayUsagePromise,
    todayIncomePromise,
    checkInPromise,
  ])

  return {
    quota,
    ...todayUsage,
    ...todayIncome,
    todayStatsAvailability: {
      ...todayUsage.todayStatsAvailability,
      ...todayIncome.todayStatsAvailability,
    },
    checkIn,
  }
}

/**
 * Refresh a Rix API account and convert failures to health status metadata.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  try {
    const data = await fetchAccountData(request)
    return {
      success: true,
      data,
      healthStatus: {
        status: SiteHealthStatus.Healthy,
        message: t("account:healthStatus.normal"),
      },
    }
  } catch (error) {
    logger.error("刷新账号数据失败", error)
    return {
      success: false,
      healthStatus: determineHealthStatus(error),
    }
  }
}
