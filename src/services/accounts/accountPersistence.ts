/** Account creation and update persistence workflows. */

import toast from "react-hot-toast"

import {
  isAccountSiteType,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import { AccountUpdateUserTimestampMode } from "~/services/accounts/accountDefaults"
import {
  isValidAccount,
  parseManualQuotaFromUsd,
  resolveExchangeRate,
} from "~/services/accounts/accountFormValidation"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { ensureDefaultApiTokenForAccount } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  getAccountSiteProductProfile,
  normalizeAccountSiteSupplementalAuth,
} from "~/services/accounts/accountSiteProfile"
import { accountStorage } from "~/services/accounts/accountStorage"
import { DefaultTokenLifecyclePolicyBlockedError } from "~/services/accounts/defaultTokenLifecycle"
import {
  canRunAccountDefaultTokenAutomation,
  createStoredAccountKeyProductContext,
} from "~/services/accounts/keyProductCapabilities"
import { normalizeAccountSiteUrlForStorage } from "~/services/accounts/utils/siteUrlNormalization"
import type { AccountDataCapability } from "~/services/apiAdapters/contracts/accountData"
import { resolveOpenRouterAccountUserId } from "~/services/apiAdapters/openrouter/accountIdentity"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
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
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import {
  AuthTypeEnum,
  SiteHealthStatus,
  type CheckInConfig,
  type SiteAccount,
  type Sub2ApiAuthConfig,
} from "~/types"
import type { CheckInMethodSelection } from "~/types/checkIn"
import type { AccountSaveResponse } from "~/types/serviceResponse"
import { extractSessionCookieHeader } from "~/utils/browser/cookieString"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showWarningToast } from "~/utils/core/toastHelpers"
import { t } from "~/utils/i18n/core"

const logger = createLogger("AccountOperations")

export const MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS = 20000

const isDefaultTokenAutoProvisionPolicyBlock = (
  error: unknown,
): error is DefaultTokenLifecyclePolicyBlockedError =>
  error instanceof DefaultTokenLifecyclePolicyBlockedError
/**
 * Create a localized timeout error for manual account data fetching.
 * @param timeoutMs Timeout threshold in milliseconds.
 */
function createAccountDataFetchTimeoutError(timeoutMs: number): Error {
  const error = new Error(
    t("messages:errors.operation.accountDataFetchTimeout", {
      seconds: Math.ceil(timeoutMs / 1000),
    }),
  )
  error.name = "AccountDataFetchTimeoutError"
  return error
}

