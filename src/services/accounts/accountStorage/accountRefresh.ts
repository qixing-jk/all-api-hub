import { CHECK_IN_STATUS_REFRESH_OUTCOMES } from "~/constants/checkIn"
import {
  refreshStoredAccount,
  type RefreshAccountOptions,
} from "~/services/accounts/refresh/refreshStoredAccount"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { SiteAccount } from "~/types"
import { createLogger } from "~/utils/core/logger"

import { accountQueries } from "./accountQueries"

const logger = createLogger("AccountRefresh")

type RefreshAccountsOptions = Pick<
  RefreshAccountOptions,
  "tempWindowRequestSource" | "protectionBypassExecution" | "awaitUsageHistory"
>

class AccountRefresh {
  refreshAccount = refreshStoredAccount

  async refreshAllAccounts(
    force: boolean = false,
    options?: RefreshAccountsOptions,
  ) {
    const accounts = await accountQueries.getEnabledAccounts()
    const results = await this.runAccountRefreshes(accounts, force, options)
    let successCount = 0
    let failedCount = 0
    let refreshedCount = 0
    let checkInStatusFailedCount = 0
    let latestSyncTime = 0
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        successCount += 1
        latestSyncTime = Math.max(
          result.value.account?.last_sync_time || 0,
          latestSyncTime,
        )
        if (result.value.refreshed) refreshedCount += 1
        if (
          result.value.checkInStatusRefreshOutcome ===
          CHECK_IN_STATUS_REFRESH_OUTCOMES.Unavailable
        )
          checkInStatusFailedCount += 1
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
      ...(checkInStatusFailedCount > 0 ? { checkInStatusFailedCount } : {}),
    }
  }

  async refreshDisabledAccounts(
    force: boolean = false,
    options?: RefreshAccountsOptions,
  ) {
    const accounts = (await accountQueries.getAllAccounts()).filter(
      (account) => account.disabled,
    )
    const results = await this.runAccountRefreshes(accounts, force, options, {
      allowDisabled: true,
      reEnableOnSuccess: true,
    })
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

  private async runAccountRefreshes(
    accounts: SiteAccount[],
    force: boolean,
    options: RefreshAccountsOptions | undefined,
    additionalOptions: Pick<
      RefreshAccountOptions,
      "allowDisabled" | "reEnableOnSuccess"
    > = {},
  ) {
    const includeTodayCashflow =
      (await userPreferences.getPreferences()).showTodayCashflow ?? true
    return Promise.allSettled(
      accounts.map((account) =>
        this.refreshAccount(account.id, force, {
          includeTodayCashflow,
          ...(options?.awaitUsageHistory ? { awaitUsageHistory: true } : {}),
          ...additionalOptions,
          ...(options?.tempWindowRequestSource
            ? { tempWindowRequestSource: options.tempWindowRequestSource }
            : {}),
          ...(options?.protectionBypassExecution
            ? { protectionBypassExecution: options.protectionBypassExecution }
            : {}),
        }),
      ),
    )
  }
}

export const accountRefresh = new AccountRefresh()
