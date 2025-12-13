import { CurrencyType } from "~/types"

import { accountStorage } from "./accountStorage"
import { userPreferences } from "./userPreferences"

/**
 * Badge display mode for the extension icon
 */
export type BadgeDisplayMode = "off" | "balance" | "consumption"

/**
 * Badge service configuration
 */
export interface BadgeConfig {
  enabled: boolean
  displayMode: BadgeDisplayMode
  currencyType: CurrencyType
}

export const DEFAULT_BADGE_CONFIG: BadgeConfig = {
  enabled: false,
  displayMode: "balance",
  currencyType: "USD",
}

/**
 * Manages the extension icon badge to display balance or consumption information.
 *
 * Responsibilities:
 * - Updates the badge text based on account data
 * - Respects user preferences for display mode and currency
 * - Formats numbers for compact display (e.g., 1.2K, 3.5M)
 */
class BadgeService {
  private isInitialized = false

  /**
   * Initialize the badge service.
   * Loads preferences and updates the badge.
   */
  async initialize() {
    if (this.isInitialized) {
      console.log("[BadgeService] 服务已初始化")
      return
    }

    try {
      await this.updateBadge()
      this.isInitialized = true
      console.log("[BadgeService] 服务初始化成功")
    } catch (error) {
      console.error("[BadgeService] 服务初始化失败:", error)
    }
  }

  /**
   * Update the badge based on current account data and preferences.
   */
  async updateBadge() {
    try {
      const preferences = await userPreferences.getPreferences()
      const badgeConfig = preferences.badge || DEFAULT_BADGE_CONFIG

      if (!badgeConfig.enabled || badgeConfig.displayMode === "off") {
        await this.clearBadge()
        return
      }

      const stats = await accountStorage.getAccountStats()
      const accounts = await accountStorage.getAllAccounts()

      if (accounts.length === 0) {
        await this.clearBadge()
        return
      }

      // Calculate total based on display mode
      let totalQuota: number
      if (badgeConfig.displayMode === "consumption") {
        totalQuota = stats.today_total_consumption
      } else {
        totalQuota = stats.total_quota
      }

      // Convert quota to currency amount
      const conversionFactor = 500000 // Same as UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
      const usdAmount = totalQuota / conversionFactor

      // Calculate average exchange rate from all accounts
      const totalExchangeRate = accounts.reduce(
        (sum, acc) => sum + acc.exchange_rate,
        0,
      )
      const avgExchangeRate = totalExchangeRate / accounts.length

      // Get amount in selected currency
      const amount =
        badgeConfig.currencyType === "CNY"
          ? usdAmount * avgExchangeRate
          : usdAmount

      // Format and display
      const badgeText = this.formatBadgeText(amount)
      const badgeColor = this.getBadgeColor(badgeConfig.displayMode)

      await this.setBadge(badgeText, badgeColor)
    } catch (error) {
      console.error("[BadgeService] 更新徽章失败:", error)
    }
  }

  /**
   * Format a number for compact badge display.
   * Examples: 1234 -> "1.2K", 1234567 -> "1.2M"
   */
  private formatBadgeText(amount: number): string {
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(1) + "M"
    } else if (amount >= 1000) {
      return (amount / 1000).toFixed(1) + "K"
    } else if (amount >= 100) {
      return Math.round(amount).toString()
    } else if (amount >= 10) {
      return amount.toFixed(1)
    } else {
      return amount.toFixed(2)
    }
  }

  /**
   * Get badge background color based on display mode.
   */
  private getBadgeColor(displayMode: BadgeDisplayMode): string {
    switch (displayMode) {
      case "consumption":
        return "#F59E0B" // Amber/yellow for consumption
      case "balance":
      default:
        return "#10B981" // Green for balance
    }
  }

  /**
   * Set the badge text and color.
   */
  private async setBadge(text: string, color: string) {
    try {
      await browser.action.setBadgeText({ text })
      await browser.action.setBadgeBackgroundColor({ color })
      console.log(`[BadgeService] 徽章已更新: ${text}`)
    } catch (error) {
      console.error("[BadgeService] 设置徽章失败:", error)
    }
  }

  /**
   * Clear the badge.
   */
  async clearBadge() {
    try {
      await browser.action.setBadgeText({ text: "" })
      console.log("[BadgeService] 徽章已清除")
    } catch (error) {
      console.error("[BadgeService] 清除徽章失败:", error)
    }
  }

  /**
   * Get current badge configuration from preferences.
   */
  async getConfig(): Promise<BadgeConfig> {
    const preferences = await userPreferences.getPreferences()
    return preferences.badge || DEFAULT_BADGE_CONFIG
  }

  /**
   * Update badge configuration.
   */
  async updateConfig(config: Partial<BadgeConfig>) {
    try {
      await userPreferences.savePreferences({ badge: config })
      await this.updateBadge()
      console.log("[BadgeService] 配置已更新:", config)
    } catch (error) {
      console.error("[BadgeService] 更新配置失败:", error)
    }
  }

  /**
   * Destroy the service.
   */
  destroy() {
    this.isInitialized = false
    console.log("[BadgeService] 服务已销毁")
  }
}

// Create singleton instance
export const badgeService = new BadgeService()