/**
 * Guards the manual-add refresh path so a hung upstream request cannot block
 * account creation indefinitely. This does not cancel the underlying request.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  createTimeoutError: () => Error,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(createTimeoutError())
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

const createMissingAccountDataCapabilityError = (siteType: string): Error =>
  new Error(`accountData is not implemented for ${siteType}`)

const requireAccountDataCapability = (
  siteType: string,
  accountData: AccountDataCapability | undefined,
): AccountDataCapability => {
  if (!accountData) {
    throw createMissingAccountDataCapabilityError(siteType)
  }

  return accountData
}

/** Validates OpenRouter Management Keys before persistence. */
async function validateOpenRouterManagementKeyIfRequired(params: {
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
function getCredentialValidationMessage(error: unknown): string {
  return getOpenRouterSafeErrorMessage(
    error,
    t("messages:openrouter.networkFallback"),
  )
}

/** Keeps ordinary health diagnostics while protecting OpenRouter persisted state. */
function getAccountHealthFailureReason(
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
function getAccountOperationLogDetails(
  siteType: AccountSiteType,
  ordinaryDetails: unknown,
  safeDetails: Record<string, unknown>,
): unknown {
  return siteType === SITE_TYPES.OPENROUTER ? safeDetails : ordinaryDetails
}

type TagIdsInput = string[] | undefined

interface ValidateAndSaveAccountOptions {
  skipAutoProvisionKeyOnAccountAdd?: boolean
  deferDataRefresh?: boolean
}

interface ValidateAndUpdateAccountOptions {
  deferDataRefresh?: boolean
  selectionChanged?: boolean
  discoveryBaseSelection?: CheckInMethodSelection
}

/**
 * Normalizes a tag id list originating from UI widgets into a de-duped string
 * array, trimming whitespace and discarding empty values.
 * @param tagIds - Optional tag id list from UI.
 * @returns A de-duped array of sanitized tag ids or [] when empty.
 */
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

/**
 * Normalizes the Sub2API auth input.
 */
function normalizeSub2ApiAuthInput(
  siteType: AccountSiteType,
  sub2apiAuth: Sub2ApiAuthConfig | undefined,
): Sub2ApiAuthConfig | undefined {
  return normalizeAccountSiteSupplementalAuth({ siteType, sub2apiAuth })
    .sub2apiAuth
}

/**
 * 验证并保存账号信息（用于新增）
 *
 * Validates user-supplied account form data, fetches the freshest remote
 * account metrics, and persists the resulting record via accountStorage.
 * @param url - Target site URL entered by the user.
 * @param siteName - Display name for the account.
 * @param username - Username retrieved from the remote site.
 * @param accessToken - Auth token required for API calls.
 * @param userId - Site-scoped account identity entered by the user.
 * @param exchangeRate - Recharge exchange rate configured in UI.
 * @param notes - Free-form notes provided by user.
 * @param tagIds - Optional tag ids originating from the tag picker.
 * @param checkInConfig - Check-in configuration captured from UI.
 * @param siteType - Classifier describing the site (OneAPI, etc.).
 * @param authType - Authentication strategy (cookie/token/none).
 * @param cookieAuthSessionCookie - Session cookie for cookie auth.
 * @returns Success payload with new account id or a failure descriptor.
 */
export async function validateAndSaveAccount(
  url: string,
  siteName: string,
  username: string,
  accessToken: string,
  userId: string,
  exchangeRate: string,
  notes: string,
  tagIds: TagIdsInput,
  checkInConfig: CheckInConfig,
  siteType: string,
  authType: AuthTypeEnum,
  cookieAuthSessionCookie: string,
  manualBalanceUsd?: string,
  excludeFromTotalBalance = false,
  excludeFromTodayIncome = false,
  sub2apiAuth?: Sub2ApiAuthConfig,
  options: ValidateAndSaveAccountOptions = {},
): Promise<AccountSaveResponse> {
  const sessionCookieHeader =
    authType === AuthTypeEnum.Cookie
      ? extractSessionCookieHeader(cookieAuthSessionCookie)
      : ""
  const normalizedSiteType = isAccountSiteType(siteType)
    ? siteType
    : SITE_TYPES.UNKNOWN

  // 表单验证
  if (
    !isValidAccount({
      siteName,
      username,
      userId,
      siteType: normalizedSiteType,
      authType,
      accessToken,
      cookieAuthSessionCookie: sessionCookieHeader,
      exchangeRate,
    })
  ) {
    return {
      success: false,
      message: t("messages:errors.validation.incompleteAccountInfo"),
    }
  }

  let credentialValidation: OpenRouterManagementKeyValidation
  try {
    credentialValidation = await validateOpenRouterManagementKeyIfRequired({
      siteType: normalizedSiteType,
      accessToken,
      shouldValidate: true,
    })
  } catch (error) {
    logger.warn("Account credential validation failed", {
      siteType: normalizedSiteType,
      status: "rejected",
    })
    return {
      success: false,
      message: getCredentialValidationMessage(error),
    }
  }
  const productProfile = getAccountSiteProductProfile(normalizedSiteType)
  const accountIdentity =
    normalizedSiteType === SITE_TYPES.OPENROUTER
      ? resolveOpenRouterAccountUserId({
          enteredUserId: userId,
          creatorUserId: credentialValidation.userId,
        })
      : normalizeAccountIdentity(userId)!
  const resolvedUsername = username.trim()
  const requestAccountIdentity = normalizeAccountIdentity(userId) ?? ""

  let shouldAutoProvisionKeyOnAccountAdd =
    DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAdd ?? false
  let includeTodayCashflow = DEFAULT_PREFERENCES.showTodayCashflow ?? true
  try {
    const prefs = await userPreferences.getPreferences()
    shouldAutoProvisionKeyOnAccountAdd =
      prefs.autoProvisionKeyOnAccountAdd ?? shouldAutoProvisionKeyOnAccountAdd
    includeTodayCashflow = prefs.showTodayCashflow ?? includeTodayCashflow
  } catch (error) {
    logger.warn(
      "Failed to read user preferences; falling back to defaults",
      getAccountOperationLogDetails(normalizedSiteType, error, {
        status: "fallback",
      }),
    )
  }

  const manualQuota = parseManualQuotaFromUsd(manualBalanceUsd)
  const normalizedManualBalanceUsd =
    manualQuota === undefined ? "" : manualBalanceUsd!.trim()
  const normalizedSub2ApiAuth = normalizeSub2ApiAuthInput(
    normalizedSiteType,
    sub2apiAuth,
  )
  const requestBaseUrl = url.trim()
  const storageSiteUrl = normalizeAccountSiteUrlForStorage({
    siteType: normalizedSiteType,
    url,
  })
  const resolvedExchangeRate = resolveExchangeRate(exchangeRate)
  const normalizedTagIds = normalizeTagIdsInput(tagIds)

  if (options.deferDataRefresh === true) {
    const accountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at" | "user_updated_at"
    > = {
      site_name: siteName.trim(),
      site_url: storageSiteUrl,
      site_type: normalizedSiteType,
      authType: authType,
      disabled: false,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      excludeFromTodayIncome: excludeFromTodayIncome === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate: resolvedExchangeRate,
      notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      checkIn: checkInConfig,
      health: { status: SiteHealthStatus.Unknown },
      account_info: {
        id: accountIdentity,
        access_token: accessToken.trim(),
        username: resolvedUsername,
        quota: manualQuota ?? 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
        todayStatsAvailability:
          productProfile.metrics.deferredTodayStatsAvailability,
      },
      last_sync_time: Date.now(),
    }

    try {
      const accountId = await accountStorage.addAccount(accountData)
      logger.info(
        "Account saved before deferred data refresh",
        getAccountOperationLogDetails(
          normalizedSiteType,
          {
            accountId,
            siteName: siteName.trim(),
            siteType: normalizedSiteType,
          },
          {
            siteType: normalizedSiteType,
            status: "saved_before_deferred_refresh",
          },
        ),
      )
      if (!options.skipAutoProvisionKeyOnAccountAdd) {
        void autoProvisionKeyOnAccountAdd(
          accountId,
          shouldAutoProvisionKeyOnAccountAdd,
        )
      }

      return {
        success: true,
        message: t("messages:toast.success.accountSaveSuccess"),
        accountId,
        feedbackLevel: "success",
      }
    } catch (saveError) {
      logger.error(
        "Failed to save account",
        getAccountOperationLogDetails(normalizedSiteType, saveError, {
          siteType: normalizedSiteType,
          status: "persist_failed",
        }),
      )
      const errorMessage = getErrorMessage(saveError)
      return {
        success: false,
        message: t("messages:errors.operation.saveFailed", {
          error: errorMessage,
        }),
      }
    }
  }

  try {
    // 获取账号余额和今日使用情况
    logger.debug(
      "Fetching account data for new account",
      getAccountOperationLogDetails(
        normalizedSiteType,
        {
          baseUrl: requestBaseUrl,
          siteType: normalizedSiteType,
          authType,
          userId: requestAccountIdentity,
        },
        {
          authType,
          siteType: normalizedSiteType,
          status: "fetching",
        },
      ),
    )
    const accountDataCapability = requireAccountDataCapability(
      normalizedSiteType,
      getSiteTypeCapabilities(normalizedSiteType).account?.data,
    )
    const freshAccountData = await withTimeout(
      accountDataCapability.fetchData({
        baseUrl: requestBaseUrl,
        siteType: normalizedSiteType,
        checkIn: checkInConfig,
        accountId: undefined, // New account, no ID yet
        exchangeRate: resolvedExchangeRate,
        includeTodayCashflow,
        auth: {
          authType,
          userId: requestAccountIdentity,
          accessToken: accessToken.trim(),
          cookie:
            authType === AuthTypeEnum.Cookie
              ? sessionCookieHeader.trim()
              : undefined,
        },
      }),
      MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS,
      () =>
        createAccountDataFetchTimeoutError(
          MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS,
        ),
    )
    const accountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at" | "user_updated_at"
    > = {
      site_name: siteName.trim(),
      site_url: storageSiteUrl,
      health: { status: SiteHealthStatus.Healthy }, // 成功获取数据说明状态正常
      site_type: normalizedSiteType,
      authType: authType,
      disabled: false,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      excludeFromTodayIncome: excludeFromTodayIncome === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate: resolvedExchangeRate, // 使用用户输入的汇率
      notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      checkIn: freshAccountData.checkIn,
      account_info: {
        id: accountIdentity,
        access_token: accessToken.trim(),
        username: resolvedUsername,
        quota: manualQuota ?? freshAccountData.quota,
        today_prompt_tokens: freshAccountData.today_prompt_tokens,
        today_completion_tokens: freshAccountData.today_completion_tokens,
        today_quota_consumption: freshAccountData.today_quota_consumption,
        today_requests_count: freshAccountData.today_requests_count,
        today_income: freshAccountData.today_income,
        todayStatsAvailability: freshAccountData.todayStatsAvailability,
        usage: freshAccountData.usage,
        subscription: freshAccountData.subscription,
        recentUsageRecords: freshAccountData.recentUsageRecords,
      },
      last_sync_time: Date.now(),
    }

    const accountId = await accountStorage.addAccount(accountData)
    logger.info(
      "Account saved with data refresh",
      getAccountOperationLogDetails(
        normalizedSiteType,
        {
          accountId,
          siteName: siteName.trim(),
          siteType: normalizedSiteType,
        },
        {
          siteType: normalizedSiteType,
          status: "saved_with_refresh",
        },
      ),
    )
    if (!options.skipAutoProvisionKeyOnAccountAdd) {
      void autoProvisionKeyOnAccountAdd(
        accountId,
        shouldAutoProvisionKeyOnAccountAdd,
      )
    }

    return {
      success: true,
      message: t("messages:toast.success.accountSaveSuccess"),
      accountId,
      feedbackLevel: "success",
    }
  } catch (error) {
    // FALLBACK: 即使获取数据失败也要保存配置
    logger.warn(
      "Data fetch failed; saving configuration only",
      getAccountOperationLogDetails(normalizedSiteType, error, {
        siteType: normalizedSiteType,
        status: "fallback",
      }),
    )

    const partialAccountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at" | "user_updated_at"
    > = {
      site_name: siteName.trim(),
      site_url: storageSiteUrl,
      site_type: normalizedSiteType,
      authType: authType,
      disabled: false,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      excludeFromTodayIncome: excludeFromTodayIncome === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate: resolvedExchangeRate,
      notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      checkIn: checkInConfig,
      health: {
        status: SiteHealthStatus.Warning,
        reason: getAccountHealthFailureReason(normalizedSiteType, error),
      },
      account_info: {
        id: accountIdentity,
        access_token: accessToken.trim(),
        username: resolvedUsername,
        quota: manualQuota ?? 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
        todayStatsAvailability:
          productProfile.metrics.deferredTodayStatsAvailability,
      },
      last_sync_time: Date.now(),
    }

    // Try to save partial account data
    try {
      const accountId = await accountStorage.addAccount(partialAccountData)
      logger.warn(
        "Account saved without data refresh",
        getAccountOperationLogDetails(
          normalizedSiteType,
          {
            accountId,
            siteName: siteName.trim(),
            siteType,
          },
          {
            siteType: normalizedSiteType,
            status: "saved_without_data_refresh",
          },
        ),
      )

      if (!options.skipAutoProvisionKeyOnAccountAdd) {
        void autoProvisionKeyOnAccountAdd(
          accountId,
          shouldAutoProvisionKeyOnAccountAdd,
        )
      }

      return {
        success: true,
        message: t("messages:warnings.accountSavedWithoutDataRefresh"),
        accountId,
        feedbackLevel: "warning",
      }
    } catch (saveError) {
      logger.error(
        "Failed to save account",
        getAccountOperationLogDetails(normalizedSiteType, saveError, {
          siteType: normalizedSiteType,
          status: "persist_failed",
        }),
      )
      const errorMessage = getErrorMessage(saveError)
      return {
        success: false,
        message: t("messages:errors.operation.saveFailed", {
          error: errorMessage,
        }),
      }
    }
  }
}

/**
 * 验证并更新账号信息（用于编辑）
 *
 * Re-validates edited account data, refreshes remote metrics, and applies a
 * partial update to the existing account record. Falls back to a config-only
 * update when live data fetching fails.
 * @param accountId - Identifier of the stored account to update.
 * @param url - Updated site URL.
 * @param siteName - Updated display name.
 * @param username - Updated username.
 * @param accessToken - Updated auth token.
 * @param userId - Updated site-scoped account identity.
 * @param exchangeRate - Updated recharge rate string.
 * @param notes - Updated notes.
 * @param tagIds - Updated tag id collection.
 * @param checkInConfig - Updated check-in configuration.
 * @param siteType - Updated site type classification.
 * @param authType - Authentication mode in use.
 * @param cookieAuthSessionCookie - Session cookie for cookie auth.
 * @returns Response describing success/failure and account id.
 */
export async function validateAndUpdateAccount(
  accountId: string,
  url: string,
  siteName: string,
  username: string,
  accessToken: string,
  userId: string,
  exchangeRate: string,
  notes: string,
  tagIds: TagIdsInput,
  checkInConfig: CheckInConfig,
  siteType: string,
  authType: AuthTypeEnum,
  cookieAuthSessionCookie: string,
  manualBalanceUsd?: string,
  excludeFromTotalBalance = false,
  excludeFromTodayIncome = false,
  sub2apiAuth?: Sub2ApiAuthConfig,
  options: ValidateAndUpdateAccountOptions = {},
): Promise<AccountSaveResponse> {
  const sessionCookieHeader =
    authType === AuthTypeEnum.Cookie
      ? extractSessionCookieHeader(cookieAuthSessionCookie)
      : ""
  const normalizedSiteType = isAccountSiteType(siteType)
    ? siteType
    : SITE_TYPES.UNKNOWN

  // 表单验证
  if (
    !isValidAccount({
      siteName,
      username,
      userId,
      siteType: normalizedSiteType,
      authType,
      accessToken,
      cookieAuthSessionCookie: sessionCookieHeader,
      exchangeRate,
    })
  ) {
    return {
      success: false,
      message: t("messages:errors.validation.incompleteAccountInfo"),
    }
  }

  const isOpenRouter = normalizedSiteType === SITE_TYPES.OPENROUTER
  let existingAccountInfo: SiteAccount["account_info"] | undefined
  let existingAccountSiteType: SiteAccount["site_type"] | undefined
  if (isOpenRouter) {
    let existingAccount: SiteAccount | undefined
    try {
      existingAccount = (await accountStorage.getAllAccountsOrThrow()).find(
        (account) => account.id === accountId,
      )
    } catch {
      logger.error("Failed to load account for update", {
        siteType: normalizedSiteType,
        status: "load_failed",
      })
      return {
        success: false,
        message: t("messages:errors.validation.updateAccountFailed", {
          error: "",
        }),
      }
    }
    if (!existingAccount) {
      logger.warn("Account update failed: account not found", {
        siteType: normalizedSiteType,
        status: "not_found",
      })
      return {
        success: false,
        message: t("messages:errors.validation.updateAccountFailed", {
          error: "",
        }),
      }
    }
    existingAccountInfo = existingAccount.account_info
    existingAccountSiteType = existingAccount.site_type
  }
  const requestAccountIdentity = normalizeAccountIdentity(userId) ?? ""

  const normalizedAccessToken = accessToken.trim()
  const existingAccessToken = existingAccountInfo?.access_token?.trim() ?? ""
  let credentialValidation: OpenRouterManagementKeyValidation
  try {
    credentialValidation = await validateOpenRouterManagementKeyIfRequired({
      siteType: normalizedSiteType,
      accessToken: normalizedAccessToken,
      shouldValidate:
        existingAccountSiteType !== SITE_TYPES.OPENROUTER ||
        normalizedAccessToken !== existingAccessToken,
    })
  } catch (error) {
    logger.warn("Account credential validation failed", {
      siteType: normalizedSiteType,
      status: "rejected",
    })
    return {
      success: false,
      message: getCredentialValidationMessage(error),
    }
  }
  const accountIdentity = isOpenRouter
    ? resolveOpenRouterAccountUserId({
        enteredUserId: userId,
        creatorUserId: credentialValidation.userId,
        existingUserId: existingAccountInfo?.id,
      })
    : normalizeAccountIdentity(userId)!
  const resolvedUsername = username.trim()

  const manualQuota = parseManualQuotaFromUsd(manualBalanceUsd)
  const normalizedManualBalanceUsd =
    manualQuota === undefined ? "" : manualBalanceUsd!.trim()
  const normalizedSub2ApiAuth = normalizeSub2ApiAuthInput(
    normalizedSiteType,
    sub2apiAuth,
  )
  const requestBaseUrl = url.trim()
  const storageSiteUrl = normalizeAccountSiteUrlForStorage({
    siteType: normalizedSiteType,
    url,
  })
  const resolvedExchangeRate = resolveExchangeRate(exchangeRate)
  const normalizedTagIds = normalizeTagIdsInput(tagIds)

  if (options.deferDataRefresh === true) {
    const updateData = {
      site_name: siteName.trim(),
      site_url: storageSiteUrl,
      site_type: normalizedSiteType,
      authType: authType,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      excludeFromTodayIncome: excludeFromTodayIncome === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate: resolvedExchangeRate,
      notes: notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      account_info: {
        id: accountIdentity,
        access_token: normalizedAccessToken,
        username: resolvedUsername,
        ...(manualQuota === undefined ? {} : { quota: manualQuota }),
      },
    }

    const success = await accountStorage.updateAccountWithCheckInDraft(
      accountId,
      updateData,
      checkInConfig,
      {
        userTimestampMode: AccountUpdateUserTimestampMode.Touch,
        selectionChanged: options.selectionChanged,
        discoveryBaseSelection: options.discoveryBaseSelection,
      },
    )

    if (!success) {
      return {
        success: false,
        message: t("messages:errors.validation.updateAccountFailed", {
          error: "",
        }),
      }
    }

    logger.info(
      "Account updated before deferred data refresh",
      getAccountOperationLogDetails(
        normalizedSiteType,
        {
          accountId,
          siteName: siteName.trim(),
          siteType: normalizedSiteType,
        },
        {
          siteType: normalizedSiteType,
          status: "updated_before_deferred_refresh",
        },
      ),
    )

    return {
      success: true,
      message: t("messages:toast.success.accountUpdateSuccess"),
      accountId,
      feedbackLevel: "success",
    }
  }

  try {
    // 获取账号余额和今日使用情况
    logger.debug(
      "Fetching account data for update",
      getAccountOperationLogDetails(
        normalizedSiteType,
        {
          accountId,
          baseUrl: requestBaseUrl,
          siteType: normalizedSiteType,
          authType,
          userId: requestAccountIdentity,
        },
        {
          authType,
          siteType: normalizedSiteType,
          status: "fetching",
        },
      ),
    )
    const includeTodayCashflow =
      (await userPreferences.getPreferences()).showTodayCashflow ?? true
    const accountData = requireAccountDataCapability(
      normalizedSiteType,
      getSiteTypeCapabilities(normalizedSiteType).account?.data,
    )
    const freshAccountData = await accountData.fetchData({
      baseUrl: requestBaseUrl,
      siteType: normalizedSiteType,
      checkIn: checkInConfig,
      accountId,
      exchangeRate: resolvedExchangeRate,
      includeTodayCashflow,
      auth: {
        authType,
        userId: requestAccountIdentity,
        accessToken: accessToken.trim(),
        cookie:
          authType === AuthTypeEnum.Cookie
            ? sessionCookieHeader.trim()
            : undefined,
      },
    })
    const updateData: Partial<
      Omit<SiteAccount, "id" | "created_at" | "updated_at" | "user_updated_at">
    > = {
      site_name: siteName.trim(),
      site_url: storageSiteUrl,
      health: { status: SiteHealthStatus.Healthy }, // 成功获取数据说明状态正常
      site_type: normalizedSiteType,
      authType: authType,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      excludeFromTodayIncome: excludeFromTodayIncome === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate: resolvedExchangeRate, // 使用用户输入的汇率
      notes: notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      account_info: {
        id: accountIdentity,
        access_token: normalizedAccessToken,
        username: resolvedUsername,
        quota: manualQuota ?? freshAccountData.quota,
        today_prompt_tokens: freshAccountData.today_prompt_tokens,
        today_completion_tokens: freshAccountData.today_completion_tokens,
        today_quota_consumption: freshAccountData.today_quota_consumption,
        today_requests_count: freshAccountData.today_requests_count,
        today_income: freshAccountData.today_income,
        todayStatsAvailability: freshAccountData.todayStatsAvailability,
        usage: freshAccountData.usage,
        subscription: freshAccountData.subscription,
        recentUsageRecords: freshAccountData.recentUsageRecords,
      },
      last_sync_time: Date.now(),
    }

    const success = await accountStorage.updateAccountWithCheckInDraft(
      accountId,
      updateData,
      checkInConfig,
      {
        userTimestampMode: AccountUpdateUserTimestampMode.Touch,
        selectionChanged: options.selectionChanged,
        discoveryBaseSelection: options.discoveryBaseSelection,
        refreshed: freshAccountData.checkIn,
      },
    )
    if (!success) {
      return {
        success: false,
        message: t("messages:errors.validation.updateAccountFailed", {
          error: "",
        }),
      }
    }

    logger.info(
      "Account updated with data refresh",
      getAccountOperationLogDetails(
        normalizedSiteType,
        {
          accountId,
          siteName: siteName.trim(),
          siteType,
        },
        {
          siteType: normalizedSiteType,
          status: "updated_with_refresh",
        },
      ),
    )

    return {
      success: true,
      message: t("messages:toast.success.accountUpdateSuccess"),
      accountId,
      feedbackLevel: "success",
    }
  } catch (error) {
    // FALLBACK: 即使获取数据失败也要保存配置
    logger.warn(
      "Data fetch failed; saving configuration only",
      getAccountOperationLogDetails(normalizedSiteType, error, {
        siteType: normalizedSiteType,
        status: "fallback",
      }),
    )

    const partialUpdateData = {
      site_name: siteName.trim(),
      site_url: storageSiteUrl,
      site_type: normalizedSiteType,
      authType: authType,
      excludeFromTotalBalance: excludeFromTotalBalance === true,
      excludeFromTodayIncome: excludeFromTodayIncome === true,
      cookieAuth:
        authType === AuthTypeEnum.Cookie
          ? { sessionCookie: sessionCookieHeader.trim() }
          : undefined,
      sub2apiAuth: normalizedSub2ApiAuth,
      exchange_rate: resolvedExchangeRate,
      notes: notes,
      manualBalanceUsd: normalizedManualBalanceUsd,
      tagIds: normalizedTagIds,
      health: {
        status: SiteHealthStatus.Warning,
        reason: getAccountHealthFailureReason(normalizedSiteType, error),
      },
      account_info: {
        id: accountIdentity,
        access_token: normalizedAccessToken,
        username: resolvedUsername,
        ...(manualQuota === undefined ? {} : { quota: manualQuota }),
      },
      last_sync_time: Date.now(),
    }

    // Try to save partial update
    const success = await accountStorage.updateAccountWithCheckInDraft(
      accountId,
      partialUpdateData,
      checkInConfig,
      {
        userTimestampMode: AccountUpdateUserTimestampMode.Touch,
        selectionChanged: options.selectionChanged,
        discoveryBaseSelection: options.discoveryBaseSelection,
      },
    )

    if (!success) {
      return {
        success: false,
        message: t("messages:errors.validation.updateAccountFailed", {
          error: "",
        }),
      }
    }

    return {
      success: true,
      message: t("messages:warnings.accountUpdatedWithoutDataRefresh"),
      accountId,
      feedbackLevel: "warning",
    }
  }
}

/**
 * Best-effort default API key auto-provisioning after account add.
 *
 * This is intentionally non-blocking for the save flow, but should provide
 * explicit UX feedback so users can confirm whether a key was created or the
 * account already had keys.
 */
async function autoProvisionKeyOnAccountAdd(
  accountId: string,
  enabled: boolean,
): Promise<void> {
  if (!enabled) return

  try {
    const account = await accountStorage.getAccountById(accountId)
    if (!account) {
      logger.warn("Auto-provision skipped: account not found", { accountId })
      return
    }

    if (account.disabled === true) {
      return
    }

    if (account.authType === AuthTypeEnum.None) {
      return
    }

    if (
      !canRunAccountDefaultTokenAutomation(
        createStoredAccountKeyProductContext(account),
      )
    ) {
      return
    }

    const { created } = await ensureDefaultApiTokenForAccount({ account })

    if (created) {
      toast.success(
        t("messages:accountOperations.autoProvisionCreated", {
          accountName: account.site_name,
        }),
      )
    } else {
      showWarningToast(
        t("messages:accountOperations.autoProvisionAlreadyHad", {
          accountName: account.site_name,
        }),
      )
    }
  } catch (error) {
    if (isDefaultTokenAutoProvisionPolicyBlock(error)) {
      return
    }

    toast.error(
      t("messages:accountOperations.autoProvisionFailed", {
        actionLabel: t("keyManagement:repairMissingKeys.action"),
      }),
    )
    logger.warn("Auto-provision key after account add failed", {
      accountId,
      error: getErrorMessage(error),
    })
  }
}
