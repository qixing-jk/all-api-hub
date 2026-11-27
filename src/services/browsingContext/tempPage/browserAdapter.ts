import { RuntimeActionIds } from "~/constants/runtimeActions"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { startAbortableTask } from "~/services/apiTransport/abortableTask"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import {
  checkTempContextProtectionGuards,
  ProtectionPageTimeoutError,
} from "~/services/browsingContext/tempPage/tempContextProtectionGuards"
import { createDeploymentProbeMemory } from "~/services/core/deploymentProbeMemory"
import {
  DEFAULT_TEMP_CONTEXT_PREFERENCE,
  type TempWindowFallbackPreferences,
} from "~/services/preferences/tempWindowFallbackPreferences"
import { userPreferences } from "~/services/preferences/userPreferences"
import { AuthTypeEnum } from "~/types"
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
import { sendTabMessageWithRetry } from "~/utils/browser/runtimeMessages"
import { getTab, updateTab } from "~/utils/browser/tabs"
import { getErrorMessage } from "~/utils/core/error"
import { tryParseHttpUrl } from "~/utils/core/urlParsing"
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
  const sessionCookie =
    resolvedAuthType === AuthTypeEnum.Cookie
      ? typeof params.cookieAuthSessionCookie === "string" &&
        params.cookieAuthSessionCookie.trim()
        ? params.cookieAuthSessionCookie
        : params.accountId
          ? (await accountQueries.getAccountById(params.accountId))?.cookieAuth
              ?.sessionCookie
          : undefined
      : undefined

  // Chromium-based browsers: for token-auth (credentials=omit) we still need WAF cookies,
  // but MUST exclude session cookies to prevent cross-account contamination (issue #204).
  if (
    !isProtectionBypassFirefoxEnv() &&
    rawOptions.credentials === "omit" &&
    !sessionCookie?.trim()
  ) {
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
        } else {
          throw new ApiError(
            t("messages:cookieTransport.requestUnavailable"),
            undefined,
            undefined,
            API_ERROR_CODES.COOKIE_REQUEST_UNAVAILABLE,
          )
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
  meta: {
    requestId: string
    origin: string
    signal?: AbortSignal
    allowInteractive?: boolean
  },
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

  await (meta.allowInteractive
    ? waitForTabDocumentReady(context.tabId, url, {
        ...meta,
        allowLoadedRedirect: true,
      })
    : waitForTabComplete(context.tabId, meta))
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

/** Probe only read-only handlers before reusing a tab; an open tab can have a dead content receiver. */
export async function isTempContextContentReady(
  tabId: number,
  meta: {
    requestId: string
    origin: string
    signal?: AbortSignal
    interactiveUrl?: string
  },
): Promise<boolean> {
  try {
    const guards = await startAbortableTask(
      () =>
        checkTempContextProtectionGuards({ tabId, requestId: meta.requestId }),
      { timeoutMs: 2000, signals: [meta.signal] },
    ).result
    if (
      !guards.cap?.success ||
      !guards.cloudflare?.success ||
      !guards.aliyun?.success
    )
      return false
    if (!guards.passed) {
      await (meta.interactiveUrl
        ? waitForTabDocumentReady(tabId, meta.interactiveUrl, {
            ...meta,
            allowLoadedRedirect: true,
          })
        : waitForTabComplete(tabId, meta))
    }
    return true
  } catch {
    meta.signal?.throwIfAborted()
    return false
  }
}

type ProtectedTabWaitOptions = {
  requestId?: string
  origin?: string
  signal?: AbortSignal
}

const TAB_LOAD_TIMEOUT_MS = 20_000
const DOCUMENT_FALLBACK_BUDGET_MS = 3_000
const admittedDocuments = createDeploymentProbeMemory<{
  url: string
  timeOrigin: number
}>({ ttlMs: 120_000 })

/** Wait for full tab load and clear any protection pages. */
export function waitForTabComplete(
  tabId: number,
  meta?: ProtectedTabWaitOptions,
) {
  return waitForProtectedTab(tabId, meta)
}

/** Wait for a committed target document and clear any protection pages. */
export function waitForTabDocumentReady(
  tabId: number,
  url: string,
  meta?: ProtectedTabWaitOptions & {
    allowLoadedRedirect?: boolean
    timeoutMs?: number
  },
) {
  const target = tryParseHttpUrl(url)
  if (!target) return Promise.reject(new Error("Invalid document URL"))
  return waitForProtectedTab(tabId, meta, {
    target,
    allowLoadedRedirect: meta?.allowLoadedRedirect,
    timeoutMs: meta?.timeoutMs,
  })
}

/** Check the actual top-level document before skipping the full load event. */
async function readInteractiveDocumentTime(tabId: number, url: string) {
  try {
    const response = await sendTabMessageWithRetry<{
      url: string
      readyState: string
      timeOrigin: number
    }>(
      tabId,
      { action: RuntimeActionIds.ContentGetDocumentState },
      { frameId: 0, maxAttempts: 1 },
    )
    if (
      response?.url === url &&
      response.readyState === "interactive" &&
      Number.isFinite(response.timeOrigin)
    )
      return response.timeOrigin
  } catch {
    return undefined
  }
}

/** Share protection checks and timeouts across both readiness modes. */
function waitForProtectedTab(
  tabId: number,
  meta?: ProtectedTabWaitOptions,
  document?: { target: URL; allowLoadedRedirect?: boolean; timeoutMs?: number },
): Promise<void> {
  const loadTimeout = document?.timeoutMs ?? TAB_LOAD_TIMEOUT_MS
  const fallbackAt = Date.now() + loadTimeout
  const documentKey =
    document && meta?.requestId ? `${tabId}:${meta.requestId}` : undefined
  const cached = documentKey ? admittedDocuments.read(documentKey) : undefined
  return new Promise((resolve, reject) => {
    let settled = false
    let verificationRequired = false
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
    const timeout = setTimeout(
      () => {
        logTempWindow("waitForTabCompleteTimeout", {
          tabId,
          requestId: meta?.requestId ?? null,
          origin: meta?.origin ?? null,
        })
        finish(
          verificationRequired
            ? new ProtectionPageTimeoutError(
                t("messages:background.pageLoadTimeout"),
              )
            : new Error(t("messages:background.pageLoadTimeout")),
        )
      },
      loadTimeout + (document ? DOCUMENT_FALLBACK_BUDGET_MS : 0),
    )

    meta?.signal?.addEventListener("abort", cancel, { once: true })
    if (meta?.signal?.aborted) {
      cancel()
      return
    }

    let attempts = 0
    let lastPassed: boolean | null = null
    let lastCapPassed: boolean | null = null
    let lastCloudflarePassed: boolean | null = null
    let lastAliyunPassed: boolean | null = null
    let lastTabStatus: string | undefined

    logTempWindow("waitForTabCompleteStart", {
      tabId,
      requestId: meta?.requestId ?? null,
      origin: meta?.origin ?? null,
    })

    const checkStatus = async () => {
      if (settled) return
      try {
        const tab: browser.tabs.Tab & { pendingUrl?: string } =
          await getTab(tabId)

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

        const current = document && tryParseHttpUrl(tab.url)
        const loaded =
          tab.status === "complete" &&
          (!document ||
            (!tab.pendingUrl &&
              (document.allowLoadedRedirect ||
                (current?.origin === document.target.origin &&
                  current.pathname === document.target.pathname))))
        const canProbe =
          document &&
          tab.status === "loading" &&
          !tab.pendingUrl &&
          current?.href === document.target.href &&
          (Date.now() >= fallbackAt || cached?.url === current.href)
        const documentTime = canProbe
          ? await readInteractiveDocumentTime(tabId, current.href)
          : undefined
        const interactive =
          documentTime !== undefined &&
          (Date.now() >= fallbackAt || cached?.timeOrigin === documentTime)
        if (settled) return
        if (loaded || interactive) {
          let capPassed = false
          let cloudflarePassed = false
          let aliyunPassed = false
          let passed = false

          try {
            const result = await checkTempContextProtectionGuards({
              tabId,
              requestId: meta?.requestId,
            })
            capPassed = result.capPassed
            cloudflarePassed = result.cloudflarePassed
            aliyunPassed = result.aliyunPassed
            passed = result.passed
            verificationRequired = result.verificationRequired
          } catch (error) {
            logger.warn("Guard checks via content script failed", error)
          }

          if (settled) return

          if (
            lastPassed !== passed ||
            lastCapPassed !== capPassed ||
            lastCloudflarePassed !== cloudflarePassed ||
            lastAliyunPassed !== aliyunPassed
          ) {
            lastPassed = passed
            lastCapPassed = capPassed
            lastCloudflarePassed = cloudflarePassed
            lastAliyunPassed = aliyunPassed
            logTempWindow("protectionGuardCheck", {
              tabId,
              requestId: meta?.requestId ?? null,
              origin: meta?.origin ?? null,
              passed,
              capPassed,
              cloudflarePassed,
              aliyunPassed,
              attempt: attempts,
            })
          }
          if (passed) {
            if (interactive && current) {
              retry = setTimeout(async () => {
                try {
                  const latest: browser.tabs.Tab & { pendingUrl?: string } =
                    await getTab(tabId)
                  if (
                    latest.url === current.href &&
                    !latest.pendingUrl &&
                    (await readInteractiveDocumentTime(tabId, current.href)) ===
                      documentTime
                  ) {
                    if (settled) return
                    if (documentKey)
                      admittedDocuments.remember(documentKey, {
                        url: current.href,
                        timeOrigin: documentTime,
                      })
                    finish()
                    return
                  }
                } catch {
                  // Recheck under the normal timeout if the document was replaced.
                }
                void checkStatus()
              }, 500)
            } else {
              clearTimeout(timeout)
              retry = setTimeout(() => finish(), 500)
            }
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
