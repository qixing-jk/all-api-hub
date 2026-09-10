import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import {
  isAccountSiteProfileUrl,
  normalizeAccountSiteProfileUrlForOriginKey,
} from "~/services/accounts/accountSiteProfile"
import type { SiteAccount } from "~/types"
import { createLogger } from "~/utils/core/logger"

import { accountConfigStore } from "./accountConfigStore"

const logger = createLogger("AccountQueries")

class AccountQueries {
  async getAllAccounts(): Promise<SiteAccount[]> {
    try {
      return await this.getAllAccountsOrThrow()
    } catch (error) {
      logger.error("获取账号信息失败", error)
      return []
    }
  }

  async getAllAccountsOrThrow(): Promise<SiteAccount[]> {
    return accountConfigStore.readAccounts()
  }

  async getEnabledAccounts(): Promise<SiteAccount[]> {
    return (await this.getAllAccounts()).filter((account) => !account.disabled)
  }

  async getAccountById(id: string): Promise<SiteAccount | null> {
    return (
      (await this.getAllAccounts()).find((account) => account.id === id) || null
    )
  }

  async getAccountByBaseUrlAndUserId(
    baseUrl: string,
    userId?: string | number,
  ): Promise<SiteAccount | null> {
    try {
      logger.debug("Searching for account by baseUrl + userId", {
        baseUrl,
        userId,
      })
      const normalizedUserId = normalizeAccountIdentity(userId)
      if (!normalizedUserId) return null

      const account = (await this.getAllAccounts()).find((candidate) => {
        if (
          normalizeAccountIdentity(candidate.account_info.id) !==
          normalizedUserId
        ) {
          return false
        }
        if (candidate.site_url === baseUrl) return true
        if (!isAccountSiteProfileUrl(candidate.site_type, baseUrl)) return false

        const requestedOriginKey = normalizeAccountSiteProfileUrlForOriginKey({
          siteType: candidate.site_type,
          url: baseUrl,
        })
        return Boolean(
          requestedOriginKey &&
            normalizeAccountSiteProfileUrlForOriginKey({
              siteType: candidate.site_type,
              url: candidate.site_url,
            }) === requestedOriginKey,
        )
      })

      if (account) {
        logger.debug("Account found", {
          accountId: account.id,
          siteName: account.site_name,
        })
      } else {
        logger.debug("No account found", { baseUrl, userId })
      }
      return account || null
    } catch (error) {
      logger.error("Failed to get account by baseUrl and userId", {
        baseUrl,
        userId,
        error,
      })
      return null
    }
  }

  async checkUrlExists(url: string): Promise<SiteAccount | null> {
    if (!url) return null
    try {
      const currentUrl = new URL(url)
      return (
        (await this.getAllAccounts()).find((account) => {
          try {
            return new URL(account.site_url).origin === currentUrl.origin
          } catch {
            return false
          }
        }) || null
      )
    } catch (error) {
      logger.error("检查 URL 是否存在时出错", error)
      return null
    }
  }
}

export const accountQueries = new AccountQueries()
