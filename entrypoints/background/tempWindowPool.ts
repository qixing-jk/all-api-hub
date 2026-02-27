import { t } from "i18next"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { TURNSTILE_DEFAULT_QUERY_PARAM_NAME } from "~/constants/turnstile"
import { accountStorage } from "~/services/accountStorage"
import { getSiteType } from "~/services/detectSiteType"
import {
  DEFAULT_PREFERENCES,
  TempWindowFallbackPreferences,
  userPreferences,
} from "~/services/userPreferences"
import { AuthTypeEnum } from "~/types"
import type {
  TempWindowFetchParams,
  TempWindowTurnstileFetchParams,
  TempWindowTurnstileMeta,
} from "~/types/tempWindowFetch"
import { resolveAuthTypeEnum } from "~/utils/authType"
import {
  createTab,
  createWindow,
  hasWindowsAPI,
  isAllowedIncognitoAccess,
  onTabRemoved,
  onWindowRemoved,
  removeTabOrWindow,
} from "~/utils/browserApi"
import {
  addAuthMethodHeader,
  AUTH_MODE,
  COOKIE_SESSION_OVERRIDE_HEADER_NAME,
  getCookieHeaderForUrl,
} from "~/utils/cookieHelper"
import { mergeCookieHeaders } from "~/utils/cookieString"
import {
  applyTempWindowCookieRule,
  removeTempWindowCookieRule,
} from "~/utils/dnrCookieInjector"
import { getErrorMessage } from "~/utils/error"
import { safeRandomUUID } from "~/utils/identifier"
import { createLogger } from "~/utils/logger"
import { isProtectionBypassFirefoxEnv } from "~/utils/protectionBypass"
import { sanitizeUrlForLog } from "~/utils/sanitizeUrlForLog"
import { appendQueryParam } from "~/utils/url"

/**
 * Unified logger scoped to background temp-window lifecycle and fetch helpers.
 */
const logger = createLogger("TempWindowPool")

const TEMP_CONTEXT_IDLE_TIMEOUT = 5000
const QUIET_WINDOW_IDLE_TIMEOUT = 3000
const DEFAULT_TEMP_CONTEXT_MODE: TempWindowFallbackPreferences["tempContextMode"] =
  "composite"

const TEMP_WINDOW_FETCH_NO_RESPONSE_ERROR = "No response from temp window fetch"

/** Retry delay when the content script is not ready to receive messages. */
const SHIELD_BYPASS_UI_RETRY_MS = 250
/** Max retry attempts for showing the shield-bypass UI in the temp tab. */
const SHIELD_BYPASS_UI_MAX_RETRIES = 20

/**
 * Best-effort: Ask the content script in the temporary tab/window to show a
 * small prompt so users know the page was opened for protection (shield) bypass.
 */
