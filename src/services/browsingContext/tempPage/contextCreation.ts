import { TEMP_CONTEXT_MODES } from "~/constants/tempContextMode"
import { scheduleTempPageReclaimRetry } from "~/services/browsingContext/internalTabReclamation"
import {
  INTERNAL_TAB_WINDOW_SCOPES,
  registerInternalTab,
} from "~/services/browsingContext/internalTabsBackground"
import {
  getTempContextHandle,
  removeTempWindowHandle,
} from "~/services/browsingContext/tempPage/contextRemoval"
import { applyTempWindowDownloadBlockRule } from "~/utils/browser/dnrCookieInjector"
import { applyFirefoxTempWindowDownloadBlockRule } from "~/utils/browser/firefoxTempWindowDownloadBlocker"
import { updateTab } from "~/utils/browser/tabs"
import { getErrorMessage } from "~/utils/core/error"
import { sanitizeUrlForLog } from "~/utils/core/sanitizeUrlForLog"

import {
  getTempContextTabSnapshot,
  removeInstalledDownloadBlockRules,
  showShieldBypassUiInTab,
  waitForTabComplete,
} from "./browserAdapter"
import {
  TEMP_CONTEXT_TYPES,
  type TempContext,
  type TempContextOpenMode,
  type TempContextOpenResult,
} from "./contracts"
import { logger, logTempWindow } from "./diagnostics"
import { openFallbackAwareTempContext } from "./openingAdapter"

/**
 * Creates a ready-to-use temp context, including load/guard readiness checks.
 */
export async function createTempContextInstance(
  url: string,
  origin: string,
  requestId: string,
  requestedMode: TempContextOpenMode,
  suppressMinimize = false,
  options: { incognito?: boolean; signal?: AbortSignal } = {},
): Promise<TempContext> {
  let opened: TempContextOpenResult | undefined
  let downloadBlockRuleId: number | null = null
  let firefoxDownloadBlockTabId: number | null = null
  const useIncognito = Boolean(options.incognito)
  // Incognito/private temp contexts must stay window-backed so storage/session
  // isolation does not silently collapse back into the regular profile.
  const allowWindowRollback =
    !useIncognito && requestedMode !== TEMP_CONTEXT_MODES.Tab

  try {
    opened = await openFallbackAwareTempContext({
      url,
      origin,
      requestId,
      requestedMode,
      allowWindowRollback,
      suppressMinimize,
      incognito: useIncognito,
    })
    ;[downloadBlockRuleId, firefoxDownloadBlockTabId] = await Promise.all([
      applyTempWindowDownloadBlockRule(opened.tabId),
      applyFirefoxTempWindowDownloadBlockRule(opened.tabId),
    ])
    if (downloadBlockRuleId == null && firefoxDownloadBlockTabId == null) {
      logger.warn(
        "No temp-window download block rule could be installed before navigation",
        { requestId, origin, tabId: opened.tabId },
      )
    }
    if (
      !(await registerInternalTab(opened.tabId, {
        // A window-backed temp context owns its window; composite and plain tab
        // contexts only borrow one, so reclamation must never close that window.
        windowScope:
          opened.mode === TEMP_CONTEXT_MODES.Window
            ? INTERNAL_TAB_WINDOW_SCOPES.Owned
            : INTERNAL_TAB_WINDOW_SCOPES.Shared,
        createdAt: Date.now(),
      }))
    ) {
      throw new Error("Unable to persist internal tab ownership")
    }
    // The worker may stop while navigation or readiness is pending, before a
    // request receives this context and arms its delayed-close retry.
    await scheduleTempPageReclaimRetry()
    await updateTab(opened.tabId, { url })

    logTempWindow("createTempContextInstance", {
      requestId,
      origin,
      contextId: opened.id,
      tabId: opened.tabId,
      type: opened.type,
      mode: opened.mode,
      ownerWindowId: opened.ownerWindowId ?? null,
      downloadBlockRuleInstalled: downloadBlockRuleId != null,
      firefoxDownloadBlockRuleInstalled: firefoxDownloadBlockTabId != null,
      requestedMode,
      url: sanitizeUrlForLog(url),
    })

    // Best-effort: annotate the temporary window/tab so users understand why it opened.
    void showShieldBypassUiInTab({ tabId: opened.tabId, origin, requestId })

    await waitForTabComplete(opened.tabId, {
      requestId,
      origin,
      signal: options.signal,
    })
    const readyTab = await getTempContextTabSnapshot(opened.tabId)

    logTempWindow("createTempContextInstanceReady", {
      requestId,
      origin,
      contextId: opened.id,
      tabId: opened.tabId,
      type: opened.type,
      mode: opened.mode,
      ownerWindowId: opened.ownerWindowId ?? null,
      requestedMode,
    })

    return {
      ...opened,
      origin,
      currentUrl: readyTab?.url ?? url,
      activeRequestIds: new Set<string>(),
      lastUsed: Date.now(),
      ...(downloadBlockRuleId != null ? { downloadBlockRuleId } : {}),
      ...(firefoxDownloadBlockTabId != null
        ? { firefoxDownloadBlockTabId }
        : {}),
    }
  } catch (error) {
    logTempWindow("createTempContextInstanceError", {
      requestId,
      origin,
      contextId: opened?.id ?? null,
      tabId: opened?.tabId ?? null,
      type: opened?.type ?? TEMP_CONTEXT_TYPES.Window,
      mode: opened?.mode ?? TEMP_CONTEXT_MODES.Window,
      ownerWindowId: opened?.ownerWindowId ?? null,
      error: getErrorMessage(error),
      requestedMode,
    })
    if (opened) {
      try {
        await removeTempWindowHandle(getTempContextHandle(opened))
      } catch (cleanupError) {
        logger.warn(
          "Failed to cleanup temp context after creation error",
          cleanupError,
        )
        void scheduleTempPageReclaimRetry()
      }
    }
    await removeInstalledDownloadBlockRules(
      downloadBlockRuleId,
      firefoxDownloadBlockTabId,
    )
    throw error
  }
}
