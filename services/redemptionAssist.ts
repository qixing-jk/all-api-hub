import { t } from "i18next"

import { accountStorage } from "~/services/accountStorage"
import { redeemService } from "~/services/redeemService"
import { searchAccounts } from "~/services/search/accountSearch"
import { userPreferences } from "~/services/userPreferences"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/error"
import { isPossibleRedemptionCode } from "~/utils/redemptionAssist"

const DEDUP_TTL_MS = 10 * 60 * 1000 // 10 minutes
const COOLDOWN_MS = 4000 // 4 seconds between prompts per tab

interface RedemptionAssistRuntimeSettings {
  enabled: boolean
}

class RedemptionAssistService {
  private initialized = false
  private settings: RedemptionAssistRuntimeSettings = { enabled: true }

  // Map of `${origin}|${code}` -> lastPromptTimestamp
  private promptHistory = new Map<string, number>()

  // Per-tab cooldown map: tabId -> lastPromptTimestamp
  private lastPromptPerTab = new Map<number, number>()

  async initialize() {
    if (this.initialized) {
      return
    }

    try {
      const prefs = await userPreferences.getPreferences()
      this.settings.enabled = prefs.redemptionAssist?.enabled ?? true
    } catch (error) {
      console.warn("[RedemptionAssist] Failed to load preferences:", error)
    }

    this.initialized = true
    console.log("[RedemptionAssist] Service initialized", this.settings)
  }

  updateRuntimeSettings(settings: { enabled?: boolean }) {
    if (typeof settings.enabled === "boolean") {
      this.settings.enabled = settings.enabled
      console.log("[RedemptionAssist] Runtime settings updated", this.settings)
    }
  }

  private async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  private async getDisplayAccounts(): Promise<DisplaySiteData[]> {
    const siteAccounts = await accountStorage.getAllAccounts()
    const displayAccounts = accountStorage.convertToDisplayData(
      siteAccounts
    ) as DisplaySiteData[]
    return displayAccounts
  }

  private getHostname(url: string): string | null {
    try {
      const u = new URL(url)
      return u.hostname.toLowerCase()
    } catch {
      return null
    }
  }

  private makeKey(url: string, code: string): string {
    try {
      const u = new URL(url)
      return `${u.origin}|${code}`
    } catch {
      return `${url}|${code}`
    }
  }

  private cleanupPromptHistory(now: number) {
    for (const [key, ts] of this.promptHistory.entries()) {
      if (now - ts > DEDUP_TTL_MS) {
        this.promptHistory.delete(key)
      }
    }
  }

  async shouldPrompt(params: {
    url: string
    code: string
    tabId?: number
  }): Promise<{ shouldPrompt: boolean; reason?: string }> {
    await this.ensureInitialized()

    if (!this.settings.enabled) {
      return { shouldPrompt: false, reason: "disabled" }
    }

    const { url, code, tabId } = params

    if (!isPossibleRedemptionCode(code)) {
      return { shouldPrompt: false, reason: "invalid_code" }
    }

    const now = Date.now()
    this.cleanupPromptHistory(now)

    if (typeof tabId === "number") {
      const last = this.lastPromptPerTab.get(tabId)
      if (last && now - last < COOLDOWN_MS) {
        return { shouldPrompt: false, reason: "cooldown" }
      }
    }

    const key = this.makeKey(url, code)
    const lastTs = this.promptHistory.get(key)
    if (lastTs && now - lastTs < DEDUP_TTL_MS) {
      return { shouldPrompt: false, reason: "dedup" }
    }

    this.promptHistory.set(key, now)
    if (typeof tabId === "number") {
      this.lastPromptPerTab.set(tabId, now)
    }

    return { shouldPrompt: true }
  }

  async autoRedeem(accountId: string, code: string) {
    // Delegate to redeemService which handles i18n and error messages
    return redeemService.redeemCodeForAccount(accountId, code)
  }

  async autoRedeemByUrl(url: string, code: string) {
    await this.ensureInitialized()
    const hostname = this.getHostname(url)

    if (!hostname) {
      return {
        success: false,
        code: "INVALID_URL",
        message: t("redemptionAssist:messages.noAccountForUrl")
      }
    }

    const displayAccounts = await this.getDisplayAccounts()

    // First, use accountSearch to get candidates related to this hostname
    const searchResults = searchAccounts(displayAccounts, hostname)

    // Then, narrow down to accounts whose customCheckInUrl shares the same domain
    const sameDomainCandidates = searchResults
      .map((result) => result.account)
      .filter((account) => {
        const customCheckInUrl = account.checkIn?.customCheckInUrl
        if (!customCheckInUrl) return false
        const accountHost = this.getHostname(customCheckInUrl)
        return accountHost === hostname
      })

    if (sameDomainCandidates.length === 1) {
      // Single clear match – auto redeem
      const account = sameDomainCandidates[0]
      const redeemResult = await redeemService.redeemCodeForAccount(
        account.id,
        code
      )
      // Flatten the result so it matches the RedeemResult shape used elsewhere
      return {
        ...redeemResult,
        selectedAccount: account
      }
    }

    if (sameDomainCandidates.length > 1) {
      // Multiple matches – let the content script show a selector
      return {
        success: false,
        code: "MULTIPLE_ACCOUNTS",
        candidates: sameDomainCandidates
      }
    }

    // No valid match by hostname + customCheckInUrl – return all accounts for manual search
    return {
      success: false,
      code: "NO_ACCOUNTS",
      candidates: [],
      allAccounts: displayAccounts,
      message: t("redemptionAssist:messages.noAccountForUrl")
    }
  }
}

export const redemptionAssistService = new RedemptionAssistService()

export const handleRedemptionAssistMessage = async (
  request: any,
  sender: browser.runtime.MessageSender,
  sendResponse: (response: any) => void
) => {
  try {
    switch (request.action) {
      case "redemptionAssist:updateSettings": {
        redemptionAssistService.updateRuntimeSettings(request.settings || {})
        sendResponse({ success: true })
        break
      }

      case "redemptionAssist:shouldPrompt": {
        const { url, code } = request
        if (!url || !code) {
          sendResponse({ success: false, error: "Missing url or code" })
          break
        }
        const result = await redemptionAssistService.shouldPrompt({
          url,
          code,
          tabId: sender.tab?.id
        })
        sendResponse({ success: true, ...result })
        break
      }

      case "redemptionAssist:autoRedeem": {
        const { accountId, code } = request
        if (!accountId || !code) {
          sendResponse({ success: false, error: "Missing accountId or code" })
          break
        }
        const result = await redemptionAssistService.autoRedeem(accountId, code)
        sendResponse({ success: true, data: result })
        break
      }

      case "redemptionAssist:autoRedeemByUrl": {
        const { url, code } = request
        if (!url || !code) {
          sendResponse({ success: false, error: "Missing url or code" })
          break
        }
        const result = await redemptionAssistService.autoRedeemByUrl(url, code)
        sendResponse({ success: true, data: result })
        break
      }

      default:
        sendResponse({ success: false, error: "Unknown action" })
    }
  } catch (error) {
    console.error("[RedemptionAssist] Message handling failed:", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
