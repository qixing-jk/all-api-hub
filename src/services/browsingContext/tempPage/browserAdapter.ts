import { RuntimeActionIds } from "~/constants/runtimeActions"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { checkTempContextProtectionGuards } from "~/services/browsingContext/tempPage/tempContextProtectionGuards"
import {
  DEFAULT_TEMP_CONTEXT_PREFERENCE,
  normalizeTempWindowFallbackPreferences,
  type TempWindowFallbackPreferences,
} from "~/services/preferences/tempWindowFallbackPreferences"
import { userPreferences } from "~/services/preferences/userPreferences"
import { AuthTypeEnum } from "~/types"
import {
  getTab,
  sendTabMessageWithRetry,
  updateTab,
} from "~/utils/browser/browserApi"
import {
  addAuthMethodHeader,
  AUTH_MODE,
  COOKIE_SESSION_OVERRIDE_HEADER_NAME,
  getCookieHeaderForUrl,
} from "~/utils/browser/cookieHelper"
import { mergeCookieHeaders } from "~/utils/browser/cookieString"
import {
  applyTempWindowCookieRule,
  removeTempWindowDownloadBlockRule,
} from "~/utils/browser/dnrCookieInjector"
import { removeFirefoxTempWindowDownloadBlockRule } from "~/utils/browser/firefoxTempWindowDownloadBlocker"
import { isProtectionBypassFirefoxEnv } from "~/utils/browser/protectionBypass"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

import { type TempContext, type TempContextTabSnapshot } from "./contracts"
import { logger, logTempWindow } from "./diagnostics"

/**
 * Removes any download-block rules installed for a temp-context tab.
 */
export async function removeInstalledDownloadBlockRules(
  downloadBlockRuleId: number | null | undefined,
  firefoxDownloadBlockTabId: number | null | undefined,
): Promise<void> {
  await Promise.all([
    downloadBlockRuleId != null
      ? removeTempWindowDownloadBlockRule(downloadBlockRuleId)
      : Promise.resolve(),
    firefoxDownloadBlockTabId != null
      ? removeFirefoxTempWindowDownloadBlockRule(firefoxDownloadBlockTabId)
      : Promise.resolve(),
  ])
}

/** Retry delay when the content script is not ready to receive messages. */
const SHIELD_BYPASS_UI_RETRY_MS = 250

/** Max retry attempts for showing the shield-bypass UI in the temp tab. */
const SHIELD_BYPASS_UI_MAX_RETRIES = 20

/**
 * Best-effort: Ask the content script in the temporary tab/window to show a
 * small prompt so users know the page was opened for protection (shield) bypass.
 */
export async function showShieldBypassUiInTab(meta: {
  tabId: number
  origin: string
  requestId: string
}) {
  for (let attempt = 1; attempt <= SHIELD_BYPASS_UI_MAX_RETRIES; attempt += 1) {
    try {
      await sendTabMessageWithRetry(
        meta.tabId,
        {
          action: RuntimeActionIds.ContentShowShieldBypassUi,
          origin: meta.origin,
          requestId: meta.requestId,
        },
        {
          maxAttempts: 1,
        },
      )
      logTempWindow("shieldBypassUiShown", {
        tabId: meta.tabId,
        requestId: meta.requestId,
        origin: meta.origin,
        attempt,
      })
      return
    } catch (error) {
      // Content script might not be ready yet or page may not allow scripts; ignore.
      if (attempt === SHIELD_BYPASS_UI_MAX_RETRIES) {
        logTempWindow("shieldBypassUiFailed", {
          tabId: meta.tabId,
          requestId: meta.requestId,
          origin: meta.origin,
          error: getErrorMessage(error),
        })
        return
      }
      await new Promise((resolve) =>
        setTimeout(resolve, SHIELD_BYPASS_UI_RETRY_MS),
      )
    }
  }
}

/**
 * Resolve the preferred temporary context mode from user preferences.
 * Preserves valid stored choices and uses the automatic default when the
 * preference snapshot is partial or unavailable.
 */
export async function resolveTempContextPreferenceMode(): Promise<
  TempWindowFallbackPreferences["tempContextMode"]
> {
  try {
    const prefs = await userPreferences.getPreferences()
    const fallback: Partial<TempWindowFallbackPreferences> | undefined =
      prefs.tempWindowFallback
    return fallback?.tempContextMode ?? DEFAULT_TEMP_CONTEXT_PREFERENCE
  } catch {
    return DEFAULT_TEMP_CONTEXT_PREFERENCE
  }
}

