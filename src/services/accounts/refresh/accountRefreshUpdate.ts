import { QUOTA_PER_USD } from "~/constants/money"
import type { RefreshAccountResult } from "~/services/accounts/accountDataModel"
import { normalizeAccountSiteSupplementalAuth } from "~/services/accounts/accountSiteProfile/supplementalAuth"
import type { SiteAccount } from "~/types"
import type { DeepPartial } from "~/types/utils"

/** Projects adapter data into a refresh patch without writing stored account state. */
export function buildAccountRefreshUpdate(
  account: SiteAccount,
  result: RefreshAccountResult,
  reEnableOnSuccess: boolean,
): DeepPartial<SiteAccount> {
  const updateData: DeepPartial<SiteAccount> = {
    health: {
      status: result.healthStatus.status,
      reason: result.healthStatus.message,
      code: result.healthStatus.code,
    },
    last_sync_time: Date.now(),
  }
  if (!result.success) return updateData

  updateData.account_info = {
    quota: resolveManualQuota(account.manualBalanceUsd) ?? result.data.quota,
    today_prompt_tokens: result.data.today_prompt_tokens,
    today_completion_tokens: result.data.today_completion_tokens,
    today_quota_consumption: result.data.today_quota_consumption,
    today_requests_count: result.data.today_requests_count,
    today_income: result.data.today_income,
    todayStatsAvailability: result.data.todayStatsAvailability,
    usage: result.data.usage,
    subscription: result.data.subscription,
    nativeBalance: result.data.nativeBalance,
    recentUsageRecords: result.data.recentUsageRecords,
  }
  if (reEnableOnSuccess) updateData.disabled = false

  const authUpdate = result.authUpdate
  if (authUpdate) {
    updateData.account_info = {
      ...updateData.account_info,
      ...(typeof authUpdate.accessToken === "string" &&
      authUpdate.accessToken.trim()
        ? { access_token: authUpdate.accessToken.trim() }
        : {}),
      ...(typeof authUpdate.userId === "string" && authUpdate.userId.trim()
        ? { id: authUpdate.userId.trim() }
        : {}),
      ...(typeof authUpdate.username === "string" && authUpdate.username.trim()
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
    if (authUpdate.kimiOpenPlatformAuth) {
      updateData.kimiOpenPlatformAuth = authUpdate.kimiOpenPlatformAuth
    }
  }

  return updateData
}

/** Converts a valid manual USD balance into the account's quota units. */
function resolveManualQuota(manualBalanceUsd?: string): number | undefined {
  const value = manualBalanceUsd?.trim()
  if (!value) return undefined
  const amount = Number.parseFloat(value)
  if (!Number.isFinite(amount) || amount < 0) return undefined
  return Math.round(amount * QUOTA_PER_USD)
}
