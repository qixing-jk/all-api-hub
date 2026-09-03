/** Account creation workflow. */

import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { withManualAccountDataFetchTimeout } from "~/services/accounts/accountCreationTimeout"
import { isValidAccount } from "~/services/accounts/accountFormValidation"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { autoProvisionKeyOnAccountAdd } from "~/services/accounts/accountKeyAutoProvisioning/autoProvisionOnAccountAdd"
import {
  ACCOUNT_PERSISTENCE_LOG_STATUSES,
  ACCOUNT_SAVE_FEEDBACK_LEVELS,
  EMPTY_ACCOUNT_INFO_METRICS,
} from "~/services/accounts/accountPersistence/constants"
import {
  buildAccountPersistenceContext,
  getAccountHealthFailureReason,
  getAccountOperationLogDetails,
  getCredentialValidationMessage,
  accountPersistenceLogger as logger,
  requireAccountDataCapability,
  validateOpenRouterManagementKeyIfRequired,
  type TagIdsInput,
} from "~/services/accounts/accountPersistence/shared"
import { getAccountSiteProductProfile } from "~/services/accounts/accountSiteProfile"
import { accountStorage } from "~/services/accounts/accountStorage"
import { resolveOpenRouterAccountUserId } from "~/services/apiAdapters/openrouter/accountIdentity"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { OpenRouterManagementKeyValidation } from "~/services/apiService/openrouter"
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
import type { AccountSaveResponse } from "~/types/serviceResponse"
import { extractSessionCookieHeader } from "~/utils/browser/cookieString"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

interface ValidateAndSaveAccountOptions {
  skipAutoProvisionKeyOnAccountAdd?: boolean
  deferDataRefresh?: boolean
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
      status: ACCOUNT_PERSISTENCE_LOG_STATUSES.Rejected,
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
        status: ACCOUNT_PERSISTENCE_LOG_STATUSES.Fallback,
      }),
    )
  }

  const persistenceContext = buildAccountPersistenceContext({
    url,
    siteName,
    username,
    accessToken,
    userId,
    exchangeRate,
    notes,
    tagIds,
    checkInConfig,
    siteType: normalizedSiteType,
    authType,
    cookieAuthSessionCookie,
    sessionCookieHeader,
    manualBalanceUsd,
    excludeFromTotalBalance,
    excludeFromTodayIncome,
    sub2apiAuth,
    accountIdentity,
  })
  const { fields, manualQuota, requestAccountIdentity, requestBaseUrl } =
    persistenceContext

  if (options.deferDataRefresh === true) {
    const accountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at" | "user_updated_at"
    > = {
      ...fields,
      disabled: false,
      checkIn: checkInConfig,
      health: { status: SiteHealthStatus.Unknown },
      account_info: {
        ...fields.account_info,
        quota: manualQuota ?? 0,
        ...EMPTY_ACCOUNT_INFO_METRICS,
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
            status: ACCOUNT_PERSISTENCE_LOG_STATUSES.SavedBeforeDeferredRefresh,
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
        feedbackLevel: ACCOUNT_SAVE_FEEDBACK_LEVELS.Success,
      }
    } catch (saveError) {
      logger.error(
        "Failed to save account",
        getAccountOperationLogDetails(normalizedSiteType, saveError, {
          siteType: normalizedSiteType,
          status: ACCOUNT_PERSISTENCE_LOG_STATUSES.PersistFailed,
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
          status: ACCOUNT_PERSISTENCE_LOG_STATUSES.Fetching,
        },
      ),
    )
    const accountDataCapability = requireAccountDataCapability(
      normalizedSiteType,
      getSiteTypeCapabilities(normalizedSiteType).account?.data,
    )
    const freshAccountData = await withManualAccountDataFetchTimeout(
      accountDataCapability.fetchData({
        baseUrl: requestBaseUrl,
        siteType: normalizedSiteType,
        checkIn: checkInConfig,
        accountId: undefined, // New account, no ID yet
        exchangeRate: fields.exchange_rate,
        includeTodayCashflow,
        auth: {
          authType,
          userId: requestAccountIdentity,
          accessToken: fields.account_info.access_token,
          cookie: fields.cookieAuth?.sessionCookie,
        },
      }),
    )
    const accountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at" | "user_updated_at"
    > = {
      ...fields,
      health: { status: SiteHealthStatus.Healthy }, // 成功获取数据说明状态正常
      disabled: false,
      checkIn: freshAccountData.checkIn,
      account_info: {
        ...fields.account_info,
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
          status: ACCOUNT_PERSISTENCE_LOG_STATUSES.SavedWithRefresh,
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
      feedbackLevel: ACCOUNT_SAVE_FEEDBACK_LEVELS.Success,
    }
  } catch (error) {
    // FALLBACK: 即使获取数据失败也要保存配置
    logger.warn(
      "Data fetch failed; saving configuration only",
      getAccountOperationLogDetails(normalizedSiteType, error, {
        siteType: normalizedSiteType,
        status: ACCOUNT_PERSISTENCE_LOG_STATUSES.Fallback,
      }),
    )

    const partialAccountData: Omit<
      SiteAccount,
      "id" | "created_at" | "updated_at" | "user_updated_at"
    > = {
      ...fields,
      disabled: false,
      checkIn: checkInConfig,
      health: {
        status: SiteHealthStatus.Warning,
        reason: getAccountHealthFailureReason(normalizedSiteType, error),
      },
      account_info: {
        ...fields.account_info,
        quota: manualQuota ?? 0,
        ...EMPTY_ACCOUNT_INFO_METRICS,
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
            status: ACCOUNT_PERSISTENCE_LOG_STATUSES.SavedWithoutDataRefresh,
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
        feedbackLevel: ACCOUNT_SAVE_FEEDBACK_LEVELS.Warning,
      }
    } catch (saveError) {
      logger.error(
        "Failed to save account",
        getAccountOperationLogDetails(normalizedSiteType, saveError, {
          siteType: normalizedSiteType,
          status: ACCOUNT_PERSISTENCE_LOG_STATUSES.PersistFailed,
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
