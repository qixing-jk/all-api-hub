import { SITE_TYPES } from "~/constants/siteType"
import type { RefreshAccountResult } from "~/services/accounts/accountDataModel"
import { normalizeAccountSiteSupplementalAuth } from "~/services/accounts/accountSiteProfile/supplementalAuth"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { AccountUpdateUserTimestampMode } from "~/services/accounts/editing/accountDefaults"
import { normalizeAccountTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStats"
import { buildAccountRefreshUpdate } from "~/services/accounts/refresh/accountRefreshUpdate"
import { ACCOUNT_REFRESH_SKIP_REASONS } from "~/services/accounts/refresh/constants"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { discoverSavedAccountCheckIn } from "~/services/checkin/autoCheckin/discovery/postSaveDiscovery"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { maybeCaptureDailyBalanceSnapshot } from "~/services/history/dailyBalanceHistory/capture"
import { usageHistoryScheduler } from "~/services/history/usageHistory/scheduler"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import { getAccountSiteType } from "~/services/siteDetection/detectSiteType"
import { SiteHealthStatus, type SiteAccount } from "~/types"
import type { DailyBalanceHistoryCaptureSource } from "~/types/dailyBalanceHistory"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import type { DeepPartial } from "~/types/utils"
import { deepOverride } from "~/utils"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { tryParseOrigin } from "~/utils/core/urlParsing"
import { t } from "~/utils/i18n/core"

const logger = createLogger("AccountRefresh")

const createMissingAccountRefreshResult = (
  siteType: string,
): RefreshAccountResult => ({
  success: false,
  healthStatus: {
    status: SiteHealthStatus.Unknown,
    message: `accountRefresh is not implemented for ${siteType}`,
    code: undefined,
  },
})

export type RefreshAccountOptions = {
  /** Read-only discovery requested by a successful user save, never a periodic refresh. */
  discoverCheckInAfterSave?: boolean
  includeTodayCashflow?: boolean
  balanceHistoryCaptureSource?: DailyBalanceHistoryCaptureSource
  allowDisabled?: boolean
  reEnableOnSuccess?: boolean
  tempWindowRequestSource?: TempWindowRequestSource
  protectionBypassExecution?: ProtectionBypassExecution
}

interface StoredAccountRefreshResult {
  account: SiteAccount | null
  refreshed: boolean
  reEnabled?: boolean
  skippedReason?: (typeof ACCOUNT_REFRESH_SKIP_REASONS)[keyof typeof ACCOUNT_REFRESH_SKIP_REASONS]
}

interface RefreshAttempt {
  result: StoredAccountRefreshResult
  /** A successful adapter result accepted by storage, before optional follow-ups. */
  followUpAccount: SiteAccount | null
}

/** Refreshes one saved account and runs follow-ups after releasing credential locks. */
export async function refreshStoredAccount(
  id: string,
  force: boolean = false,
  options?: RefreshAccountOptions,
): Promise<StoredAccountRefreshResult | null> {
  try {
    const account = await accountQueries.getAccountById(id)
    const shouldSerializeSub2ApiRefresh =
      account &&
      Boolean(
        normalizeAccountSiteSupplementalAuth({
          siteType: account.site_type,
          sub2apiAuth: account.sub2apiAuth,
        }).sub2apiAuth,
      )
    const runRefresh = () => runRefreshAttempt(id, force, options)
    const attempt = shouldSerializeSub2ApiRefresh
      ? await withExtensionStorageWriteLock(
          `all-api-hub:sub2api-refresh:${id}`,
          runRefresh,
        )
      : await runRefresh()
    return await runRefreshFollowUps(id, attempt, options)
  } catch (error) {
    logger.error("刷新账号数据失败", { accountId: id, error })
    try {
      await accountMutations.updateAccount(
        id,
        {
          health: {
            status: SiteHealthStatus.Unknown,
            reason: getErrorMessage(error),
            code: undefined,
          },
          last_sync_time: Date.now(),
        },
        { userTimestampMode: AccountUpdateUserTimestampMode.Preserve },
      )
    } catch (updateError) {
      logger.error("更新健康状态失败", { accountId: id, error: updateError })
    }
    return null
  }
}

/** Fetches and persists an account refresh within any required credential lock. */
async function runRefreshAttempt(
  id: string,
  force: boolean,
  options?: RefreshAccountOptions,
): Promise<RefreshAttempt> {
  let account = await accountQueries.getAccountById(id)
  if (!account) {
    throw new Error(t("messages:storage.accountNotFound", { id }))
  }
  if (account.disabled && options?.allowDisabled !== true) {
    logger.debug("账号已禁用，跳过刷新", {
      accountId: account.id,
      siteName: account.site_name,
    })
    return {
      result: {
        account,
        refreshed: false,
        skippedReason: ACCOUNT_REFRESH_SKIP_REASONS.AccountDisabled,
      },
      followUpAccount: null,
    }
  }

  account = await refreshSiteMetadataIfNeeded(
    account,
    options?.protectionBypassExecution,
  )
  if (await shouldSkipRefresh(account, force)) {
    logger.debug("账号刷新间隔未到，跳过刷新", {
      accountId: account.id,
      siteName: account.site_name,
    })
    return { result: { account, refreshed: false }, followUpAccount: null }
  }

  const prefs = await userPreferences.getPreferences()
  const includeTodayCashflow =
    options?.includeTodayCashflow ?? prefs.showTodayCashflow ?? true
  const result = await fetchAccountRefresh(
    account,
    includeTodayCashflow,
    options,
  )

  const updateData = buildAccountRefreshUpdate(
    account,
    result,
    options?.reEnableOnSuccess === true,
  )
  const shouldReEnable = updateData.disabled === false
  const refreshedCheckIn = result.success ? result.data.checkIn : undefined
  if (result.success) {
    try {
      await maybeCaptureDailyBalanceSnapshot({
        config: prefs.balanceHistory,
        accountId: account.id,
        quota: updateData.account_info?.quota ?? result.data.quota,
        nativeBalance: result.data.nativeBalance,
        today_income: result.data.today_income,
        today_quota_consumption: result.data.today_quota_consumption,
        todayStatsAvailability: normalizeAccountTodayStatsAvailability(
          result.data.todayStatsAvailability,
        ),
        source: options?.balanceHistoryCaptureSource ?? "refresh",
      })
    } catch (error) {
      logger.debug("Failed to capture daily balance snapshot", {
        accountId: account.id,
        error,
      })
    }
  }

  const didPersist = await accountMutations.updateAccountFromRefresh(
    id,
    updateData,
    refreshedCheckIn,
    account,
  )
  const updatedAccount = didPersist
    ? await accountQueries.getAccountById(id)
    : account
  const followUpAccount = didPersist && result.success ? updatedAccount : null
  const reEnabled =
    didPersist && shouldReEnable && updatedAccount?.disabled === false

  if (account.health?.status !== result.healthStatus.status) {
    logger.info("账号健康状态变化", {
      accountId: account.id,
      siteName: account.site_name,
      from: account.health?.status,
      to: result.healthStatus.status,
      detail: result.healthStatus.message,
    })
  }
  return {
    result: { account: updatedAccount, refreshed: true, reEnabled },
    followUpAccount,
  }
}

/** Dispatches the account's credentials and refresh options to its adapter. */
async function fetchAccountRefresh(
  account: SiteAccount,
  includeTodayCashflow: boolean,
  options?: RefreshAccountOptions,
): Promise<RefreshAccountResult> {
  const baseUrl = tryParseOrigin(account.site_url) ?? account.site_url
  const auth = {
    authType: account.authType,
    userId: account.account_info.id,
    accessToken: account.account_info.access_token,
    cookie: account.cookieAuth?.sessionCookie,
    refreshToken: account.sub2apiAuth?.refreshToken,
    tokenExpiresAt: account.sub2apiAuth?.tokenExpiresAt,
  }
  const accountRefresh = getSiteTypeCapabilities(account.site_type).account
    ?.refresh
  return accountRefresh
    ? await accountRefresh.refreshAccount({
        baseUrl,
        accountId: account.id,
        checkIn: account.checkIn,
        siteType: account.site_type,
        exchangeRate: account.exchange_rate,
        auth,
        includeTodayCashflow,
        ...(options?.tempWindowRequestSource
          ? { tempWindowRequestSource: options.tempWindowRequestSource }
          : {}),
        ...(options?.protectionBypassExecution
          ? { protectionBypassExecution: options.protectionBypassExecution }
          : {}),
      })
    : createMissingAccountRefreshResult(account.site_type)
}

/** Runs optional discovery and schedules history after the refresh lock is released. */
async function runRefreshFollowUps(
  id: string,
  attempt: RefreshAttempt,
  options?: RefreshAccountOptions,
): Promise<StoredAccountRefreshResult> {
  const refreshedResult = attempt.result
  const shouldSyncUsageHistory = Boolean(
    attempt.followUpAccount && !attempt.followUpAccount.disabled,
  )
  // Release refresh-token serialization before optional, slow read-only discovery.
  if (
    attempt.followUpAccount &&
    options?.discoverCheckInAfterSave &&
    refreshedResult.account
  ) {
    try {
      refreshedResult.account =
        (await discoverSavedAccountCheckIn(refreshedResult.account, {
          tempWindowRequestSource: options?.tempWindowRequestSource,
          protectionBypassExecution: options?.protectionBypassExecution,
        })) ?? refreshedResult.account
    } catch (error) {
      logger.warn("Post-save discovery failed after a successful refresh", {
        accountId: id,
        error: getErrorMessage(error),
      })
    }
  }
  // All refresh callers share this follow-up, after persistence and outside
  // refresh-token serialization. History failures never fail the refresh.
  if (shouldSyncUsageHistory) {
    void usageHistoryScheduler.runAfterRefreshSync([id]).catch((error) => {
      logger.warn("Usage-history sync after account refresh failed", error)
    })
  }
  return refreshedResult
}

/** Applies the configured minimum interval unless the caller forces a refresh. */
async function shouldSkipRefresh(
  account: SiteAccount,
  force: boolean = false,
): Promise<boolean> {
  if (force) return false
  const preferences = await userPreferences.getPreferences()
  return (
    Date.now() - (account.last_sync_time || 0) <
    preferences.accountAutoRefresh.minInterval * 1000
  )
}

/** Recovers unknown site identity without changing the user's edit timestamp. */
async function refreshSiteMetadataIfNeeded(
  account: SiteAccount,
  protectionBypassExecution?: ProtectionBypassExecution,
): Promise<SiteAccount> {
  const normalizedUrl = tryParseOrigin(account.site_url)
  if (
    !normalizedUrl ||
    (account.site_type && account.site_type !== SITE_TYPES.UNKNOWN)
  ) {
    return account
  }
  const updates: DeepPartial<SiteAccount> = {}
  try {
    const detectedType = await getAccountSiteType(
      normalizedUrl,
      protectionBypassExecution,
    )
    if (detectedType && detectedType !== SITE_TYPES.UNKNOWN) {
      updates.site_type = detectedType
    }
  } catch (error) {
    logger.warn("Failed to detect site type", {
      baseUrl: normalizedUrl,
      error,
    })
  }
  if (Object.keys(updates).length === 0) return account

  const success = await accountMutations.updateAccount(account.id, updates, {
    userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
  })
  if (success) {
    const refreshed = await accountQueries.getAccountById(account.id)
    if (refreshed) return refreshed
  }
  return deepOverride<SiteAccount>(account, updates)
}
