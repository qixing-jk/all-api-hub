import { RuntimeActionIds } from "~/constants/runtimeActions"
import { isAccountSiteType, type AccountSiteType } from "~/constants/siteType"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { type TEMP_CONTEXT_TASK_KINDS } from "~/services/protectionBypass/contracts"
import {
  TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS,
  type TempWindowCheckinPageAction,
  type TempWindowPageAccountIdentity,
} from "~/types/tempWindowFetch"
import {
  TURNSTILE_PRE_TRIGGER_KINDS,
  type CheckinPageActionTriggerResult,
} from "~/types/turnstile"
import { sendTabMessageWithRetry } from "~/utils/browser/runtimeMessages"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { sanitizeUrlForLog } from "~/utils/core/sanitizeUrlForLog"
import { t } from "~/utils/i18n/core"

import {
  type AuthorizeTempContextAtAcquire,
  type TaskParams,
} from "./contracts"
import { logger, logTempWindow, normalizeOrigin } from "./diagnostics"
import {
  TEMP_WINDOW_FETCH_NO_RESPONSE_ERROR,
  toTempWindowFailureResponse,
} from "./failures"
import { tempWindowBackgroundRuntime } from "./runtime"

interface TempPageAccountIdentityContentResponse {
  success?: boolean
  error?: string
  data?: {
    userId?: unknown
    user?: unknown
    siteTypeHint?: unknown
  }
}

/**
 * Resolves the logged-in account identity from a temporary page tab.
 */
async function resolveTempPageAccountIdentity(params: {
  tabId: number
  url: string
  siteType: AccountSiteType
}): Promise<TempWindowPageAccountIdentity | null> {
  let userResponse: TempPageAccountIdentityContentResponse
  try {
    userResponse =
      await sendTabMessageWithRetry<TempPageAccountIdentityContentResponse>(
        params.tabId,
        {
          action: RuntimeActionIds.ContentGetUserFromLocalStorage,
          url: params.url,
          siteType: params.siteType,
        },
      )
  } catch (error) {
    logger.warn("Temporary page account identity lookup failed", {
      reason: getErrorMessage(error),
    })
    return null
  }

  if (!userResponse || !userResponse.success) {
    logger.warn("Temporary page account identity lookup failed", {
      reason: userResponse?.error ?? null,
    })
    return null
  }

  const userId = normalizeAccountIdentity(userResponse.data?.userId)
  if (!userId) return null

  const siteTypeHint = isAccountSiteType(userResponse.data?.siteTypeHint)
    ? userResponse.data.siteTypeHint
    : undefined

  return {
    userId,
    user: userResponse.data?.user ?? null,
    ...(siteTypeHint ? { siteTypeHint } : {}),
  }
}

/**
 * Opens a temporary page context and triggers the native check-in page action after identity verification.
 */
export async function executeTempWindowCheckinPageAction(
  request: TaskParams<typeof TEMP_CONTEXT_TASK_KINDS.NativePageAction>,
  suppressMinimize: boolean,
  sendResponse: (response?: TempWindowCheckinPageAction) => void,
  authorizeAtAcquire?: AuthorizeTempContextAtAcquire,
) {
  const { originUrl, pageUrl, requestId, siteType, expectedUserId, trigger } =
    request
  if (
    !originUrl ||
    !pageUrl ||
    !expectedUserId ||
    !isAccountSiteType(siteType)
  ) {
    sendResponse({
      success: false,
      reason: "invalid_request",
      error: t("messages:background.invalidFetchRequest"),
    })
    return
  }

  const tempRequestId =
    requestId || safeRandomUUID(`temp-checkin-page-action-${pageUrl}`)

  logTempWindow("tempWindowCheckinPageActionStart", {
    requestId: tempRequestId,
    origin: normalizeOrigin(originUrl),
    pageUrl: sanitizeUrlForLog(pageUrl),
    siteType,
  })

  try {
    const context = await tempWindowBackgroundRuntime.acquire(
      pageUrl,
      tempRequestId,
      suppressMinimize,
      {},
      authorizeAtAcquire,
    )
    const { tabId } = context

    await context.navigate(pageUrl, {
      requestId: tempRequestId,
      origin: normalizeOrigin(originUrl),
    })

    const identity = await resolveTempPageAccountIdentity({
      tabId,
      url: pageUrl,
      siteType,
    })

    const normalizedExpectedUserId = normalizeAccountIdentity(expectedUserId)
    if (!identity || !normalizedExpectedUserId) {
      sendResponse({
        success: false,
        reason: "identity_missing",
        identity,
      })
      return
    }

    if (identity.userId !== normalizedExpectedUserId) {
      sendResponse({
        success: false,
        reason: TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.IdentityMismatch,
        identity,
        expectedUserId: normalizedExpectedUserId,
      })
      return
    }

    const triggerResponse = await sendTabMessageWithRetry(tabId, {
      action: RuntimeActionIds.ContentTriggerCheckinPageAction,
      requestId: tempRequestId,
      trigger: trigger ?? { kind: TURNSTILE_PRE_TRIGGER_KINDS.CheckinButton },
    })

    if (!triggerResponse || triggerResponse.success !== true) {
      sendResponse({
        success: false,
        reason: TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.TriggerFailed,
        identity,
        error: triggerResponse?.error ?? TEMP_WINDOW_FETCH_NO_RESPONSE_ERROR,
      })
      return
    }

    const triggerResult = triggerResponse as CheckinPageActionTriggerResult & {
      success: true
    }
    const reason =
      triggerResult.status === TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.Clicked
        ? TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.Clicked
        : triggerResult.status ===
            TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.TargetNotFound
          ? TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.TargetNotFound
          : triggerResult.status ===
              TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.Throttled
            ? TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.Throttled
            : TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.TriggerFailed

    sendResponse({
      success: triggerResult.clicked,
      reason,
      identity,
      trigger: {
        status: triggerResult.status,
        clicked: triggerResult.clicked,
        reason: triggerResult.reason,
        detection: triggerResult.detection,
        ...(triggerResult.target ? { target: triggerResult.target } : {}),
        ...(triggerResult.error ? { error: triggerResult.error } : {}),
      },
      ...(triggerResult.error ? { error: triggerResult.error } : {}),
    })
  } catch (error) {
    const failure = toTempWindowFailureResponse(error)
    logTempWindow("tempWindowCheckinPageActionError", {
      requestId: tempRequestId,
      error: failure.error,
    })
    await tempWindowBackgroundRuntime.release(tempRequestId, {
      forceClose: true,
      reason: "tempWindowCheckinPageActionError",
    })
    sendResponse({
      success: false,
      reason: TEMP_WINDOW_CHECKIN_PAGE_ACTION_REASONS.TriggerFailed,
      error: failure.error,
      code: failure.code,
    })
  } finally {
    await tempWindowBackgroundRuntime.release(tempRequestId)
  }
}
