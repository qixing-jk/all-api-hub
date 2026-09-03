import { UI_CONSTANTS } from "~/constants/ui"
import { normalizeSiteAccount } from "~/services/accounts/accountDefaults"
import { resolveAccountTodayStatsAvailability } from "~/services/accounts/accountTodayStatsResolver"
import {
  collectDuplicateAccountNameKeys,
  resolveAccountDisplayName,
} from "~/services/accounts/utils/accountDisplayName"
import type { DisplaySiteData, SiteAccount } from "~/types"

class AccountPresentation {
  convertToDisplayData(
    input: SiteAccount,
    displayNameAccountsContext?: readonly SiteAccount[],
  ): DisplaySiteData
  convertToDisplayData(
    input: SiteAccount[],
    displayNameAccountsContext?: readonly SiteAccount[],
  ): DisplaySiteData[]
  convertToDisplayData(
    input: SiteAccount | SiteAccount[],
    displayNameAccountsContext?: readonly SiteAccount[],
  ): DisplaySiteData | DisplaySiteData[] {
    const normalizedAccounts = Array.isArray(input)
      ? input.map(normalizeSiteAccount)
      : [normalizeSiteAccount(input)]
    const normalizedContext = displayNameAccountsContext
      ? displayNameAccountsContext.map(normalizeSiteAccount)
      : normalizedAccounts
    const duplicateKeys = collectDuplicateAccountNameKeys(normalizedContext)

    const transform = (account: SiteAccount): DisplaySiteData => ({
      id: account.id,
      name: resolveAccountDisplayName({
        baseName: account.site_name,
        username: account.account_info.username,
        duplicateKeys,
      }),
      baseName: account.site_name,
      username: account.account_info.username,
      disabled: account.disabled,
      excludeFromTotalBalance: account.excludeFromTotalBalance,
      excludeFromTodayIncome: account.excludeFromTodayIncome,
      balance: {
        USD:
          account.account_info.quota /
          UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
        CNY:
          (account.account_info.quota /
            UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR) *
          account.exchange_rate,
      },
      todayConsumption: {
        USD:
          account.account_info.today_quota_consumption /
          UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
        CNY:
          (account.account_info.today_quota_consumption /
            UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR) *
          account.exchange_rate,
      },
      todayIncome: {
        USD:
          account.account_info.today_income /
          UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR,
        CNY:
          (account.account_info.today_income /
            UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR) *
          account.exchange_rate,
      },
      todayTokens: {
        upload: account.account_info.today_prompt_tokens,
        download: account.account_info.today_completion_tokens,
      },
      todayStatsAvailability: resolveAccountTodayStatsAvailability(account),
      usage: account.account_info.usage,
      subscription: account.account_info.subscription,
      recentUsageRecords: account.account_info.recentUsageRecords,
      health: account.health,
      last_sync_time: account.last_sync_time,
      created_at: account.created_at,
      baseUrl: account.site_url,
      token: account.account_info.access_token,
      userId: account.account_info.id,
      notes: account.notes,
      tagIds: account.tagIds,
      tags: account.tags,
      siteType: account.site_type,
      checkIn: account.checkIn,
      authType: account.authType,
      cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
    })

    return Array.isArray(input)
      ? normalizedAccounts.map(transform)
      : transform(normalizedAccounts[0])
  }

  resolveDisplayData(
    account: SiteAccount,
    accountsContext: SiteAccount[] = [],
  ): DisplaySiteData {
    const normalizedAccount = normalizeSiteAccount(account)
    const contextWithAccount = Array.from(
      new Map(
        [...accountsContext.map(normalizeSiteAccount), normalizedAccount].map(
          (item) => [item.id, item],
        ),
      ).values(),
    )
    return (
      this.convertToDisplayData(contextWithAccount).find(
        (displayAccount) => displayAccount.id === normalizedAccount.id,
      ) ?? this.convertToDisplayData(normalizedAccount, contextWithAccount)
    )
  }
}

export const accountPresentation = new AccountPresentation()