async function showShieldBypassUiInTab(meta: {
  tabId: number
  origin: string
  requestId: string
}) {
  for (let attempt = 1; attempt <= SHIELD_BYPASS_UI_MAX_RETRIES; attempt += 1) {
    try {
      await browser.tabs.sendMessage(meta.tabId, {
        action: RuntimeActionIds.ContentShowShieldBypassUi,
        origin: meta.origin,
        requestId: meta.requestId,
      })
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
 * Falls back to default when preferences are unavailable.
 */
async function resolveTempContextMode(): Promise<
  TempWindowFallbackPreferences["tempContextMode"]
> {
  try {
    const prefs = await userPreferences.getPreferences()
    const mode =
      (prefs.tempWindowFallback as TempWindowFallbackPreferences | undefined)
        ?.tempContextMode ??
      (DEFAULT_PREFERENCES.tempWindowFallback as TempWindowFallbackPreferences)
        .tempContextMode

    return mode ?? DEFAULT_TEMP_CONTEXT_MODE
  } catch {
    return (
      (DEFAULT_PREFERENCES.tempWindowFallback as TempWindowFallbackPreferences)
        .tempContextMode ?? DEFAULT_TEMP_CONTEXT_MODE
    )
  }
}

/**
 * Prepares fetch options for temp-context requests by applying cookie/session overrides when needed.
 */
async function prepareTempContextFetchOptions(params: {
  tabId: number
  url: string
  rawOptions: Record<string, any>
  resolvedAuthType?: AuthTypeEnum
  accountId?: string
  cookieAuthSessionCookie?: string
  addFirefoxAuthModeHeader?: boolean
}): Promise<{
  ruleId: number | null
  effectiveFetchOptions: Record<string, any>
}> {
  const { tabId, url, rawOptions, resolvedAuthType } = params

  let ruleId: number | null = null
  let effectiveFetchOptions: Record<string, any> = rawOptions

  // Chromium-based browsers: for token-auth (credentials=omit) we still need WAF cookies,
  // but MUST exclude session cookies to prevent cross-account contamination (issue #204).
  if (!isProtectionBypassFirefoxEnv() && rawOptions.credentials === "omit") {
    const cookieHeader = await getCookieHeaderForUrl(url, {
      includeSession: false,
    })

    if (cookieHeader) {
      ruleId = await applyTempWindowCookieRule({
        tabId,
        url,
        cookieHeader,
      })

      if (ruleId) {
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
          ? (await accountStorage.getAccountById(params.accountId))?.cookieAuth
              ?.sessionCookie
          : undefined

    if (sessionCookie && sessionCookie.trim()) {
      const wafCookieHeader = await getCookieHeaderForUrl(url, {
        includeSession: false,
      })
      const mergedCookieHeader = mergeCookieHeaders(
        wafCookieHeader,
        sessionCookie,
      )

      if (!isProtectionBypassFirefoxEnv()) {
        // Chromium: inject Cookie header per-tab using DNR.
        ruleId = await applyTempWindowCookieRule({
          tabId,
          url,
          cookieHeader: mergedCookieHeader,
        })

        if (ruleId) {
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

  return { ruleId, effectiveFetchOptions }
}

/**
 * 在临时上下文中渲染页面并读取真实的 document.title。
 */
export async function handleTempWindowGetRenderedTitle(
  request: any,
  sendResponse: (response?: any) => void,
) {
  const { originUrl, requestId, suppressMinimize } = request
  const tempRequestId = requestId || `temp-title-${Date.now()}`

  logTempWindow("tempWindowGetRenderedTitleStart", {
    requestId: tempRequestId,
    origin: originUrl ? normalizeOrigin(originUrl) : null,
  })

  try {
    const context = await acquireTempContext(
      originUrl,
      tempRequestId,
      suppressMinimize,
    )
    const { tabId } = context

    const response = await browser.tabs.sendMessage(tabId, {
      action: RuntimeActionIds.ContentGetRenderedTitle,
      requestId: tempRequestId,
    })

    if (!response) {
      throw new Error("No response from rendered title fetch")
    }

    sendResponse(response)
  } catch (error) {
    logTempWindow("tempWindowGetRenderedTitleError", {
      requestId: tempRequestId,
      error: getErrorMessage(error),
    })
    await releaseTempContext(tempRequestId, {
      forceClose: true,
      reason: "tempWindowGetRenderedTitleError",
    })
    sendResponse({ success: false, error: getErrorMessage(error) })
  } finally {
    await releaseTempContext(tempRequestId)
  }
}

/**
 * Log temporary window events through the unified logger.
 */
function logTempWindow(event: string, details?: Record<string, unknown>) {
  try {
    logger.debug(event, details)
  } catch {
    // ignore logging errors
  }
}

export type TempContext = {
  id: number
  tabId: number
  origin: string
  type: "window" | "tab"
  busy: boolean
  lastUsed: number
  releaseTimer?: ReturnType<typeof setTimeout>
}

// 手动打开的临时窗口/标签页
const tempWindows = new Map<string, number>()

const tempRequestContextMap = new Map<string, TempContext>()
const tempContextById = new Map<number, TempContext>()
const tempContextByTabId = new Map<number, TempContext>()
const tempContextsByOrigin = new Map<string, TempContext[]>()
const originLocks = new Map<string, Promise<void>>()
// 正在销毁上下文池的 origin，用于防止获取/复用与销毁操作并发冲突
const destroyingOrigins = new Set<string>()

type CompositeWindowCreationResult = { windowId: number; tabId: number }

let compositeWindowId: number | null = null
let compositeWindowCreatePromise: Promise<CompositeWindowCreationResult> | null =
  null

/**
 * 设置临时窗口/标签页相关的浏览器事件监听器。
 *
 * - 监听 window/tab 关闭事件
 * - 清理对应的临时上下文和映射
 */
export function setupTempWindowListeners() {
  // 监听窗口/标签页关闭事件，清理记录
  onWindowRemoved(handleTempWindowRemoved)

  // 手机: 监听标签页关闭
  onTabRemoved(handleTempTabRemoved)
}

/**
 * 处理临时窗口关闭事件，移除 tempWindows 记录并销毁对应的 window 上下文。
 */
function handleTempWindowRemoved(windowId: number) {
  if (compositeWindowId === windowId) {
    compositeWindowId = null
    logTempWindow("compositeWindowRemoved", { windowId })
  }

  let removedRequestId: string | undefined
  for (const [requestId, storedId] of tempWindows.entries()) {
    if (storedId === windowId) {
      tempWindows.delete(requestId)
      removedRequestId = requestId
      break
    }
  }

  logTempWindow("windowRemoved", {
    windowId,
    requestId: removedRequestId ?? null,
  })

  const context = tempContextById.get(windowId)
  if (context && context.type === "window") {
    withOriginLock(context.origin, () =>
      destroyContext(context, {
        skipBrowserRemoval: true,
        reason: "windowRemoved",
      }),
    ).catch((error) => {
      logger.error("Failed to cleanup removed window context", error)
    })
  }
}

/**
 * 处理临时标签页关闭事件，移除 tempWindows 记录并销毁对应的 tab 上下文。
 */
function handleTempTabRemoved(tabId: number) {
  let removedRequestId: string | undefined
  for (const [requestId, storedId] of tempWindows.entries()) {
    if (storedId === tabId) {
      tempWindows.delete(requestId)
      removedRequestId = requestId
      break
    }
  }

  logTempWindow("tabRemoved", {
    tabId,
    requestId: removedRequestId ?? null,
  })

  const context = tempContextByTabId.get(tabId)
  if (context && context.type === "tab") {
    withOriginLock(context.origin, () =>
      destroyContext(context, {
        skipBrowserRemoval: true,
        reason: "tabRemoved",
      }),
    ).catch((error) => {
      logger.error("Failed to cleanup removed tab context", error)
    })
  }
}

/**
 * 根据请求参数打开临时窗口或标签页，并记录 requestId 与 window/tabId 的映射。
 */
export async function handleOpenTempWindow(
  request: any,
  sendResponse: (response?: any) => void,
) {
  try {
    const { url, requestId } = request
    const preferredMode = await resolveTempContextMode()
    const origin = normalizeOrigin(url)

    logTempWindow(RuntimeActionIds.OpenTempWindow, {
      requestId,
      origin,
      url: sanitizeUrlForLog(url),
      preferredMode,
    })

    const shouldUseWindow = preferredMode === "window" && hasWindowsAPI()
    const shouldUseComposite = preferredMode === "composite" && hasWindowsAPI()

    if (shouldUseComposite) {
      const { windowId, tabId } = await openTabInCompositeWindow({
        url,
        origin,
        requestId,
        suppressMinimize: true,
      })

      tempWindows.set(requestId, tabId)
      logTempWindow("openTempCompositeTabSuccess", {
        requestId,
        windowId,
        tabId,
      })
      sendResponse({ success: true, windowId, tabId })
    } else if (shouldUseWindow) {
      // 创建新窗口
      const window = await createWindow({
        url: url,
        type: "popup",
        width: 800,
        height: 600,
        focused: false,
      })

      if (window?.id) {
        // 记录窗口ID
        tempWindows.set(requestId, window.id)
        logTempWindow("openTempWindowSuccess", {
          requestId,
          windowId: window.id,
        })
        sendResponse({ success: true, windowId: window.id })
      } else {
        logTempWindow("openTempWindowFailed", {
          requestId,
          reason: "noWindowId",
          preferredMode,
        })
        sendResponse({
          success: false,
          error: t("messages:background.cannotCreateWindow"),
        })
      }
    } else {
      // 使用标签页
      const tab = await createTab(url, false)
      if (tab?.id) {
        tempWindows.set(requestId, tab.id)
        logTempWindow("openTempTabSuccess", {
          requestId,
          tabId: tab.id,
          preferredMode,
        })
        sendResponse({ success: true, tabId: tab.id })
      } else {
        logTempWindow("openTempTabFailed", {
          requestId,
          reason: "noTabId",
          preferredMode,
        })
        sendResponse({
          success: false,
          error: t("messages:background.cannotCreateWindow"),
        })
      }
    }
  } catch (error) {
    logTempWindow("openTempWindowError", {
      requestId: request?.requestId ?? null,
      error: getErrorMessage(error),
    })
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}

/**
 * 关闭指定 requestId 关联的临时窗口/标签页，或释放临时上下文。
 */
export async function handleCloseTempWindow(
  request: any,
  sendResponse: (response?: any) => void,
) {
  try {
    const { requestId } = request
    const id = tempWindows.get(requestId)

    logTempWindow(RuntimeActionIds.CloseTempWindow, {
      requestId,
      mappedId: id ?? null,
      hasRequestContext: requestId
        ? tempRequestContextMap.has(requestId)
        : false,
    })

    if (id) {
      await removeTabOrWindow(id)
      tempWindows.delete(requestId)
      logTempWindow("closeTempWindowSuccess", {
        requestId,
        removedId: id,
      })
      sendResponse({ success: true })
      return
    }

    if (requestId && tempRequestContextMap.has(requestId)) {
      await releaseTempContext(requestId, {
        forceClose: true,
        reason: "manualClose",
      })
      sendResponse({ success: true })
      return
    }

    logTempWindow("closeTempWindowNotFound", {
      requestId,
    })
    sendResponse({
      success: false,
      error: t("messages:background.windowNotFound"),
    })
  } catch (error) {
    logTempWindow("closeTempWindowError", {
      requestId: request?.requestId ?? null,
      error: getErrorMessage(error),
    })
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}

/**
 * 自动检测站点类型与用户信息，通过临时上下文访问目标站点。
 */
export async function handleAutoDetectSite(
  request: any,
  sendResponse: (response?: any) => void,
) {
  const { url, requestId } = request

  try {
    const [userData, siteType] = await Promise.all([
      getSiteDataFromTab(url, requestId),
      getSiteType(url),
    ])

    let result = null
    if (siteType && userData) {
      result = {
        siteType,
        ...(userData ?? {}),
      }
    }
    logger.debug("自动检测结果", {
      siteType: siteType ?? null,
      hasUser: Boolean(userData),
    })

    // 返回结果
    sendResponse({
      success: true,
      data: result,
    })
  } catch (error) {
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}

/**
 * 在临时上下文中执行跨域 fetch 请求，用于绕过需要真实浏览器环境的接口访问。
 */
export async function handleTempWindowFetch(
  request: TempWindowFetchParams,
  sendResponse: (response?: any) => void,
) {
  const {
    originUrl,
    fetchUrl,
    fetchOptions,
    responseType = "json",
    requestId,
    suppressMinimize,
    accountId,
    authType,
    cookieAuthSessionCookie,
  } = request

  if (!originUrl || !fetchUrl) {
    sendResponse({
      success: false,
      error: t("messages:background.invalidFetchRequest"),
    })
    return
  }

  const tempRequestId = requestId || safeRandomUUID(`temp-fetch-${fetchUrl}`)

  logTempWindow("tempWindowFetchStart", {
    requestId: tempRequestId,
    origin: originUrl ? normalizeOrigin(originUrl) : null,
    fetchUrl: fetchUrl ? sanitizeUrlForLog(fetchUrl) : null,
    responseType,
  })

  let ruleId: number | null = null

  const rawOptions = (fetchOptions ?? {}) as Record<string, any>
  let effectiveFetchOptions: Record<string, any> = rawOptions

  const resolvedAuthType = resolveAuthTypeEnum(authType)

  try {
    const context = await acquireTempContext(
      originUrl,
      tempRequestId,
      suppressMinimize,
    )
    const { tabId } = context

    const prepared = await prepareTempContextFetchOptions({
      tabId,
      url: fetchUrl,
      rawOptions,
      resolvedAuthType,
      accountId,
      cookieAuthSessionCookie,
    })
    ruleId = prepared.ruleId
    effectiveFetchOptions = prepared.effectiveFetchOptions

    const response = await browser.tabs.sendMessage(tabId, {
      action: RuntimeActionIds.ContentPerformTempWindowFetch,
      requestId: tempRequestId,
      fetchUrl,
      fetchOptions: effectiveFetchOptions,
      responseType,
    })

    if (!response) {
      throw new Error(TEMP_WINDOW_FETCH_NO_RESPONSE_ERROR)
    }

    sendResponse(response)
  } catch (error) {
    logTempWindow("tempWindowFetchError", {
      requestId: tempRequestId,
      error: getErrorMessage(error),
    })
    await releaseTempContext(tempRequestId, {
      forceClose: true,
      reason: "tempWindowFetchError",
    })
    sendResponse({ success: false, error: getErrorMessage(error) })
  } finally {
    if (ruleId) {
      await removeTempWindowCookieRule(ruleId)
    }

    await releaseTempContext(tempRequestId)
  }
}

/**
 * Executes a Turnstile-assisted temp-context fetch.
 *
 * This flow navigates the temporary tab to a page that can render Turnstile,
 * waits for protection guards to clear, waits for a Turnstile token in the
 * content script, then replays the target request in the same tab.
 */
export async function handleTempWindowTurnstileFetch(
  request: TempWindowTurnstileFetchParams,
  sendResponse: (response?: any) => void,
) {
  const {
    originUrl,
    pageUrl,
    useIncognito,
    fetchUrl,
    fetchOptions,
    responseType = "json",
    requestId,
    suppressMinimize,
    accountId,
    authType,
    cookieAuthSessionCookie,
    turnstileTimeoutMs,
    turnstileParamName,
    turnstilePreTrigger,
  } = request

  const turnstile: TempWindowTurnstileMeta = {
    status: "error",
    hasTurnstile: false,
  }

  if (!originUrl || !pageUrl || !fetchUrl) {
    sendResponse({
      success: false,
      error: t("messages:background.invalidFetchRequest"),
      turnstile,
    })
    return
  }

  const tempRequestId =
    requestId || safeRandomUUID(`temp-turnstile-fetch-${fetchUrl}`)

  logTempWindow("tempWindowTurnstileFetchStart", {
    requestId: tempRequestId,
    origin: originUrl ? normalizeOrigin(originUrl) : null,
    pageUrl: pageUrl ? sanitizeUrlForLog(pageUrl) : null,
    fetchUrl: fetchUrl ? sanitizeUrlForLog(fetchUrl) : null,
    responseType,
  })

  let ruleId: number | null = null

  const rawOptions = (fetchOptions ?? {}) as Record<string, any>
  let effectiveFetchOptions: Record<string, any> = rawOptions

  const resolvedAuthType = resolveAuthTypeEnum(authType)

  try {
    if (useIncognito) {
      const allowed = await isAllowedIncognitoAccess()
      if (allowed === false) {
        sendResponse({
          success: false,
          error: t("messages:background.incognitoAccessRequired"),
          turnstile,
        })
        return
      }
    }

    const context = await acquireTempContext(
      pageUrl,
      tempRequestId,
      suppressMinimize,
      { incognito: Boolean(useIncognito) },
    )
    const { tabId } = context

    // Ensure the temp tab is on the requested page URL so Turnstile can render.
    await browser.tabs.update(tabId, { url: pageUrl })
    await waitForTabComplete(tabId, {
      requestId: tempRequestId,
      origin: normalizeOrigin(originUrl),
    })

    const turnstileResponse = await browser.tabs.sendMessage(tabId, {
      action: RuntimeActionIds.ContentWaitForTurnstileToken,
      requestId: tempRequestId,
      timeoutMs: turnstileTimeoutMs,
      preTrigger: turnstilePreTrigger,
    })

    const token =
      turnstileResponse?.success &&
      typeof turnstileResponse?.token === "string" &&
      turnstileResponse.token.trim()
        ? turnstileResponse.token.trim()
        : null

    const status =
      turnstileResponse?.success &&
      typeof turnstileResponse?.status === "string"
        ? String(turnstileResponse.status)
        : "error"

    turnstile.status =
      status === "not_present" ||
      status === "token_obtained" ||
      status === "timeout"
        ? status
        : "error"
    turnstile.hasTurnstile = Boolean(turnstileResponse?.detection?.hasTurnstile)

    if (!token) {
      sendResponse({
        success: false,
        error: "Turnstile token not available",
        turnstile,
      })
      return
    }

    // Never log the token value. `sanitizeUrlForLog` strips the query string.
    const paramName =
      typeof turnstileParamName === "string" && turnstileParamName.trim()
        ? turnstileParamName.trim()
        : TURNSTILE_DEFAULT_QUERY_PARAM_NAME
    const fetchUrlWithToken = appendQueryParam(fetchUrl, paramName, token)

    const prepared = await prepareTempContextFetchOptions({
      tabId,
      url: fetchUrlWithToken,
      rawOptions,
      resolvedAuthType,
      accountId,
      cookieAuthSessionCookie,
      addFirefoxAuthModeHeader: true,
    })
    ruleId = prepared.ruleId
    effectiveFetchOptions = prepared.effectiveFetchOptions

    const response = await browser.tabs.sendMessage(tabId, {
      action: RuntimeActionIds.ContentPerformTempWindowFetch,
      requestId: tempRequestId,
      fetchUrl: fetchUrlWithToken,
      fetchOptions: effectiveFetchOptions,
      responseType,
    })

    if (!response) {
      throw new Error(TEMP_WINDOW_FETCH_NO_RESPONSE_ERROR)
    }

    sendResponse({ ...(response as any), turnstile })
  } catch (error) {
    logTempWindow("tempWindowTurnstileFetchError", {
      requestId: tempRequestId,
      error: getErrorMessage(error),
    })
    await releaseTempContext(tempRequestId, {
      forceClose: true,
      reason: "tempWindowTurnstileFetchError",
    })
    sendResponse({ success: false, error: getErrorMessage(error), turnstile })
  } finally {
    if (ruleId) {
      await removeTempWindowCookieRule(ruleId)
    }

    await releaseTempContext(tempRequestId)
  }
}

/**
 * 通过打开临时标签页获取站点用户信息
 * @param url 页面地址（含 origin），用于确定要打开的临时窗口
 * @param requestId 用于标识本次请求的唯一 ID，便于释放上下文
 */
async function getSiteDataFromTab(
  url: string,
  requestId: string,
  suppressMinimize?: boolean,
) {
  try {
    const context = await acquireTempContext(url, requestId, suppressMinimize)
    const { tabId } = context

    // 通过 content script 获取用户信息
    const userResponse = await browser.tabs.sendMessage(tabId, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: url,
    })

    await releaseTempContext(requestId)

    // 检查响应并返回结果
    if (!userResponse || !userResponse.success) {
      logger.warn("获取用户信息失败", { reason: userResponse?.error ?? null })
      return null
    }

    return {
      userId: userResponse.data?.userId,
      user: userResponse.data?.user,
      accessToken: userResponse.data?.accessToken,
      sub2apiAuth: userResponse.data?.sub2apiAuth,
      siteTypeHint: userResponse.data?.siteTypeHint,
    }
  } catch (error) {
    logger.error("getSiteDataFromTab failed", error)
    logTempWindow("getSiteDataFromTabError", {
      requestId,
      origin: normalizeOrigin(url),
      error: getErrorMessage(error),
    })
    await releaseTempContext(requestId, {
      forceClose: true,
      reason: "getSiteDataFromTabError",
    })
    return null
  }
}

/**
 * 为相同 origin 串行执行异步任务，避免并发读写同一上下文池导致竞态。
 */
async function withOriginLock<T>(
  origin: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = originLocks.get(origin) ?? Promise.resolve()
  let release: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  originLocks.set(origin, pending)
  await previous.catch(() => {})

  try {
    return await task()
  } finally {
    release!()
    if (originLocks.get(origin) === pending) {
      originLocks.delete(origin)
    }
  }
}

/**
 * 销毁指定 origin 的所有上下文（窗口/标签页），用于池整体回收。
 */
async function destroyOriginPool(
  origin: string,
  pool?: TempContext[],
  reason?: string,
) {
  const contexts = pool ?? tempContextsByOrigin.get(origin)
  if (!contexts || contexts.length === 0) {
    return
  }

  logTempWindow("destroyOriginPool", {
    origin,
    poolSize: contexts.length,
    reason: reason ?? null,
  })

  await Promise.all(
    contexts.map((ctx) =>
      destroyContext(ctx, { reason: reason ?? "destroyOriginPool" }).catch(
        (error) => {
          logger.error("Failed to destroy context from pool", {
            contextId: ctx.id,
            tabId: ctx.tabId,
            error,
          })
        },
      ),
    ),
  )
}

/**
 * 获取或创建某个 origin 的临时上下文：
 * - 在 withOriginLock 下保证同一 origin 串行
 * - 如有可复用上下文则复用，否则创建新的窗口/标签页
 * - 使用 destroyingOrigins 防止与销毁流程并发冲突
 */
async function acquireTempContext(
  url: string,
  requestId: string,
  suppressMinimize?: boolean,
  options: { incognito?: boolean } = {},
) {
  const origin = buildTempContextOriginKey(normalizeOrigin(url), options)
  const preferredMode = await resolveTempContextMode()

  logTempWindow("acquireTempContextStart", {
    requestId,
    origin,
    preferredMode,
  })

  return await withOriginLock(origin, async () => {
    // If this origin's pool is in the middle of being destroyed, do not
    // attempt to reuse or create a new context for it.
    if (destroyingOrigins.has(origin)) {
      throw new Error("Temp context pool is being destroyed for this origin")
    }

    let context = await getReusableContext(origin)
    if (!context) {
      logTempWindow("acquireTempContextCreate", {
        requestId,
        origin,
        url: sanitizeUrlForLog(url),
        preferredMode,
      })
      context = await createTempContextInstance(
        url,
        origin,
        requestId,
        preferredMode,
        suppressMinimize,
        options,
      )
      registerContext(origin, context)
      logTempWindow("acquireTempContextCreated", {
        requestId,
        origin,
        contextId: context.id,
        tabId: context.tabId,
        type: context.type,
        preferredMode,
      })
    } else {
      logTempWindow("acquireTempContextReuse", {
        requestId,
        origin,
        contextId: context.id,
        tabId: context.tabId,
        type: context.type,
        preferredMode,
      })
    }

    // It's possible that during async operations the context or its pool was
    // marked for destruction. Perform a final validity check before using it.
    if (destroyingOrigins.has(origin) || !tempContextById.has(context.id)) {
      throw new Error("Acquired temp context is no longer valid")
    }

    context.busy = true
    context.lastUsed = Date.now()
    if (context.releaseTimer) {
      clearTimeout(context.releaseTimer)
      context.releaseTimer = undefined
    }

    tempRequestContextMap.set(requestId, context)
    logTempWindow("acquireTempContextSuccess", {
      requestId,
      origin,
      contextId: context.id,
      tabId: context.tabId,
      type: context.type,
    })
    return context
  })
}

/**
 * 释放与 requestId 关联的临时上下文：
 * - 支持强制关闭（forceClose）直接销毁窗口/标签页
 * - 否则标记为非 busy，并在空闲一段时间后按池粒度销毁。
 */
async function releaseTempContext(
  requestId: string,
  options: { forceClose?: boolean; reason?: string } = {},
) {
  logTempWindow("releaseTempContextScheduled", {
    requestId,
    forceClose: Boolean(options.forceClose),
    reason: options.reason ?? null,
  })
  // 延迟释放，提高并发时的复用率
  setTimeout(async () => {
    const context = tempRequestContextMap.get(requestId)
    tempRequestContextMap.delete(requestId)

    if (!context) {
      logTempWindow("releaseTempContextNoContext", {
        requestId,
        forceClose: Boolean(options.forceClose),
        reason: options.reason ?? null,
      })
      return
    }

    await withOriginLock(context.origin, async () => {
      if (!tempContextById.has(context.id)) {
        logTempWindow("releaseTempContextAlreadyDestroyed", {
          requestId,
          origin: context.origin,
          contextId: context.id,
          tabId: context.tabId,
          type: context.type,
          reason: options.reason ?? null,
        })
        return
      }

      if (options.forceClose) {
        logTempWindow("releaseTempContextForceClose", {
          requestId,
          origin: context.origin,
          contextId: context.id,
          tabId: context.tabId,
          type: context.type,
          reason: options.reason ?? null,
        })
        destroyingOrigins.add(context.origin)
        try {
          await destroyContext(context, {
            reason: options.reason ?? "forceClose",
          })
        } finally {
          destroyingOrigins.delete(context.origin)
        }
        return
      }

      context.busy = false
      context.lastUsed = Date.now()

      const pool = tempContextsByOrigin.get(context.origin)
      if (pool && pool.every((ctx) => !ctx.busy)) {
        logTempWindow("releaseTempContextDestroyOriginPool", {
          requestId,
          origin: context.origin,
          poolSize: pool.length,
        })
        // Mark this origin as destroying while we tear down the pool. Any
        // concurrent acquire attempts for this origin will be rejected by
        // acquireTempContext until destruction finishes.
        destroyingOrigins.add(context.origin)
        try {
          await destroyOriginPool(context.origin, pool, "originPoolIdle")
        } finally {
          destroyingOrigins.delete(context.origin)
        }
      } else {
        logTempWindow("releaseTempContextScheduleIdleCleanup", {
          requestId,
          origin: context.origin,
          contextId: context.id,
          tabId: context.tabId,
          type: context.type,
          idleTimeoutMs: TEMP_CONTEXT_IDLE_TIMEOUT,
        })
        scheduleContextCleanup(context)
      }
    })
  }, 2000)
}

/**
 * 从指定 origin 的上下文池中获取一个仍然存活的上下文：
 * - 不根据 busy 过滤，依赖 withOriginLock 保证同一 origin 串行
 * - 对已失效的上下文进行销毁并从池中移除。
 */
async function getReusableContext(origin: string) {
  const pool = tempContextsByOrigin.get(origin)
  if (!pool || pool.length === 0) {
    return null
  }

  // 注意：这里不检查 context.busy。
  // 同一 origin 的并发通过 withOriginLock 串行化：
  // - 后续请求会等待上一个请求释放再进入 acquireTempContext
  // - 然后复用同一个上下文，而不是在 busy=true 时跳过并创建新的窗口/标签页
  for (const context of pool) {
    if (await isContextAlive(context)) {
      return context
    }

    await destroyContext(context, {
      skipBrowserRemoval: true,
      reason: "contextNotAlive",
    })
  }

  return null
}

/**
 * 创建新的临时窗口/标签页上下文，并等待页面加载及 Cloudflare 校验通过。
 */
async function createTempContextInstance(
  url: string,
  origin: string,
  requestId: string,
  preferredMode: TempWindowFallbackPreferences["tempContextMode"] = DEFAULT_TEMP_CONTEXT_MODE,
  suppressMinimize = false,
  options: { incognito?: boolean } = {},
) {
  let contextId: number | undefined
  let tabId: number | undefined
  let type: "window" | "tab" = "window"
  const useIncognito = Boolean(options.incognito)

  try {
    const canUseWindow =
      hasWindowsAPI() && (useIncognito || preferredMode === "window")
    const canUseComposite =
      !useIncognito && preferredMode === "composite" && hasWindowsAPI()

    if (canUseComposite) {
      const opened = await openTabInCompositeWindow({
        url,
        origin,
        requestId,
        suppressMinimize,
      })

      contextId = opened.tabId
      tabId = opened.tabId
      type = "tab"
    } else if (canUseWindow) {
      const window = await createWindow({
        url,
        type: "popup",
        width: 420,
        height: 520,
        focused: false,
        ...(useIncognito ? ({ incognito: true } as any) : {}),
      })

      if (!window?.id) {
        throw new Error(t("messages:background.cannotCreateWindowOrTab"))
      }

      contextId = window.id
      const tabs = await browser.tabs.query({
        windowId: window.id,
        active: true,
      })
      tabId = tabs[0]?.id

      // Best-effort minimize to reduce disturbance unless suppressed (e.g., popup context).
      if (!suppressMinimize) {
        try {
          await browser.windows.update(window.id, { state: "minimized" })
          logTempWindow("quietWindowMinimized", {
            requestId,
            origin,
            windowId: window.id,
          })
        } catch (minErr) {
          logTempWindow("quietWindowMinimizeFailed", {
            requestId,
            origin,
            windowId: window.id,
            error: getErrorMessage(minErr),
          })
        }
      }
    } else {
      if (useIncognito) {
        throw new Error("Incognito temp context requires window API support")
      }
      const tab = await createTab(url, false)
      contextId = tab?.id
      tabId = tab?.id
      type = "tab"
    }

    if (!contextId || !tabId) {
      throw new Error(t("messages:background.cannotCreateWindowOrTab"))
    }

    logTempWindow("createTempContextInstance", {
      requestId,
      origin,
      contextId,
      tabId,
      type,
      preferredMode,
      url: sanitizeUrlForLog(url),
    })

    // Best-effort: annotate the temporary window/tab so users understand why it opened.
    void showShieldBypassUiInTab({ tabId, origin, requestId })

    await waitForTabComplete(tabId, { requestId, origin })

    logTempWindow("createTempContextInstanceReady", {
      requestId,
      origin,
      contextId,
      tabId,
      type,
      preferredMode,
    })

    return {
      id: contextId,
      tabId,
      origin,
      type,
      busy: false,
      lastUsed: Date.now(),
    }
  } catch (error) {
    logTempWindow("createTempContextInstanceError", {
      requestId,
      origin,
      contextId: contextId ?? null,
      tabId: tabId ?? null,
      type,
      error: getErrorMessage(error),
      preferredMode,
    })
    if (contextId) {
      try {
        await removeTabOrWindow(contextId)
      } catch (cleanupError) {
        logger.warn(
          "Failed to cleanup temp context after creation error",
          cleanupError,
        )
      }
    }
    throw error
  }
}

/**
 * Build a temp-context pool key.
 *
 * The temp-window pool is keyed by origin. When `incognito` is enabled we must
 * keep a separate pool so the temporary context does not inherit normal-mode
 * storage (local/session storage) which can affect Turnstile rendering in
 * multi-account scenarios.
 */
function buildTempContextOriginKey(
  origin: string,
  options: { incognito?: boolean } = {},
): string {
  if (options.incognito) {
    return `incognito:${origin}`
  }

  return origin
}

/**
 * Opens a temporary tab inside a single shared window (composite mode).
 * Reuses the shared window when possible and falls back to recreating it when closed.
 */
async function openTabInCompositeWindow(params: {
  url: string
  origin: string
  requestId: string
  suppressMinimize?: boolean
}): Promise<{ windowId: number; tabId: number }> {
  if (!hasWindowsAPI()) {
    throw new Error(t("messages:background.cannotCreateWindowOrTab"))
  }

  if (compositeWindowId != null) {
    try {
      await browser.windows.get(compositeWindowId)
      const tab = await createTab(params.url, false, {
        windowId: compositeWindowId,
      })
      if (!tab?.id) {
        throw new Error(t("messages:background.cannotCreateWindowOrTab"))
      }

      return { windowId: compositeWindowId, tabId: tab.id }
    } catch (error) {
      logTempWindow("compositeWindowNotAlive", {
        requestId: params.requestId,
        origin: params.origin,
        windowId: compositeWindowId,
        error: getErrorMessage(error),
      })
      compositeWindowId = null
    }
  }

  if (compositeWindowCreatePromise) {
    const { windowId } = await compositeWindowCreatePromise
    const tab = await createTab(params.url, false, { windowId })
    if (!tab?.id) {
      throw new Error(t("messages:background.cannotCreateWindowOrTab"))
    }

    return { windowId, tabId: tab.id }
  }

  compositeWindowCreatePromise = (async () => {
    const window = await createWindow({
      url: params.url,
      type: "normal",
      width: 420,
      height: 520,
      focused: false,
    })

    if (!window?.id) {
      throw new Error(t("messages:background.cannotCreateWindowOrTab"))
    }

    compositeWindowId = window.id

    if (!params.suppressMinimize) {
      try {
        await browser.windows.update(window.id, { state: "minimized" })
        logTempWindow("compositeWindowMinimized", {
          requestId: params.requestId,
          origin: params.origin,
          windowId: window.id,
        })
      } catch (minErr) {
        logTempWindow("compositeWindowMinimizeFailed", {
          requestId: params.requestId,
          origin: params.origin,
          windowId: window.id,
          error: getErrorMessage(minErr),
        })
      }
    }

    const tabs = await browser.tabs.query({
      windowId: window.id,
      active: true,
    })
    const tabId = tabs[0]?.id

    if (!tabId) {
      throw new Error(t("messages:background.cannotCreateWindowOrTab"))
    }

    return { windowId: window.id, tabId }
  })()

  try {
    const { windowId, tabId } = await compositeWindowCreatePromise
    return { windowId, tabId }
  } finally {
    compositeWindowCreatePromise = null
  }
}

/**
 * 将新创建的上下文注册到各种索引映射与 origin 池中。
 */
function registerContext(origin: string, context: TempContext) {
  tempContextById.set(context.id, context)
  tempContextByTabId.set(context.tabId, context)

  const pool = tempContextsByOrigin.get(origin) ?? []
  pool.push(context)
  tempContextsByOrigin.set(origin, pool)
}

/**
 * 为上下文安排空闲销毁定时器，长时间未使用的窗口/标签页会被自动关闭。
 */
function scheduleContextCleanup(context: TempContext) {
  if (context.releaseTimer) {
    clearTimeout(context.releaseTimer)
  }

  const idleTimeoutMs =
    context.type === "window"
      ? QUIET_WINDOW_IDLE_TIMEOUT
      : TEMP_CONTEXT_IDLE_TIMEOUT

  logTempWindow("scheduleContextCleanup", {
    origin: context.origin,
    contextId: context.id,
    tabId: context.tabId,
    type: context.type,
    idleTimeoutMs,
  })

  context.releaseTimer = setTimeout(() => {
    if (!context.busy) {
      logTempWindow("idleContextCleanupTriggered", {
        origin: context.origin,
        contextId: context.id,
        tabId: context.tabId,
        type: context.type,
      })
      destroyContext(context).catch((error) => {
        logger.error("Failed to destroy idle temp context", error)
      })
    }
  }, idleTimeoutMs)
}

/**
 * 销毁单个上下文：
 * - 从各种索引与池中移除
 * - 可选地关闭对应的窗口/标签页。
 */
async function destroyContext(
  context: TempContext,
  options: { skipBrowserRemoval?: boolean; reason?: string } = {},
) {
  if (!tempContextById.has(context.id)) {
    return
  }

  logTempWindow("destroyContext", {
    origin: context.origin,
    contextId: context.id,
    tabId: context.tabId,
    type: context.type,
    skipBrowserRemoval: Boolean(options.skipBrowserRemoval),
    reason: options.reason ?? null,
  })

  if (context.releaseTimer) {
    clearTimeout(context.releaseTimer)
    context.releaseTimer = undefined
  }

  tempContextById.delete(context.id)
  tempContextByTabId.delete(context.tabId)

  const pool = tempContextsByOrigin.get(context.origin)
  if (pool) {
    const remaining = pool.filter((item) => item !== context)
    if (remaining.length === 0) {
      tempContextsByOrigin.delete(context.origin)
    } else {
      tempContextsByOrigin.set(context.origin, remaining)
    }
  }

  for (const [requestId, ctx] of tempRequestContextMap.entries()) {
    if (ctx === context) {
      tempRequestContextMap.delete(requestId)
    }
  }

  if (!options.skipBrowserRemoval) {
    try {
      await removeTabOrWindow(context.id)
    } catch (error) {
      logger.warn("Failed to remove temp context", error)
    }
  }
}

/**
 * 检查上下文对应的标签页是否仍然存在，用于过滤已失效的上下文。
 */
async function isContextAlive(context: TempContext) {
  try {
    await browser.tabs.get(context.tabId)
    return true
  } catch {
    return false
  }
}

/**
 * 规范化 URL，返回 origin（协议 + 域名 + 端口）。
 */
function normalizeOrigin(url: string) {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

type GuardCheckMessageResponse = {
  success: boolean
  passed: boolean
  detection?: unknown
  error?: string
}

export type TempContextProtectionGuardStatus = {
  passed: boolean
  capPassed: boolean
  cloudflarePassed: boolean
  cap?: GuardCheckMessageResponse | null
  cloudflare?: GuardCheckMessageResponse | null
}

/**
 * Parse a guard-check PromiseSettledResult into a stable status shape.
 *
 * Guard checks are performed via content-script messaging and may fail when the
 * page blocks scripts or the content script isn't ready. This helper enforces a
 * defensive response schema before consuming the result.
 */
function parseGuardCheckResult(result: PromiseSettledResult<any>): {
  passed: boolean
  response: GuardCheckMessageResponse | null
} {
  if (result.status === "rejected") {
    return { passed: false, response: null }
  }

  const response = result.value as GuardCheckMessageResponse | null | undefined
  const isValid =
    !!response &&
    typeof response === "object" &&
    typeof response.success === "boolean"

  if (!isValid) {
    return { passed: false, response: null }
  }

  return { passed: Boolean(response.success && response.passed), response }
}

/**
 * Checks protection-bypass readiness for a temp context tab by querying content-side guards.
 *
 * The temp-window flow depends on the browser earning the correct cookies/session state
 * before replaying API requests. Some sites use Cloudflare, others use CAP (cap.js).
 *
 * This helper runs both checks concurrently and returns a combined readiness verdict.
 */
export async function checkTempContextProtectionGuards(params: {
  tabId: number
  requestId?: string
}): Promise<TempContextProtectionGuardStatus> {
  const [capResult, cloudflareResult] = await Promise.allSettled([
    browser.tabs.sendMessage(params.tabId, {
      action: RuntimeActionIds.ContentCheckCapGuard,
      requestId: params.requestId,
    }),
    browser.tabs.sendMessage(params.tabId, {
      action: RuntimeActionIds.ContentCheckCloudflareGuard,
      requestId: params.requestId,
    }),
  ])

  const cap = parseGuardCheckResult(capResult)
  const cloudflare = parseGuardCheckResult(cloudflareResult)

  return {
    passed: cap.passed && cloudflare.passed,
    capPassed: cap.passed,
    cloudflarePassed: cloudflare.passed,
    cap: cap.response,
    cloudflare: cloudflare.response,
  }
}

/**
 * Wait for the temp-context tab to finish loading and clear any protection pages
 * (Cloudflare and/or CAP checkpoint). Rejects on timeout or errors.
 */
function waitForTabComplete(
  tabId: number,
  meta?: { requestId?: string; origin?: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      logTempWindow("waitForTabCompleteTimeout", {
        tabId,
        requestId: meta?.requestId ?? null,
        origin: meta?.origin ?? null,
      })
      reject(new Error(t("messages:background.pageLoadTimeout")))
    }, 20000) // 20秒超时

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
      try {
        const tab = await browser.tabs.get(tabId)

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
            setTimeout(resolve, 500) // 再等待半秒，确保页面 JS 执行完
          } else {
            // 盾页面未通过，继续轮询
            setTimeout(checkStatus, 500)
          }
        } else {
          // 页面未完全加载，继续轮询
          setTimeout(checkStatus, 100)
        }
      } catch (error) {
        clearTimeout(timeout)
        logTempWindow("waitForTabCompleteError", {
          tabId,
          requestId: meta?.requestId ?? null,
          origin: meta?.origin ?? null,
          error: getErrorMessage(error),
        })
        reject(error)
      }
    }

    checkStatus()
  })
}
