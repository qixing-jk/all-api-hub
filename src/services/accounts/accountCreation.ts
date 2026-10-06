/** Account creation workflow. */

import {
  createLoginProviderClaimGuard,
  LoginProviderClaimConflictError,
} from "~/services/accountLogin/providerClaims"
import { withManualAccountDataFetchTimeout } from "~/services/accounts/accountCreationTimeout"
import { isValidAccount } from "~/services/accounts/accountFormValidation"
import { autoProvisionKeyOnAccountAdd } from "~/services/accounts/accountKeyAutoProvisioning/autoProvisionOnAccountAdd"
import {
  ACCOUNT_PERSISTENCE_LOG_STATUSES,
  ACCOUNT_SAVE_FEEDBACK_LEVELS,
  EMPTY_ACCOUNT_INFO_METRICS,
} from "~/services/accounts/accountPersistence/constants"
import {
  normalizeAccountSaveInput,
  type AccountCreateRequest,
} from "~/services/accounts/accountPersistence/request"
import {
  buildAccountPersistenceContext,
  getAccountHealthFailureReason,
  getAccountOperationLogDetails,
  getCredentialValidationMessage,
  accountPersistenceLogger as logger,
  prepareAccountPersistenceIdentity,
  requireAccountDataCapability,
} from "~/services/accounts/accountPersistence/shared"
import { getAccountSiteProductProfile } from "~/services/accounts/accountSiteProfile"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { SiteHealthStatus, type SiteAccount } from "~/types"
import type { AccountSaveResponse } from "~/types/serviceResponse"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

/** Validates form data and persists an account addition. */
export async function validateAndSaveAccount(
  request: AccountCreateRequest,
): Promise<AccountSaveResponse> {
  const {
    url,
    siteName,
    username,
    accessToken,
    userId,
    exchangeRate,
    notes,
    tagIds,
    checkInConfig,
    siteType,
    authType,
    cookieAuthSessionCookie,
    manualBalanceUsd,
    excludeFromTotalBalance,
    excludeFromTodayIncome,
    sub2apiAuth,
    normalizedSiteType,
    sessionCookieHeader,
  } = normalizeAccountSaveInput(request)
  const { options = {} } = request

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

  let accountIdentity: string
  try {
    accountIdentity = await prepareAccountPersistenceIdentity({
      siteType: normalizedSiteType,
      accessToken,
      userId,
    })
  } catch (error) {
    logger.warn("Account credential validation failed", {
      siteType: normalizedSiteType,
      status: ACCOUNT_PERSISTENCE_LOG_STATUSES.Rejected,
    })
    return {
      success: false,
      message: getCredentialValidationMessage(normalizedSiteType, error),
    }
  }

  // Two enabled AgentRouter accounts cannot share one browser login context. The
  // guard is evaluated inside the account storage transaction below, so two
  // concurrent saves cannot both pass it.
  const loginProviderGuard = await createLoginProviderClaimGuard({
    siteUrl: url,
  })

  const productProfile = getAccountSiteProductProfile(normalizedSiteType)
  let shouldAutoProvisionKeyOnAccountAdd =
    DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAdd ?? false
  let autoProvisionKeyOnAccountAddMode =
    DEFAULT_PREFERENCES.autoProvisionKeyOnAccountAddMode
  let includeTodayCashflow = DEFAULT_PREFERENCES.showTodayCashflow ?? true
  try {
    const prefs = await userPreferences.getPreferences()
    shouldAutoProvisionKeyOnAccountAdd =
      prefs.autoProvisionKeyOnAccountAdd ?? shouldAutoProvisionKeyOnAccountAdd
    autoProvisionKeyOnAccountAddMode = prefs.autoProvisionKeyOnAccountAddMode
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
    kimiOpenPlatformAuth: options.kimiOpenPlatformAuth,
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
      const accountId = await accountMutations.addAccount(accountData, {
        guard: loginProviderGuard,
      })
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
          autoProvisionKeyOnAccountAddMode,
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
      if (saveError instanceof LoginProviderClaimConflictError) {
        return { success: false, message: saveError.message }
      }
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

    const accountId = await accountMutations.addAccount(accountData, {
      guard: loginProviderGuard,
    })
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
        autoProvisionKeyOnAccountAddMode,
      )
    }

    return {
      success: true,
      message: t("messages:toast.success.accountSaveSuccess"),
      accountId,
      feedbackLevel: ACCOUNT_SAVE_FEEDBACK_LEVELS.Success,
    }
  } catch (error) {
    // A refused claim is decided, not a data failure: the fallback save would be
    // rejected for the same reason, so report it instead of retrying.
    if (error instanceof LoginProviderClaimConflictError) {
      return { success: false, message: error.message }
    }
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
      const accountId = await accountMutations.addAccount(partialAccountData, {
        guard: loginProviderGuard,
      })
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
          autoProvisionKeyOnAccountAddMode,
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
      if (saveError instanceof LoginProviderClaimConflictError) {
        return { success: false, message: saveError.message }
      }
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
