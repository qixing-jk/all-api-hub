import { normalizeSiteAccount } from "~/services/accounts/accountDefaults"
import { resolveAccountTodayStatsAvailability } from "~/services/accounts/accountTodayStatsResolver"
import {
  collectDuplicateAccountNameKeys,
  resolveAccountDisplayName,
} from "~/services/accounts/utils/accountDisplayName"
import type { DisplaySiteData, SiteAccount } from "~/types"
import { convertQuotaToCurrencyAmounts } from "~/utils/core/money"

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
    const normalizedInput = Array.isArray(input)
      ? input.map(normalizeSiteAccount)
      : normalizeSiteAccount(input)
    const normalizedAccounts = Array.isArray(normalizedInput)
      ? normalizedInput
      : [normalizedInput]
    const normalizedContext = displayNameAccountsContext
      ? displayNameAccountsContext.map(normalizeSiteAccount)
      : normalizedAccounts
    const duplicateKeys = collectDuplicateAccountNameKeys(normalizedContext)

    const transform = (account: SiteAccount): DisplaySiteData => ({
      id: account.id,
      exchangeRate: account.exchange_rate,
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
      balance: convertQuotaToCurrencyAmounts(
        account.account_info.quota,
        account.exchange_rate,
      ),
      todayConsumption: convertQuotaToCurrencyAmounts(
        account.account_info.today_quota_consumption,
        account.exchange_rate,
      ),
      todayIncome: convertQuotaToCurrencyAmounts(
        account.account_info.today_income,
        account.exchange_rate,
      ),
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

    return Array.isArray(normalizedInput)
      ? normalizedAccounts.map(transform)
      : transform(normalizedInput)
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
    return this.convertToDisplayData(normalizedAccount, contextWithAccount)
  }
}

export const accountPresentation = new AccountPresentation()
