import iconUrl from "~/assets/icon.png"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { deliverTurnstileAssistNotice } from "~/services/checkin/turnstile/assistDelivery"
import { probeTurnstilePageApi } from "~/services/checkin/turnstile/pageApi"
import { getBrowserNotificationAvailability } from "~/services/notifications/browserNotificationAvailability"
import { normalizeTempWindowFallbackPreferences } from "~/services/preferences/tempWindowFallbackPreferences"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  clearNotification,
  createNotification,
  onNotificationClicked,
} from "~/utils/browser/notifications"
import {
  onRuntimeMessage,
  sendRuntimeMessage,
  sendTabMessageWithRetry,
} from "~/utils/browser/runtimeMessages"
import { executeMainWorldFunction } from "~/utils/browser/scripting"
import { getTab, queryTabs, updateTab } from "~/utils/browser/tabs"
import { updateWindow } from "~/utils/browser/windows"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

import type { TempContext } from "./contracts"
import { logTempWindow } from "./diagnostics"

/** Owns Turnstile presentations for request leases in the temporary-page pool. */
export function createTempContextTurnstileAssist({
  getRequestContext,
  hasTab,
}: {
  getRequestContext: (requestId: string) => TempContext | undefined
  hasTab: (tabId: number) => boolean
}) {
  const TURNSTILE_ASSIST_NOTIFICATION_PREFIX = "all-api-hub:turnstile-assist:"
  let turnstileAssistNotificationClicksBound = false
  const pageNotices = new Map<string, { tabId?: number }>()

  /** Only the currently focused UI or active web page may acknowledge a reminder. */
  async function notifyCurrentPage(requestId: string) {
    const message = {
      action: RuntimeActionIds.TurnstileAssistPageNotice,
      requestId,
    }
    try {
      const response = await sendRuntimeMessage(message, { maxAttempts: 1 })
      if (response?.presented === true) {
        pageNotices.set(requestId, {})
        return true
      }
    } catch {
      /* There may be no open extension UI. */
    }
    try {
      const [tab] = await queryTabs({ active: true, lastFocusedWindow: true })
      if (typeof tab?.id !== "number" || hasTab(tab.id)) return false
      const response = await sendTabMessageWithRetry(tab.id, message, {
        maxAttempts: 1,
        frameId: 0,
      })
      if (response?.presented !== true) return false
      pageNotices.set(requestId, { tabId: tab.id })
      return true
    } catch {
      return false
    }
  }

  /** Removes reminders when their request finishes or the user opens verification. */
  function clearAssistNotice(requestId: string) {
    const target = pageNotices.get(requestId)
    pageNotices.delete(requestId)
    const message = {
      action: RuntimeActionIds.TurnstileAssistPageNotice,
      requestId,
      dismiss: true,
    }
    if (target) {
      const pending =
        typeof target.tabId === "number"
          ? sendTabMessageWithRetry(target.tabId, message, {
              maxAttempts: 1,
              frameId: 0,
            })
          : sendRuntimeMessage(message, { maxAttempts: 1 })
      void pending.catch(() => {})
    }
    void clearNotification(
      `${TURNSTILE_ASSIST_NOTIFICATION_PREFIX}${requestId}`,
    ).catch(() => {})
  }

  /** Opens the waiting Turnstile window when its notification is clicked. */
  function bindTurnstileAssistNotificationClicks() {
    if (turnstileAssistNotificationClicksBound) return
    turnstileAssistNotificationClicksBound = true
    onNotificationClicked((notificationId) => {
      if (!notificationId.startsWith(TURNSTILE_ASSIST_NOTIFICATION_PREFIX)) {
        return
      }
      const requestId = notificationId.slice(
        TURNSTILE_ASSIST_NOTIFICATION_PREFIX.length,
      )
      void presentTempContextForTurnstileAssist(requestId, { forceFocus: true })
      void clearNotification(notificationId)
    })
  }

  /** Reports whether a system notification can be created for this assist. */
  async function canNotifyTurnstileAssist() {
    return (await getBrowserNotificationAvailability()) === "available"
  }

  /** Sends one clickable notification for the waiting Turnstile window. */
  async function notifyTurnstileAssist(requestId: string) {
    const createdId = await createNotification(
      `${TURNSTILE_ASSIST_NOTIFICATION_PREFIX}${requestId}`,
      {
        type: "basic",
        iconUrl,
        title: t("shieldBypass:notification.turnstileAssistTitle"),
        message: t("shieldBypass:notification.turnstileAssistBody"),
        isClickable: true,
      },
    )
    return createdId !== null
  }

  /** Restores and focuses the temp window that owns this Turnstile wait. */
  async function focusTempContextForTurnstile(context: TempContext) {
    let windowId =
      "ownerWindowId" in context && typeof context.ownerWindowId === "number"
        ? context.ownerWindowId
        : undefined
    if (typeof windowId !== "number") {
      const tab = await getTab(context.tabId)
      windowId = tab?.windowId
    }
    if (typeof windowId === "number") {
      await updateWindow(windowId, {
        state: "normal",
        focused: true,
        drawAttention: true,
      })
    }
    await updateTab(context.tabId, { active: true })
    return windowId ?? null
  }

  /** Reminders keep focus in place; only a reminder click opens verification. */
  async function presentTempContextForTurnstileAssist(
    requestId: unknown,
    options: { forceFocus?: boolean } = {},
  ) {
    const normalized = typeof requestId === "string" ? requestId.trim() : ""
    if (!normalized) {
      return { presented: false as const, reason: "missing_request" as const }
    }

    const context = getRequestContext(normalized)
    if (!context) {
      return { presented: false as const, reason: "missing_context" as const }
    }

    if (!options.forceFocus) {
      const preference = normalizeTempWindowFallbackPreferences(
        (await userPreferences.getPreferences()).tempWindowFallback,
      ).turnstileAssistPresentation
      const delivered = await deliverTurnstileAssistNotice(preference, {
        page: () => notifyCurrentPage(normalized),
        system: async () =>
          (await canNotifyTurnstileAssist()) &&
          (await notifyTurnstileAssist(normalized)),
      })
      if (!getRequestContext(normalized)) {
        clearAssistNotice(normalized)
        return { presented: false as const, reason: "missing_context" as const }
      }
      if (delivered.length > 0)
        return {
          presented: true as const,
          focused: false,
          notified: true,
          channels: delivered,
        }
      return {
        presented: false as const,
        reason:
          preference === "quiet"
            ? ("quiet" as const)
            : ("notice_unavailable" as const),
      }
    }

    clearAssistNotice(normalized)
    if (!getRequestContext(normalized)) {
      return { presented: false as const, reason: "missing_context" as const }
    }

    let focused = false
    const notified = false
    let windowId: number | null = null
    try {
      windowId = await focusTempContextForTurnstile(context)
      focused = true
      // The active content wait owns the lease; opening a reminder starts its
      // fresh manual budget without creating a second tab or replaying actions.
      await sendTabMessageWithRetry(
        context.tabId,
        {
          action: RuntimeActionIds.ContentVerificationAssistOpened,
          requestId: normalized,
        },
        { maxAttempts: 1, frameId: 0 },
      ).catch(() => {})
    } catch (error) {
      logTempWindow("turnstileUserAssistPresentFailed", {
        requestId: normalized,
        error: getErrorMessage(error),
      })
    }

    if (!focused && !notified) {
      return { presented: false as const, reason: "present_failed" as const }
    }

    logTempWindow("turnstileUserAssistPresented", {
      requestId: normalized,
      tabId: context.tabId,
      windowId,
      focused,
      notified,
    })
    return { presented: true as const, focused, notified }
  }

  /**
   * Reads the official Turnstile client API for a temp tab this extension owns.
   */
  async function readTurnstilePageApiForTab(
    tabId: number | undefined,
    allowExecute: boolean,
  ) {
    if (typeof tabId !== "number" || !hasTab(tabId)) {
      return { success: false, token: null, hasApi: false }
    }

    const probe = await executeMainWorldFunction(tabId, probeTurnstilePageApi, [
      allowExecute,
    ])
    return {
      success: true,
      token: probe?.token ?? null,
      hasApi: Boolean(probe?.hasApi),
    }
  }

  /**
   * Handles Turnstile assist messages from the temp tab content script.
   */
  function handleTurnstileAssistMessage(
    request: { action?: string; requestId?: unknown; allowExecute?: unknown },
    sender: browser.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
  ) {
    if (request?.action === RuntimeActionIds.TurnstileRequestUserAssist) {
      void presentTempContextForTurnstileAssist(request.requestId).then(
        sendResponse,
      )
      return true
    }

    if (request?.action === RuntimeActionIds.TurnstileReadPageApi) {
      void readTurnstilePageApiForTab(
        sender.tab?.id,
        request.allowExecute === true,
      ).then(sendResponse)
      return true
    }

    if (request?.action === RuntimeActionIds.TurnstileAssistOpen) {
      const target =
        typeof request.requestId === "string"
          ? pageNotices.get(request.requestId)
          : undefined
      if (
        !target ||
        (typeof target.tabId === "number" && sender.tab?.id !== target.tabId)
      ) {
        sendResponse({ presented: false, reason: "missing_notice" })
        return true
      }
      clearAssistNotice(request.requestId as string)
      void presentTempContextForTurnstileAssist(request.requestId, {
        forceFocus: true,
      }).then(sendResponse)
      return true
    }

    return undefined
  }

  return {
    present: presentTempContextForTurnstileAssist,
    drop: (requestId: string) => {
      clearAssistNotice(requestId)
    },
    setup: () => {
      onRuntimeMessage(handleTurnstileAssistMessage)
      bindTurnstileAssistNotificationClicks()
    },
  }
}
