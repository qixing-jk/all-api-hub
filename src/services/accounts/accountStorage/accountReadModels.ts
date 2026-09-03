import type {
  AccountStats,
  AccountStorageConfig,
  DisplaySiteData,
  SiteAccount,
  SiteBookmark,
} from "~/types"
import { createLogger } from "~/utils/core/logger"

import { accountConfigStore } from "./accountConfigStore"
import { accountPresentation } from "./accountPresentation"
import { accountQueries } from "./accountQueries"
import { calculateAccountStats } from "./accountStatistics"

const logger = createLogger("AccountReadModels")

export interface AccountOverviewSnapshot {
  accounts: SiteAccount[]
  displayAccounts: DisplaySiteData[]
  stats: AccountStats
}

export interface AccountManagementSnapshot extends AccountOverviewSnapshot {
  bookmarks: SiteBookmark[]
  pinnedIds: string[]
  orderedIds: string[]
}

const projectOverview = (
  config: Pick<AccountStorageConfig, "accounts">,
): AccountOverviewSnapshot => ({
  accounts: config.accounts,
  displayAccounts: accountPresentation.convertToDisplayData(config.accounts),
  stats: calculateAccountStats(config.accounts),
})

class AccountReadModels {
  async getAccountOverviewSnapshot(): Promise<AccountOverviewSnapshot> {
    const accounts = await accountQueries.getAllAccounts()
    return projectOverview({ accounts })
  }

  async getAccountManagementSnapshot(): Promise<AccountManagementSnapshot> {
    try {
      const config = await accountConfigStore.readMigratedEnvelope()
      return {
        ...projectOverview(config),
        bookmarks: config.bookmarks,
        pinnedIds: config.pinnedAccountIds,
        orderedIds: config.orderedAccountIds,
      }
    } catch (error) {
      logger.error("加载账号管理快照失败", error)
      return {
        ...projectOverview({ accounts: [] }),
        bookmarks: [],
        pinnedIds: [],
        orderedIds: [],
      }
    }
  }

  async getDisplayDataById(id: string): Promise<DisplaySiteData | null> {
    const accounts = await accountQueries.getAllAccounts()
    const account = accounts.find((item) => item.id === id)
    return account
      ? accountPresentation.resolveDisplayData(account, accounts)
      : null
  }
}

export const accountReadModels = new AccountReadModels()