/** Reads window dimensions at creation time, including for legacy preferences. */
export async function resolveTempWindowSize() {
  let storedPreferences: unknown
  try {
    storedPreferences = (await userPreferences.getPreferences())
      .tempWindowFallback
  } catch {
    // Window creation remains available when preference storage is unavailable.
  }
  const { windowWidth, windowHeight } =
    normalizeTempWindowFallbackPreferences(storedPreferences)
  return { width: windowWidth, height: windowHeight }
}

/**
 * Prepares fetch options for temp-context requests by applying cookie/session overrides when needed.
 */
export async function prepareTempContextFetchOptions(params: {
  tabId: number
  url: string
  rawOptions: RequestInit
  resolvedAuthType?: AuthTypeEnum
  accountId?: string
  cookieAuthSessionCookie?: string
  cookieStoreId?: string
  addFirefoxAuthModeHeader?: boolean
}): Promise<{
  ruleIds: number[]
  effectiveFetchOptions: RequestInit
}> {
  const { tabId, url, rawOptions, resolvedAuthType } = params

  const ruleIds = new Set<number>()
  let effectiveFetchOptions: RequestInit = rawOptions

  // Chromium-based browsers: for token-auth (credentials=omit) we still need WAF cookies,
  // but MUST exclude session cookies to prevent cross-account contamination (issue #204).
  if (!isProtectionBypassFirefoxEnv() && rawOptions.credentials === "omit") {
    const cookieHeader = await getCookieHeaderForUrl(url, {
      includeSession: false,
      ...(params.cookieStoreId ? { storeId: params.cookieStoreId } : {}),
    })

    if (cookieHeader) {
      const precheckRuleId = await applyTempWindowCookieRule({
        tabId,
        url,
        cookieHeader,
      })

      if (precheckRuleId) {
        ruleIds.add(precheckRuleId)
        effectiveFetchOptions = {
          ...rawOptions,
          credentials: "include",
        }
      }
    }
  }

  // Multi-account cookie auth: merge WAF cookies (no session) + per-account session cookie bundle.
  if (resolvedAuthType === AuthTypeEnum.Cookie) {
    const sessionCookie =
      typeof params.cookieAuthSessionCookie === "string" &&
      params.cookieAuthSessionCookie.trim()
        ? params.cookieAuthSessionCookie
        : params.accountId
          ? (await accountQueries.getAccountById(params.accountId))?.cookieAuth
              ?.sessionCookie
          : undefined

    if (sessionCookie && sessionCookie.trim()) {
      const wafCookieHeader = await getCookieHeaderForUrl(url, {
        includeSession: false,
        ...(params.cookieStoreId ? { storeId: params.cookieStoreId } : {}),
      })
      const mergedCookieHeader = mergeCookieHeaders(
        wafCookieHeader,
        sessionCookie,
      )

      if (!isProtectionBypassFirefoxEnv()) {
        // Chromium: inject Cookie header per-tab using DNR.
        const authRuleId = await applyTempWindowCookieRule({
          tabId,
          url,
          cookieHeader: mergedCookieHeader,
        })

        if (authRuleId) {
          ruleIds.add(authRuleId)
          effectiveFetchOptions = {
            ...rawOptions,
            credentials: "include",
          }
        }
      } else {
        // Firefox: pass session cookie bundle through a private header.
        const headers = new Headers(rawOptions.headers ?? {})
        headers.set(COOKIE_SESSION_OVERRIDE_HEADER_NAME, sessionCookie)
        effectiveFetchOptions = {
          ...rawOptions,
          credentials: rawOptions.credentials ?? "include",
          headers: Object.fromEntries(headers.entries()),
        }
      }
    }
  }

  // Firefox cookie interceptor: add auth-mode header so the webRequest layer knows
  // whether to include session cookies for this request.
  if (params.addFirefoxAuthModeHeader && isProtectionBypassFirefoxEnv()) {
    const mode =
      resolvedAuthType === AuthTypeEnum.Cookie
        ? AUTH_MODE.COOKIE_AUTH_MODE
        : resolvedAuthType === AuthTypeEnum.AccessToken ||
            rawOptions.credentials === "omit"
          ? AUTH_MODE.TOKEN_AUTH_MODE
          : AUTH_MODE.COOKIE_AUTH_MODE

    effectiveFetchOptions = {
      ...effectiveFetchOptions,
      headers: await addAuthMethodHeader(
        effectiveFetchOptions.headers ?? {},
        mode,
      ),
    }
  }

  return { ruleIds: Array.from(ruleIds), effectiveFetchOptions }
}

/**
 * Navigates a temporary context tab and keeps the in-memory URL tracker aligned.
 */
