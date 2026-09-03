import { SITE_TYPES } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import type { RefreshAccountResult } from "~/services/accounts/accountDataModel"
import { AccountUpdateUserTimestampMode } from "~/services/accounts/accountDefaults"
import { normalizeAccountSiteSupplementalAuth } from "~/services/accounts/accountSiteProfile"
import { normalizeAccountTodayStatsAvailability } from "~/services/accounts/accountTodayStats"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { maybeCaptureDailyBalanceSnapshot } from "~/services/history/dailyBalanceHistory/capture"
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
import { t } from "~/utils/i18n/core"

import { accountCheckInState } from "./accountCheckInState"
import { accountMutations } from "./accountMutations"
import { accountQueries } from "./accountQueries"

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
  includeTodayCashflow?: boolean
  balanceHistoryCaptureSource?: DailyBalanceHistoryCaptureSource
  allowDisabled?: boolean
  reEnableOnSuccess?: boolean
  tempWindowRequestSource?: TempWindowRequestSource
  protectionBypassExecution?: ProtectionBypassExecution
}

export type RefreshAccountsOptions = Pick<
  RefreshAccountOptions,
  "tempWindowRequestSource" | "protectionBypassExecution"
>

class AccountRefresh {
  async refreshAccount(
    id: string,
    force: boolean = false,
    options?: RefreshAccountOptions,
  ) {
    const runRefresh = async () => {
      let account = await accountQueries.getAccountById(id)
      if (!account) {
        throw new Error(t("messages:storage.accountNotFound", { id }))
      }
      if (account.disabled && options?.allowDisabled !== true) {
        logger.debug("账号已禁用，跳过刷新", {
          accountId: account.id,
          siteName: account.site_name,
        })
        return { account, refreshed: false, skippedReason: "account_disabled" }
      }

      account = await this.refreshSiteMetadataIfNeeded(
        account,
        options?.protectionBypassExecution,
      )
      if (await this.shouldSkipRefresh(account, force)) {
        logger.debug("账号刷新间隔未到，跳过刷新", {
          accountId: account.id,
          siteName: account.site_name,
        })
        return { account, refreshed: false }
      }

      const baseUrl =
        this.normalizeBaseUrl(account.site_url) ?? account.site_url
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
      const prefs = await userPreferences.getPreferences()
      const includeTodayCashflow =
        options?.includeTodayCashflow ?? prefs.showTodayCashflow ?? true
      const result = accountRefresh
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

      const updateData: Partial<
        Omit<
          SiteAccount,
          "id" | "created_at" | "updated_at" | "user_updated_at"
        >
      > = {
        health: {
          status: result.healthStatus.status,
          reason: result.healthStatus.message,
          code: result.healthStatus.code,
        },
        last_sync_time: Date.now(),
      }
      const shouldReEnable = Boolean(
        options?.reEnableOnSuccess === true && result.success,
      )
      let refreshedCheckIn: SiteAccount["checkIn"] | undefined

      if (result.success) {
        const manualBalanceUsd = account.manualBalanceUsd?.trim()
        const manualQuota =
          manualBalanceUsd && manualBalanceUsd.length > 0
            ? (() => {
                const amount = Number.parseFloat(manualBalanceUsd)
                if (!Number.isFinite(amount) || amount < 0) return undefined
                return Math.round(
                  amount * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
                )
              })()
            : undefined

        refreshedCheckIn = result.data.checkIn
        updateData.account_info = {
          ...account.account_info,
          quota: manualQuota ?? result.data.quota,
          today_prompt_tokens: result.data.today_prompt_tokens,
          today_completion_tokens: result.data.today_completion_tokens,
          today_quota_consumption: result.data.today_quota_consumption,
          today_requests_count: result.data.today_requests_count,
          today_income: result.data.today_income,
          todayStatsAvailability: result.data.todayStatsAvailability,
          usage: result.data.usage,
          subscription: result.data.subscription,
          recentUsageRecords: result.data.recentUsageRecords,
        }
        if (shouldReEnable) updateData.disabled = false

        const authUpdate = result.authUpdate
        if (authUpdate) {
          updateData.account_info = {
            ...(updateData.account_info || account.account_info),
            ...(typeof authUpdate.accessToken === "string" &&
            authUpdate.accessToken.trim()
              ? { access_token: authUpdate.accessToken.trim() }
              : {}),
            ...(typeof authUpdate.userId === "string" &&
            authUpdate.userId.trim()
              ? { id: authUpdate.userId.trim() }
              : {}),
            ...(typeof authUpdate.username === "string" &&
            authUpdate.username.trim()
              ? { username: authUpdate.username.trim() }
              : {}),
          }
          const supplementalAuth = normalizeAccountSiteSupplementalAuth({
            siteType: account.site_type,
            sub2apiAuth: authUpdate.sub2apiAuth,
          })
          if (supplementalAuth.sub2apiAuth) {
            updateData.sub2apiAuth = supplementalAuth.sub2apiAuth
          }
        }

        try {
          await maybeCaptureDailyBalanceSnapshot({
            config: prefs.balanceHistory,
            accountId: account.id,
            quota: manualQuota ?? result.data.quota,
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

      const didPersist = await accountCheckInState.updateAccountFromRefresh(
        id,
        updateData,
        refreshedCheckIn,
      )
      const updatedAccount = didPersist
        ? await accountQueries.getAccountById(id)
        : account
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
      return { account: updatedAccount, refreshed: true, reEnabled }
    }

    try {
      const account = await accountQueries.getAccountById(id)
      const shouldSerializeSub2ApiRefresh =
        account?.site_type === SITE_TYPES.SUB2API &&
        typeof account.sub2apiAuth?.refreshToken === "string" &&
        account.sub2apiAuth.refreshToken.trim().length > 0
      return shouldSerializeSub2ApiRefresh
        ? await withExtensionStorageWriteLock(
            `all-api-hub:sub2api-refresh:${id}`,
            runRefresh,
          )
        : await runRefresh()
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

  async refreshAllAccounts(
    force: boolean = false,
    options?: RefreshAccountsOptions,
  ) {
    const accounts = await accountQueries.getEnabledAccounts()
    const includeTodayCashflow =
      (await userPreferences.getPreferences()).showTodayCashflow ?? true
    const results = await Promise.allSettled(
      accounts.map((account) =>
        this.refreshAccount(account.id, force, {
          includeTodayCashflow,
          ...(options?.tempWindowRequestSource
            ? { tempWindowRequestSource: options.tempWindowRequestSource }
            : {}),
          ...(options?.protectionBypassExecution
            ? { protectionBypassExecution: options.protectionBypassExecution }
            : {}),
        }),
      ),
    )
    let successCount = 0
    let failedCount = 0
    let refreshedCount = 0
    let latestSyncTime = 0
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        successCount += 1
        latestSyncTime = Math.max(
          result.value.account?.last_sync_time || 0,
          latestSyncTime,
        )
        if (result.value.refreshed) refreshedCount += 1
      } else {
        failedCount += 1
        logger.error("刷新账号失败", {
          accountId: accounts[index]?.id,
          siteName: accounts[index]?.site_name,
          reason: result.status === "rejected" ? result.reason : "未知错误",
        })
      }
    })
    return {
      success: successCount,
      failed: failedCount,
      latestSyncTime,
      refreshedCount,
    }
  }

  async refreshDisabledAccounts(
    force: boolean = false,
    options?: RefreshAccountsOptions,
  ) {
    const accounts = (await accountQueries.getAllAccounts()).filter(
      (account) => account.disabled,
    )
    const includeTodayCashflow =
      (await userPreferences.getPreferences()).showTodayCashflow ?? true
    const results = await Promise.allSettled(
      accounts.map((account) =>
        this.refreshAccount(account.id, force, {
          includeTodayCashflow,
          allowDisabled: true,
          reEnableOnSuccess: true,
          ...(options?.tempWindowRequestSource
            ? { tempWindowRequestSource: options.tempWindowRequestSource }
            : {}),
          ...(options?.protectionBypassExecution
            ? { protectionBypassExecution: options.protectionBypassExecution }
            : {}),
        }),
      ),
    )
    let processedCount = 0
    let failedCount = 0
    let reEnabledCount = 0
    let latestSyncTime = 0
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value?.refreshed) {
        processedCount += 1
        latestSyncTime = Math.max(
          result.value.account?.last_sync_time || 0,
          latestSyncTime,
        )
        if (result.value.reEnabled) reEnabledCount += 1
      } else if (!(result.status === "fulfilled" && result.value)) {
        failedCount += 1
        logger.error("刷新已禁用账号失败", {
          accountId: accounts[index]?.id,
          siteName: accounts[index]?.site_name,
          reason: result.status === "rejected" ? result.reason : "未知错误",
        })
      }
    })
    return { processedCount, failedCount, reEnabledCount, latestSyncTime }
  }

  private async shouldSkipRefresh(
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

  private normalizeBaseUrl(url?: string): string | null {
    if (!url) return null
    try {
      const parsed = new URL(url)
      return `${parsed.protocol}//${parsed.host}`
    } catch {
      return null
    }
  }

  private async refreshSiteMetadataIfNeeded(
    account: SiteAccount,
    protectionBypassExecution?: ProtectionBypassExecution,
  ): Promise<SiteAccount> {
    const normalizedUrl = this.normalizeBaseUrl(account.site_url)
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
}

export const accountRefresh = new AccountRefresh()
