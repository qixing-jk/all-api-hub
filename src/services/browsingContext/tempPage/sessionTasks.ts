import { OCTOPUS_COOKIE_SESSION_STATUS_PATH } from "~/constants/octopus"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  API_ERROR_CODES,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"
import {
  type TEMP_CONTEXT_TASK_KINDS,
  type TempContextTask,
} from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { isAllowedIncognitoAccess } from "~/utils/browser/runtime"
import { sendTabMessageWithRetry } from "~/utils/browser/runtimeMessages"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

import {
  type AuthorizeTempContextAtAcquire,
  type TaskParams,
} from "./contracts"
import { logger, logTempWindow, normalizeOrigin } from "./diagnostics"
import {
  reportAuthorizedTempContextOutcome,
  toTempWindowFailureResponse,
} from "./failures"
import { executeTempWindowFetch } from "./fetchTasks"
import { tempWindowBackgroundRuntime } from "./runtime"

/**
 * 在临时上下文中渲染页面并读取真实的 document.title。
 */
export async function executeTempWindowGetRenderedTitle(
  request: TaskParams<typeof TEMP_CONTEXT_TASK_KINDS.RenderedTitle>,
  suppressMinimize: boolean,
  sendResponse: (response?: any) => void,
  authorizeAtAcquire?: AuthorizeTempContextAtAcquire,
) {
  const { originUrl, requestId } = request
  const tempRequestId = requestId || `temp-title-${Date.now()}`

  logTempWindow("tempWindowGetRenderedTitleStart", {
    requestId: tempRequestId,
    origin: originUrl ? normalizeOrigin(originUrl) : null,
  })

  try {
    const context = await tempWindowBackgroundRuntime.acquire(
      originUrl,
      tempRequestId,
      suppressMinimize,
      {},
      authorizeAtAcquire,
    )
    const { tabId } = context

    const response = await sendTabMessageWithRetry(tabId, {
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
    await tempWindowBackgroundRuntime.release(tempRequestId, {
      forceClose: true,
      reason: "tempWindowGetRenderedTitleError",
    })
    const failure = toTempWindowFailureResponse(error)
    sendResponse({ success: false, error: failure.error, code: failure.code })
  } finally {
    await tempWindowBackgroundRuntime.release(tempRequestId)
  }
}

/**
 * Uses Octopus' read-only cookie-session probe instead of the deployment UI.
 * The UI root may be protected by an interactive WAF challenge even when the
 * provider API remains available.
 *
 * Upstream contract: https://github.com/bestruirui/octopus/blob/master/internal/server/handlers/user.go
 */
export function getOctopusCookieContextPageUrl(originUrl: string): string {
  return new URL(OCTOPUS_COOKIE_SESSION_STATUS_PATH, originUrl).toString()
}

/** Executes an explicit open request through the same authorized pool acquire path. */
export async function executeOpenTempContext(
  task: Extract<
    TempContextTask,
    { kind: typeof TEMP_CONTEXT_TASK_KINDS.OpenContext }
  >,
  suppressMinimize: boolean,
  authorizeAtAcquire: AuthorizeTempContextAtAcquire,
  sendResponse: (response?: any) => void,
) {
  const { url, requestId } = task.params
  try {
    const context = await tempWindowBackgroundRuntime.acquire(
      url,
      requestId,
      suppressMinimize,
      {},
      authorizeAtAcquire,
    )
    sendResponse({
      success: true,
      tabId: context.tabId,
      ...(context.ownerWindowId ? { windowId: context.ownerWindowId } : {}),
    })
  } catch (error) {
    const failure = toTempWindowFailureResponse(error)
    sendResponse({ success: false, error: failure.error, code: failure.code })
  }
}

/**
 * Executes the sole protected New API cookie-session read. New API fixes the
 * hidden-key contract at POST /api/channel/:id/key; callers cannot supply a
 * method, endpoint, body, or headers (https://github.com/QuantumNous/new-api).
 */
export async function executeNewApiSessionRead(
  request: TaskParams<typeof TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead>,
  suppressMinimize: boolean,
  sendResponse: (response?: any) => void,
  authorizeAtAcquire: AuthorizeTempContextAtAcquire,
) {
  const fetchUrl = `${request.origin}/api/channel/${request.channelId}/key`
  await executeTempWindowFetch(
    {
      originUrl: request.origin,
      fetchUrl,
      fetchOptions: {
        method: "POST",
        body: "{}",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "New-API-User": request.userId,
        },
      },
      responseType: "json",
      requestId: request.requestId,
      authType: AuthTypeEnum.Cookie,
    },
    suppressMinimize,
    sendResponse,
    authorizeAtAcquire,
  )
}

/**
 * 自动检测站点类型与用户信息，通过临时上下文访问目标站点。
 */
export async function executeAutoDetectSite(
  request: TaskParams<typeof TEMP_CONTEXT_TASK_KINDS.SessionRead>,
  suppressMinimize: boolean,
  sendResponse: (response?: any) => void,
  authorizeAtAcquire?: AuthorizeTempContextAtAcquire,
) {
  const { url, requestId, useIncognito } = request
  try {
    if (useIncognito) {
      const allowed = await isAllowedIncognitoAccess()
      if (allowed === false) {
        reportAuthorizedTempContextOutcome(authorizeAtAcquire, {
          kind: "unavailable",
          reason: "incognito_access_required",
        })
        sendResponse({
          success: false,
          error: t("messages:background.incognitoAccessRequired"),
        })
        return
      }
    }

    const { siteType } = request
    const userData = await getSiteDataFromTab(
      url,
      requestId,
      suppressMinimize,
      {
        incognito: Boolean(useIncognito),
        siteType,
        diagnosticId: request.diagnosticId,
      },
      authorizeAtAcquire,
    )

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
    const failure = toTempWindowFailureResponse(error)
    sendResponse({ success: false, error: failure.error, code: failure.code })
  }
}

/**
 * 通过临时浏览上下文中的标签页获取站点用户信息
 * @param url 页面地址（含 origin），用于确定要获取或创建的临时上下文
 * @param requestId 用于标识本次请求的唯一 ID，便于释放上下文
 */
async function getSiteDataFromTab(
  url: string,
  requestId: string,
  suppressMinimize?: boolean,
  options: {
    incognito?: boolean
    siteType?: string
    diagnosticId?: string
  } = {},
  authorizeAtAcquire?: AuthorizeTempContextAtAcquire,
) {
  try {
    const context = await tempWindowBackgroundRuntime.acquire(
      url,
      requestId,
      suppressMinimize,
      options,
      authorizeAtAcquire,
    )
    const { tabId } = context

    // 通过 content script 获取用户信息
    const userResponse = await sendTabMessageWithRetry(tabId, {
      action: RuntimeActionIds.ContentGetUserFromLocalStorage,
      url: url,
      siteType: options.siteType,
      diagnosticId: options.diagnosticId ?? requestId,
    })

    await tempWindowBackgroundRuntime.release(requestId)

    // 检查响应并返回结果
    if (!userResponse || !userResponse.success) {
      logger.warn("获取用户信息失败", {
        reason: userResponse?.error ?? null,
        requestId,
        diagnosticId: options.diagnosticId ?? requestId,
      })
      return null
    }

    return {
      userId: userResponse.data?.userId,
      user: userResponse.data?.user,
      accessToken: userResponse.data?.accessToken,
      transientAuth: userResponse.data?.transientAuth,
      sub2apiAuth: userResponse.data?.sub2apiAuth,
      ...(userResponse.data?.kimiOpenPlatformAuth
        ? { kimiOpenPlatformAuth: userResponse.data.kimiOpenPlatformAuth }
        : {}),
      siteTypeHint: userResponse.data?.siteTypeHint,
    }
  } catch (error) {
    logger.error("getSiteDataFromTab failed", error)
    logTempWindow("getSiteDataFromTabError", {
      requestId,
      origin: normalizeOrigin(url),
      error: getErrorMessage(error),
    })
    await tempWindowBackgroundRuntime.release(requestId, {
      forceClose: true,
      reason: "getSiteDataFromTabError",
    })
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? (error as { code?: ApiErrorCode }).code
        : undefined
    if (
      errorCode === API_ERROR_CODES.TEMP_WINDOW_DISABLED ||
      errorCode === API_ERROR_CODES.TEMP_WINDOW_PERMISSION_REQUIRED ||
      errorCode === API_ERROR_CODES.TEMP_WINDOW_POLICY_CONTEXT_INVALID
    ) {
      throw error
    }
    return null
  }
}
