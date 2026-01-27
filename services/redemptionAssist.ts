import { t } from "i18next"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { getSiteApiRouter } from "~/constants/siteType"
import { accountStorage } from "~/services/accountStorage"
import { redeemService } from "~/services/redeemService"
import { searchAccounts } from "~/services/search/accountSearch"
import { userPreferences } from "~/services/userPreferences"
import type { DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/error"
import { createLogger } from "~/utils/logger"
import { isPossibleRedemptionCode } from "~/utils/redemptionAssist"
import {
  buildOriginWhitelistPattern,
  buildUrlPrefixWhitelistPattern,
  isUrlAllowedByRegexList,
} from "~/utils/redemptionAssistWhitelist"
import { joinUrl } from "~/utils/url"

/**
 * Unified logger scoped to the redemption assist background service.
 */
const logger = createLogger("RedemptionAssist")

interface RedemptionAssistRuntimeSettings {
  enabled: boolean
  relaxedCodeValidation: boolean
  urlWhitelist?: {
    enabled: boolean
    patterns: string[]
    includeAccountSiteUrls: boolean
    includeCheckInAndRedeemUrls: boolean
  }
}

/**
 * Request payload for `RuntimeActionIds.RedemptionAssistShouldPrompt` runtime messages.
 */
export type RedemptionAssistShouldPromptRequest = {
  action: typeof RuntimeActionIds.RedemptionAssistShouldPrompt
  url: string
  codes: string[]
}

/**
 * Response payload for `RuntimeActionIds.RedemptionAssistShouldPrompt` runtime messages.
 */
export type RedemptionAssistShouldPromptResponse =
  | {
      success: true
      promptableCodes: string[]
    }
  | {
      success: false
      error?: string
    }

/**
 * Provides code redemption assistance in background/context scripts.
 * Responsibilities:
 * - Tracks runtime enable flag from preferences.
 * - Determines whether to prompt based on URL/hostname and code validity.
 * - Delegates actual redeem actions to redeemService.
 */
class RedemptionAssistService {
  private initialized = false
  private settings: RedemptionAssistRuntimeSettings = {
    enabled: true,
    relaxedCodeValidation: true,
  }

  private derivedPatternsCache: {
    fetchedAt: number
    patterns: string[]
    key: string
  } | null = null

  private static readonly DERIVED_PATTERNS_TTL_MS = 30_000

  /**
   * Initialize from stored preferences (idempotent).
   *
   * Safe to call multiple times; loads enable flag from user preferences.
   */
  async initialize() {
    if (this.initialized) {
      return
    }

    try {
      const prefs = await userPreferences.getPreferences()
      this.settings.enabled = prefs.redemptionAssist?.enabled ?? true
      this.settings.relaxedCodeValidation =
        prefs.redemptionAssist?.relaxedCodeValidation ?? true
      if (prefs.redemptionAssist?.urlWhitelist) {
        this.settings.urlWhitelist = prefs.redemptionAssist.urlWhitelist
      }
    } catch (error) {
      logger.warn("Failed to load preferences", error)
    }

    this.initialized = true
    logger.info("Service initialized", this.settings)
  }

  /**
   * Update runtime flags without persisting.
   * @param settings Runtime-only toggle overrides.
   * @param settings.enabled Whether redemption assist is enabled at runtime.
   * @param settings.relaxedCodeValidation Whether to loosen code validation rules.
   * @param settings.urlWhitelist Optional URL whitelist configuration used to gate feature activation.
   */
  updateRuntimeSettings(settings: {
    enabled?: boolean
    relaxedCodeValidation?: boolean
    urlWhitelist?: RedemptionAssistRuntimeSettings["urlWhitelist"]
  }) {
    const next: RedemptionAssistRuntimeSettings = {
      ...this.settings,
      enabled:
        typeof settings.enabled === "boolean"
          ? settings.enabled
          : this.settings.enabled,
      relaxedCodeValidation:
        typeof settings.relaxedCodeValidation === "boolean"
          ? settings.relaxedCodeValidation
          : this.settings.relaxedCodeValidation,
      urlWhitelist: settings.urlWhitelist
        ? {
            ...(this.settings.urlWhitelist ?? {
              enabled: true,
              patterns: [],
              includeAccountSiteUrls: true,
              includeCheckInAndRedeemUrls: true,
            }),
            ...settings.urlWhitelist,
          }
        : this.settings.urlWhitelist,
    }
    this.settings = next
    this.derivedPatternsCache = null
    logger.info("Runtime settings updated", this.settings)
  }

  /**
   * Ensure preferences are loaded before decision flows.
   */
  private async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  /**
   * Fetch accounts and convert to display data used by search/filter utilities.
   */
  private async getDisplayAccounts(): Promise<DisplaySiteData[]> {
    const siteAccounts = await accountStorage.getEnabledAccounts()
    const displayAccounts = accountStorage.convertToDisplayData(
      siteAccounts,
    ) as DisplaySiteData[]
    return displayAccounts
  }

  /**
   * Extracts the URL origin (protocol + host) from a URL string.
   */
  private getOrigin(url: string): string | null {
    try {
      const parsed = new URL(url)
      return parsed.origin
    } catch {
      return null
    }
  }

  private getRuntimeWhitelist() {
    const whitelist = this.settings.urlWhitelist
    if (!whitelist) {
      return null
    }
    return {
      enabled: whitelist.enabled,
      patterns: Array.isArray(whitelist.patterns) ? whitelist.patterns : [],
      includeAccountSiteUrls: !!whitelist.includeAccountSiteUrls,
      includeCheckInAndRedeemUrls: !!whitelist.includeCheckInAndRedeemUrls,
    }
  }

  private async getDerivedWhitelistPatterns(
    options: {
      includeAccountSiteUrls: boolean
      includeCheckInAndRedeemUrls: boolean
    },
    now: number = Date.now(),
  ): Promise<string[]> {
    const cacheKey = `${options.includeAccountSiteUrls ? 1 : 0}:${
      options.includeCheckInAndRedeemUrls ? 1 : 0
    }`
    const cached = this.derivedPatternsCache
    if (
      cached &&
      cached.key === cacheKey &&
      now - cached.fetchedAt < RedemptionAssistService.DERIVED_PATTERNS_TTL_MS
    ) {
      return cached.patterns
    }

    if (
      !options.includeAccountSiteUrls &&
      !options.includeCheckInAndRedeemUrls
    ) {
      this.derivedPatternsCache = {
        fetchedAt: now,
        patterns: [],
        key: cacheKey,
      }
      return []
    }

    const accounts = await this.getDisplayAccounts()
    const patterns: string[] = []

    if (options.includeAccountSiteUrls) {
      for (const account of accounts) {
        const pattern = buildOriginWhitelistPattern(account.baseUrl)
        if (pattern) patterns.push(pattern)
      }
    }

    if (options.includeCheckInAndRedeemUrls) {
      for (const account of accounts) {
        const origin = this.getOrigin(account.baseUrl)
        if (!origin) continue

        const router = getSiteApiRouter(account.siteType)
        const resolvedCheckInUrl =
          account.checkIn?.customCheckIn?.url ||
          joinUrl(origin, router.checkInPath)
        const resolvedRedeemUrl =
          account.checkIn?.customCheckIn?.redeemUrl ||
          joinUrl(origin, router.redeemPath)

        const checkInPattern = buildOriginWhitelistPattern(resolvedCheckInUrl)
        if (checkInPattern) patterns.push(checkInPattern)

        const redeemPattern = buildUrlPrefixWhitelistPattern(resolvedRedeemUrl)
        if (redeemPattern) patterns.push(redeemPattern)
      }
    }

    const unique = Array.from(new Set(patterns))
    this.derivedPatternsCache = {
      fetchedAt: now,
      patterns: unique,
      key: cacheKey,
    }
    return unique
  }

  private async isUrlAllowedByWhitelist(url: string): Promise<boolean> {
    const whitelist = this.getRuntimeWhitelist()
    if (!whitelist || !whitelist.enabled) {
      return true
    }

    const userPatterns = whitelist.patterns
      .map((p) => (p ?? "").trim())
      .filter(Boolean)

    const derivedPatterns = await this.getDerivedWhitelistPatterns({
      includeAccountSiteUrls: whitelist.includeAccountSiteUrls,
      includeCheckInAndRedeemUrls: whitelist.includeCheckInAndRedeemUrls,
    })

    const combined = [...userPatterns, ...derivedPatterns]

    // If there are no patterns at all, treat as allow-all (safe default).
    if (!combined.length) {
      return true
    }

    return isUrlAllowedByRegexList(url, combined)
  }

  /**
   * Normalize and extract hostname; returns null if URL is invalid.
   * @param url Candidate URL.
   * @returns Lowercased hostname or null on parse failure.
   */
  private getHostname(url: string): string | null {
    try {
      const u = new URL(url)
      return u.hostname.toLowerCase()
    } catch {
      return null
    }
  }

  /**
   * Filters codes to those eligible for redemption prompts.
   * @param params Wrapper object containing URL, redemption codes and tab id.
   * @param params.url Page URL where the potential redemption codes were found.
   * @param params.codes Candidate redemption codes extracted from the page.
   * @param params.tabId Optional tab identifier used for telemetry.
   * @returns List of codes that pass validation and whitelist checks.
   */
  async filterPromptableCodes(params: {
    url: string
    codes: string[]
    tabId?: number
  }): Promise<string[]> {
    await this.ensureInitialized()

    if (!this.settings.enabled) {
      return []
    }

    const checks = await Promise.all(
      params.codes.map(async (code) => {
        const result = await this.evaluatePromptability({
          url: params.url,
          code,
          tabId: params.tabId,
        })
        return result.shouldPrompt ? code : null
      }),
    )

    return checks.filter((code): code is string => Boolean(code))
  }

  /**
   * Evaluates prompt eligibility for a single code after initialization.
   */
  private async evaluatePromptability(params: {
    url: string
    code: string
    tabId?: number
  }): Promise<{ shouldPrompt: boolean; reason?: string }> {
    if (!this.settings.enabled) {
      return { shouldPrompt: false, reason: "disabled" }
    }

    const { code } = params

    const possible = isPossibleRedemptionCode(code, {
      relaxedCharset: this.settings.relaxedCodeValidation,
    })

    if (!possible) {
      return { shouldPrompt: false, reason: "invalid_code" }
    }

    const urlAllowed = await this.isUrlAllowedByWhitelist(params.url)
    if (!urlAllowed) {
      return { shouldPrompt: false, reason: "url_not_allowed" }
    }

    return { shouldPrompt: true }
  }

  /**
   * Redeem a code for a specific account directly.
   * @param accountId Target account id.
   * @param code Redemption code.
   */
  async autoRedeem(accountId: string, code: string) {
    // Delegate to redeemService which handles i18n and error messages
    return redeemService.redeemCodeForAccount(accountId, code)
  }

  /**
   * Attempt redemption by inferring account from URL + code.
   * Flow:
   * 1) Parse hostname; fail fast if invalid.
   * 2) Use account search to find candidates by hostname.
   * 3) Filter candidates whose customCheckInUrl matches the same domain.
   *    - Single match: auto redeem.
   *    - Multiple: ask frontend to choose.
   *    - None: return all accounts for manual search.
   */
  async autoRedeemByUrl(url: string, code: string) {
    await this.ensureInitialized()
    const hostname = this.getHostname(url)

    if (!hostname) {
      return {
        success: false,
        code: "INVALID_URL",
        message: t("redemptionAssist:messages.noAccountForUrl"),
      }
    }

    const displayAccounts = await this.getDisplayAccounts()

    // First, use accountSearch to get candidates related to this hostname
    const searchResults = searchAccounts(displayAccounts, hostname)

    // Then, narrow down to accounts whose customCheckInUrl shares the same domain
    const sameDomainCandidates = searchResults
      .map((result) => result.account)
      .filter((account) => {
        const customCheckInUrl = account.checkIn?.customCheckIn?.url
        if (!customCheckInUrl) return false
        const accountHost = this.getHostname(customCheckInUrl)
        return accountHost === hostname
      })

    if (sameDomainCandidates.length === 1) {
      // Single clear match – auto redeem
      const account = sameDomainCandidates[0]
      const redeemResult = await redeemService.redeemCodeForAccount(
        account.id,
        code,
      )
      // Flatten the result so it matches the RedeemResult shape used elsewhere
      return {
        ...redeemResult,
        selectedAccount: account,
      }
    }

    if (sameDomainCandidates.length > 1) {
      // Multiple matches – let the content script show a selector
      return {
        success: false,
        code: "MULTIPLE_ACCOUNTS",
        candidates: sameDomainCandidates,
      }
    }

    // No valid match by hostname + customCheckInUrl – return all accounts for manual search
    return {
      success: false,
      code: "NO_ACCOUNTS",
      candidates: [],
      allAccounts: displayAccounts,
      message: t("redemptionAssist:messages.noAccountForUrl"),
    }
  }
}

export const redemptionAssistService = new RedemptionAssistService()

/**
 * Message handler for redemption assist actions.
 * Centralizes background decision logic and delegates responses to callers.
 */
export const handleRedemptionAssistMessage = async (
  request: any,
  sender: browser.runtime.MessageSender,
  sendResponse: (response: any) => void,
) => {
  try {
    switch (request.action) {
      case RuntimeActionIds.RedemptionAssistUpdateSettings: {
        redemptionAssistService.updateRuntimeSettings(request.settings || {})
        sendResponse({ success: true })
        break
      }

      case RuntimeActionIds.RedemptionAssistShouldPrompt: {
        const { url, codes } = request
        if (!url || !Array.isArray(codes) || codes.length === 0) {
          sendResponse({ success: false, error: "Missing url or codes" })
          break
        }
        const promptableCodes =
          await redemptionAssistService.filterPromptableCodes({
            url,
            codes,
            tabId: sender.tab?.id,
          })
        const response: RedemptionAssistShouldPromptResponse = {
          success: true,
          promptableCodes,
        }
        sendResponse(response)
        break
      }

      case RuntimeActionIds.RedemptionAssistAutoRedeem: {
        const { accountId, code } = request
        if (!accountId || !code) {
          sendResponse({ success: false, error: "Missing accountId or code" })
          break
        }
        const result = await redemptionAssistService.autoRedeem(accountId, code)
        sendResponse({ success: true, data: result })
        break
      }

      case RuntimeActionIds.RedemptionAssistAutoRedeemByUrl: {
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
    logger.error("Message handling failed", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
