import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { AccountUpdateUserTimestampMode } from "~/services/accounts/accountDefaults"
import { isValidAccount } from "~/services/accounts/accountFormValidation"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import {
  ACCOUNT_PERSISTENCE_LOG_STATUSES,
  ACCOUNT_SAVE_FEEDBACK_LEVELS,
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
import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { resolveOpenRouterAccountUserId } from "~/services/apiAdapters/openrouter/accountIdentity"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { OpenRouterManagementKeyValidation } from "~/services/apiService/openrouter"
import { userPreferences } from "~/services/preferences/userPreferences"
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
import { t } from "~/utils/i18n/core"

interface ValidateAndUpdateAccountOptions {
  deferDataRefresh?: boolean
  selectionChanged?: boolean
  discoveryBaseSelection?: CheckInMethodSelection
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
      existingAccount = (await accountQueries.getAllAccountsOrThrow()).find(
        (account) => account.id === accountId,
      )
    } catch {
      logger.error("Failed to load account for update", {
        siteType: normalizedSiteType,
        status: ACCOUNT_PERSISTENCE_LOG_STATUSES.LoadFailed,
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
        status: ACCOUNT_PERSISTENCE_LOG_STATUSES.NotFound,
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
      status: ACCOUNT_PERSISTENCE_LOG_STATUSES.Rejected,
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
    const updateData = {
      ...fields,
      account_info: {
        ...fields.account_info,
        ...(manualQuota === undefined ? {} : { quota: manualQuota }),
      },
    }

    const success = await accountCheckInState.updateAccountWithCheckInDraft(
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
          status: ACCOUNT_PERSISTENCE_LOG_STATUSES.UpdatedBeforeDeferredRefresh,
        },
      ),
    )

    return {
      success: true,
      message: t("messages:toast.success.accountUpdateSuccess"),
      accountId,
      feedbackLevel: ACCOUNT_SAVE_FEEDBACK_LEVELS.Success,
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
          status: ACCOUNT_PERSISTENCE_LOG_STATUSES.Fetching,
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
      exchangeRate: fields.exchange_rate,
      includeTodayCashflow,
      auth: {
        authType,
        userId: requestAccountIdentity,
        accessToken: fields.account_info.access_token,
        cookie: fields.cookieAuth?.sessionCookie,
      },
    })
    const updateData: Partial<
      Omit<SiteAccount, "id" | "created_at" | "updated_at" | "user_updated_at">
    > = {
      ...fields,
      health: { status: SiteHealthStatus.Healthy }, // 成功获取数据说明状态正常
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

    const success = await accountCheckInState.updateAccountWithCheckInDraft(
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
          status: ACCOUNT_PERSISTENCE_LOG_STATUSES.UpdatedWithRefresh,
        },
      ),
    )

    return {
      success: true,
      message: t("messages:toast.success.accountUpdateSuccess"),
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

    const partialUpdateData = {
      ...fields,
      health: {
        status: SiteHealthStatus.Warning,
        reason: getAccountHealthFailureReason(normalizedSiteType, error),
      },
      account_info: {
        ...fields.account_info,
        ...(manualQuota === undefined ? {} : { quota: manualQuota }),
      },
      last_sync_time: Date.now(),
    }

    // Try to save partial update
    const success = await accountCheckInState.updateAccountWithCheckInDraft(
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
      feedbackLevel: ACCOUNT_SAVE_FEEDBACK_LEVELS.Warning,
    }
  }
}
