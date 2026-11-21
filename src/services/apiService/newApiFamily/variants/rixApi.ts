import type { AccountLoginProvider } from "~/constants/accountLogin"
import { CURRENCIES } from "~/constants/money"
import { SITE_TYPES } from "~/constants/siteType"
import type {
  AccountData,
  ApiServiceAccountRequest,
  RefreshAccountResult,
} from "~/services/accounts/accountDataModel"
import { resolveAccountSiteUserIdentity } from "~/services/accounts/accountSiteProfile/identity"
import {
  accountBalanceObservation,
  accountBalanceScope,
} from "~/services/accounts/balanceSnapshot"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import { readAccountRefreshResult } from "~/services/accounts/refresh/accountRefreshResult"
import { balancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  EVIDENCE_KINDS,
  FINANCIAL_ENUMERATION,
  OBSERVATION_STATUSES,
  WALLET_BALANCE_COLLECTION_KEY,
} from "~/services/amounts/financialConstants"
import type {
  AccessTokenInfo,
  UserInfo,
} from "~/services/apiAdapters/contracts/accountBootstrap"
import { extractLoginProviders } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import {
  fetchTodayIncome,
  fetchTodayUsage,
} from "~/services/apiService/newApiFamily/default/accountData"
import { collectAccountData } from "~/services/apiService/newApiFamily/default/accountDataCollection"
import { NEW_API_FINANCIAL_CONTRACT_VERSIONS } from "~/services/apiService/newApiFamily/financialContractVersions"
import { newApiFinancialAmount } from "~/services/apiService/newApiFamily/quotaAsset"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
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

/** Select the reported dialect at the field boundary; never turn the USD string into product quota. */
export async function fetchAccountBalance(request: ApiServiceRequest) {
  const userData = await newApiFamilyRequests.data<RixApiSelfPayload>(request, {
    endpoint: "/api/user/self",
  })

  const scope = accountBalanceScope(request)
  const observedAt = Date.now()
  const isQuota = Object.hasOwn(userData ?? {}, "quota")
  const field = isQuota ? "quota" : "balance"
  const quotaAmount = newApiFinancialAmount(
    userData?.quota,
    request.baseUrl,
    SITE_TYPES.RIX_API,
  )
  const observation = accountBalanceObservation(
    scope,
    [
      balancePosition({
        id: field,
        collectionKey: WALLET_BALANCE_COLLECTION_KEY,
        scope,
        observedAt,
        value: isQuota ? quotaAmount.value : userData?.[field],
        asset: isQuota
          ? quotaAmount.asset
          : // This dialect declares USD even when the amount field is unavailable.
            { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
        source: {
          adapter: SITE_TYPES.RIX_API,
          operation: `/api/user/self:${field}`,
          contractVersion: isQuota
            ? quotaAmount.contractVersion
            : "usd-balance/v1",
          kind: EVIDENCE_KINDS.Reported,
          ...(isQuota ? { amountInputs: quotaAmount.amountInputs } : {}),
        },
      }),
    ],
    observedAt,
    FINANCIAL_ENUMERATION.Complete,
  )
  const current = observation.balance.positions[0]!
  // Both DTO dialects report the same wallet. Retire alternate representations
  // only after a usable reading, including the preceding raw-quota contract.
  if (current.amount.status === OBSERVATION_STATUSES.Known)
    for (const [alternateField, contractVersion] of [
      ["quota", NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd],
      ["quota", NEW_API_FINANCIAL_CONTRACT_VERSIONS.NativeQuota],
      ["balance", "usd-balance/v1"],
    ] as const) {
      const operation = `/api/user/self:${alternateField}`
      if (
        operation === current.amount.source.operation &&
        contractVersion === current.amount.source.contractVersion
      )
        continue
      observation.balanceRefreshParts.push({
        collectionKey: current.collectionKey,
        source: { ...current.amount.source, operation, contractVersion },
        enumeration: FINANCIAL_ENUMERATION.Complete,
        positions: [],
      })
    }
  return observation
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
  const data = await collectAccountData(request, {
    balance: () => fetchAccountBalance(request),
    usage: (range) => fetchTodayUsage(request, undefined, range),
    income: (range) => fetchTodayIncome(request, undefined, range),
  })
  const wallet = data.balance?.positions[0]
  if (
    wallet?.asset.kind === ASSET_KINDS.Currency &&
    wallet.asset.code === CURRENCIES.USD &&
    wallet.amount.source.operation === "/api/user/self:balance" &&
    wallet.amount.source.contractVersion === "usd-balance/v1"
  ) {
    // This dialect reports its wallet directly in USD while logs retain the
    // standard quota scale. Both normalize to that wallet's USD denomination.
    data.settledConsumption = data.settledConsumption?.map((fact) =>
      fact.asset.kind === ASSET_KINDS.Currency &&
      fact.asset.code === CURRENCIES.USD &&
      fact.amount.source.contractVersion ===
        NEW_API_FINANCIAL_CONTRACT_VERSIONS.StandardUsd
        ? {
            ...fact,
            amount: {
              ...fact.amount,
              source: {
                ...fact.amount.source,
                contractVersion: wallet.amount.source.contractVersion,
              },
            },
          }
        : fact,
    )
  }
  return data
}

/**
 * Refresh a Rix API account and convert failures to health status metadata.
 */
export async function refreshAccountData(
  request: ApiServiceAccountRequest,
): Promise<RefreshAccountResult> {
  return readAccountRefreshResult(
    () => fetchAccountData(request),
    (error) => logger.error("刷新账号数据失败", error),
  )
}