export async function navigateTempContextToPage(
  context: TempContext,
  url: string,
  meta: { requestId: string; origin: string; signal?: AbortSignal },
) {
  meta.signal?.throwIfAborted()
  const currentTab = await getTempContextTabSnapshot(context.tabId)
  meta.signal?.throwIfAborted()
  if (currentTab?.url === url && currentTab.status === "complete") {
    context.currentUrl = currentTab.url
    return
  }

  if (context.currentUrl !== url || currentTab?.url !== url) {
    await updateTab(context.tabId, { url })
    context.currentUrl = url
  }

  await waitForTabComplete(context.tabId, meta)
  context.currentUrl =
    (await getTempContextTabSnapshot(context.tabId))?.url ?? url
}

/**
 * Reads the live URL/load state for a reusable temp-context tab.
 */
export async function getTempContextTabSnapshot(
  tabId: number,
): Promise<TempContextTabSnapshot | null> {
  try {
    const tab = await getTab(tabId)
    return {
      url: tab.url,
      status: tab.status,
    }
  } catch (error) {
    logger.debug("Unable to inspect temp context tab state", {
      tabId,
      error: getErrorMessage(error),
    })
    return null
  }
}

/**
 * Wait for the temp-context tab to finish loading and clear any protection pages
 * (Cloudflare and/or CAP checkpoint). Rejects on timeout or errors.
 */
export function waitForTabComplete(
  tabId: number,
  meta?: { requestId?: string; origin?: string; signal?: AbortSignal },
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearTimeout(retry)
      meta?.signal?.removeEventListener("abort", cancel)
      if (error) reject(error)
      else resolve()
    }
    const cancel = () => finish(new Error("Temporary page cancelled"))
    const timeout = setTimeout(() => {
      logTempWindow("waitForTabCompleteTimeout", {
        tabId,
        requestId: meta?.requestId ?? null,
        origin: meta?.origin ?? null,
      })
      finish(new Error(t("messages:background.pageLoadTimeout")))
    }, 20000) // 20秒超时

    meta?.signal?.addEventListener("abort", cancel, { once: true })
    if (meta?.signal?.aborted) {
      cancel()
      return
    }

    let attempts = 0
    let lastPassed: boolean | null = null
    let lastCapPassed: boolean | null = null
    let lastCloudflarePassed: boolean | null = null
    let lastTabStatus: string | undefined

    logTempWindow("waitForTabCompleteStart", {
      tabId,
      requestId: meta?.requestId ?? null,
      origin: meta?.origin ?? null,
    })

    const checkStatus = async () => {
      if (settled) return
      try {
        const tab = await getTab(tabId)

        if (settled) return
        attempts += 1
        if (tab.status !== lastTabStatus) {
          lastTabStatus = tab.status
          logTempWindow("waitForTabStatus", {
            tabId,
            requestId: meta?.requestId ?? null,
            origin: meta?.origin ?? null,
            status: tab.status,
            attempt: attempts,
          })
        }

        if (tab.status === "complete") {
          let capPassed = false
          let cloudflarePassed = false

          try {
            const result = await checkTempContextProtectionGuards({
              tabId,
              requestId: meta?.requestId,
            })
            capPassed = result.capPassed
            cloudflarePassed = result.cloudflarePassed
          } catch (error) {
            logger.warn("Guard checks via content script failed", error)
          }

          if (settled) return
          const passed = capPassed && cloudflarePassed

          if (
            lastPassed !== passed ||
            lastCapPassed !== capPassed ||
            lastCloudflarePassed !== cloudflarePassed
          ) {
            lastPassed = passed
            lastCapPassed = capPassed
            lastCloudflarePassed = cloudflarePassed
            logTempWindow("protectionGuardCheck", {
              tabId,
              requestId: meta?.requestId ?? null,
              origin: meta?.origin ?? null,
              passed,
              capPassed,
              cloudflarePassed,
              attempt: attempts,
            })
          }
          if (passed) {
            clearTimeout(timeout)
            retry = setTimeout(() => finish(), 500) // 再等待半秒，确保页面 JS 执行完
          } else {
            // 盾页面未通过，继续轮询
            retry = setTimeout(checkStatus, 500)
          }
        } else {
          // 页面未完全加载，继续轮询
          retry = setTimeout(checkStatus, 100)
        }
      } catch (error) {
        clearTimeout(timeout)
        logTempWindow("waitForTabCompleteError", {
          tabId,
          requestId: meta?.requestId ?? null,
          origin: meta?.origin ?? null,
          error: getErrorMessage(error),
        })
        finish(error)
      }
    }

    checkStatus()
  })
}
