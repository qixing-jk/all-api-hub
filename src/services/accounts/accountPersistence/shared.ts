import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import {
  parseManualQuotaFromUsd,
  resolveExchangeRate,
} from "~/services/accounts/accountFormValidation"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { normalizeAccountSiteSupplementalAuth } from "~/services/accounts/accountSiteProfile"
import { normalizeAccountSiteUrlForStorage } from "~/services/accounts/utils/siteUrlNormalization"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import {
  validateManagementKey,
  type OpenRouterManagementKeyValidation,
} from "~/services/apiService/openrouter"
import {
  OPENROUTER_CREDITS_ENDPOINT,
  OPENROUTER_KEY_ENDPOINT,
} from "~/services/apiService/openrouter/constants"
import { OpenRouterManagementKeyRequiredError } from "~/services/apiService/openrouter/errors"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  AuthTypeEnum,
  type CheckInConfig,
  type SiteAccount,
  type Sub2ApiAuthConfig,
} from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

export const accountPersistenceLogger = createLogger("AccountOperations")

export type TagIdsInput = string[] | undefined

interface AccountPersistenceInput {
  url: string
  siteName: string
  username: string
  accessToken: string
  userId: string
  exchangeRate: string
  notes: string
  tagIds: TagIdsInput
  checkInConfig: CheckInConfig
  siteType: AccountSiteType
  authType: AuthTypeEnum
  cookieAuthSessionCookie: string
  manualBalanceUsd?: string
  excludeFromTotalBalance: boolean
  excludeFromTodayIncome: boolean
  sub2apiAuth?: Sub2ApiAuthConfig
}

export const requireAccountDataCapability = (
  siteType: string,
  accountData: AccountDataCapability | undefined,
): AccountDataCapability => {
  if (!accountData) {
    throw new Error(`accountData is not implemented for ${siteType}`)
  }

  return accountData
}

/** Validates OpenRouter Management Keys before persistence. */
export async function validateOpenRouterManagementKeyIfRequired(params: {
  siteType: AccountSiteType
  accessToken: string
  shouldValidate: boolean
}): Promise<OpenRouterManagementKeyValidation> {
  if (params.siteType !== SITE_TYPES.OPENROUTER || !params.shouldValidate) {
    return {}
  }

  return validateManagementKey({ accessToken: params.accessToken.trim() })
}

/** Maps OpenRouter failures to controlled local copy without losing typed classification. */
function getOpenRouterSafeErrorMessage(
  error: unknown,
  unknownFallback: string,
): string {
  if (error instanceof OpenRouterManagementKeyRequiredError) {
    return t("messages:openrouter.managementKeyRequired")
  }
  if (error instanceof ApiError) {
    if (error.code === API_ERROR_CODES.HTTP_401) {
      return t("messages:openrouter.credentialInvalid")
    }
    if (error.code === API_ERROR_CODES.HTTP_403) {
      return t("messages:openrouter.permissionDenied")
    }
    if (error.code === API_ERROR_CODES.NETWORK_ERROR) {
      return t("messages:openrouter.networkFallback")
    }
    const hasOpenRouterResponseEndpoint =
      error.endpoint === OPENROUTER_KEY_ENDPOINT ||
      error.endpoint === OPENROUTER_CREDITS_ENDPOINT
    const hasExplicitMalformedResponseCode =
      error.code === API_ERROR_CODES.CONTENT_TYPE_MISMATCH ||
      error.code === API_ERROR_CODES.JSON_PARSE_ERROR
    const isLocalStructureValidationError =
      hasOpenRouterResponseEndpoint &&
      error.code == null &&
      error.statusCode == null
    if (hasExplicitMalformedResponseCode || isLocalStructureValidationError) {
      return t("messages:openrouter.malformedResponse")
    }
  }
  return unknownFallback
}

/** Maps credential validation failures to stable user-facing copy. */
export function getCredentialValidationMessage(error: unknown): string {
  return getOpenRouterSafeErrorMessage(
    error,
    t("messages:openrouter.networkFallback"),
  )
}

/** Keeps ordinary health diagnostics while protecting OpenRouter persisted state. */
export function getAccountHealthFailureReason(
  siteType: AccountSiteType,
  error: unknown,
): string {
  if (siteType !== SITE_TYPES.OPENROUTER) {
    return getErrorMessage(error)
  }
  return getOpenRouterSafeErrorMessage(
    error,
    t("account:healthStatus.unknownError"),
  )
}

/** Keeps ordinary diagnostics while protecting sensitive OpenRouter details. */
export function getAccountOperationLogDetails(
  siteType: AccountSiteType,
  ordinaryDetails: unknown,
  safeDetails: Record<string, unknown>,
): unknown {
  return siteType === SITE_TYPES.OPENROUTER ? safeDetails : ordinaryDetails
}

/** Normalizes tag ids from the account form into a trimmed, de-duplicated list. */
function normalizeTagIdsInput(tagIds: TagIdsInput): string[] {
  if (!tagIds || tagIds.length === 0) {
    return []
  }

  return Array.from(
    new Set(
      tagIds
        .map((id) => (typeof id === "string" ? id.trim() : String(id ?? "")))
        .filter((id) => id.length > 0),
    ),
  )
}

/** Normalizes supplemental authentication data for the selected account site. */
function normalizeSub2ApiAuthInput(
  siteType: AccountSiteType,
  sub2apiAuth: Sub2ApiAuthConfig | undefined,
): Sub2ApiAuthConfig | undefined {
  return normalizeAccountSiteSupplementalAuth({ siteType, sub2apiAuth })
    .sub2apiAuth
}

/** Builds normalized account fields and request inputs shared by create and update. */
export function buildAccountPersistenceContext(
  input: AccountPersistenceInput & {
    accountIdentity: SiteAccount["account_info"]["id"]
    sessionCookieHeader: string
  },
) {
  const manualQuota = parseManualQuotaFromUsd(input.manualBalanceUsd)

  return {
    sessionCookieHeader: input.sessionCookieHeader,
    manualQuota,
    requestBaseUrl: input.url.trim(),
    requestAccountIdentity: normalizeAccountIdentity(input.userId) ?? "",
    fields: {
      site_name: input.siteName.trim(),
      site_url: normalizeAccountSiteUrlForStorage({
        siteType: input.siteType,
        url: input.url,
      }),
      site_type: input.siteType,
      authType: input.authType,
      excludeFromTotalBalance: input.excludeFromTotalBalance === true,
      excludeFromTodayIncome: input.excludeFromTodayIncome === true,
      cookieAuth:
        input.authType === AuthTypeEnum.Cookie
          ? { sessionCookie: input.sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizeSub2ApiAuthInput(input.siteType, input.sub2apiAuth),
      exchange_rate: resolveExchangeRate(input.exchangeRate),
      notes: input.notes,
      manualBalanceUsd:
        manualQuota === undefined ? "" : input.manualBalanceUsd!.trim(),
      tagIds: normalizeTagIdsInput(input.tagIds),
      account_info: {
        id: input.accountIdentity,
        access_token: input.accessToken.trim(),
        username: input.username.trim(),
      },
    },
  }
}
