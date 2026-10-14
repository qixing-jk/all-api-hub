import { AUTO_DETECT_DIAGNOSTIC_EVENTS } from "~/constants/autoDetect"
import type { AccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"
import { createUserCommandProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { autoDetectFromCurrentTab } from "~/services/siteDetection/sources/currentTab"
import { autoDetectDirect } from "~/services/siteDetection/sources/direct"

import { ACCOUNT_DETECTION_PROBE_SOURCES } from "./accountDetectionProbeSources"

const SAFE_DIAGNOSTIC_DETAIL_KEYS = new Set([
  "source",
  "strategy",
  "success",
  "reason",
  "from",
  "to",
  "mode",
  "requestedMode",
])

export type AccountDetectionProbeInput = {
  source: (typeof ACCOUNT_DETECTION_PROBE_SOURCES)[keyof typeof ACCOUNT_DETECTION_PROBE_SOURCES]
  url: string
  tabId: number
}

/**
 * Run an API-only detection contract through the packaged test-build interface.
 * @param input Source, target URL and native tab for this isolated attempt.
 * @returns Detection identity, strategy and filtered native-context evidence.
 */
export async function accountDetectionProbe(input: AccountDetectionProbeInput) {
  const events: Record<string, unknown>[] = []
  const observation = observeNativeContexts(input.url)
  const contexts = observation.contexts
  const diagnostics: AccountDetectionDiagnostics = {
    requestId: crypto.randomUUID(),
    record(event, details = {}) {
      events.push({
        event,
        ...Object.fromEntries(
          Object.entries(details).filter(([key]) =>
            SAFE_DIAGNOSTIC_DETAIL_KEYS.has(key),
          ),
        ),
      })
    },
    finish(outcome) {
      events.push({
        event: AUTO_DETECT_DIAGNOSTIC_EVENTS.DetectionFinished,
        outcome,
      })
    },
  }
  const execution = createUserCommandProtectionBypassExecution(
    PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
    PROTECTION_BYPASS_SURFACES.Options,
  )
  try {
    const result =
      input.source === ACCOUNT_DETECTION_PROBE_SOURCES.CurrentTab
        ? await autoDetectFromCurrentTab({
            url: input.url,
            tabId: input.tabId,
            incognito: false,
            protectionBypassExecution: execution,
            diagnostics,
          })
        : await autoDetectDirect({ url: input.url, diagnostics })
    await observation.finish()
    return {
      success: result.success,
      userId: result.data?.userId,
      siteType: result.data?.siteType,
      strategy: result.autoDetectContext?.strategy,
      errorCode: result.errorCode,
      events,
      contexts,
    }
  } finally {
    await observation.finish()
  }
}

/**
 * Observe native contexts without starting detection or creating tabs/windows.
 * @param url Target origin whose tab events should be recorded.
 * @returns Context records and a finish operation that removes all listeners.
 */
function observeNativeContexts(url: string) {
  const contexts: { windowType: string | undefined }[] = []
  const pending: Promise<void>[] = []
  const lookupErrors: unknown[] = []
  const observedTabs = new Set<number>()
  /** Record a matching tab's native surface once, tolerating its window closing. */
  const observeTab = (tab: chrome.tabs.Tab) => {
    if (
      !tab.url ||
      new URL(tab.url).origin !== new URL(url).origin ||
      tab.id === undefined ||
      observedTabs.has(tab.id)
    )
      return
    observedTabs.add(tab.id)
    pending.push(
      chrome.windows
        .get(tab.windowId)
        .then((win) => {
          contexts.push({ windowType: win.type })
        })
        .catch(async (error: unknown) => {
          try {
            // Contain rejections immediately, but only ignore a closed window.
            const windows = await chrome.windows.getAll()
            if (windows.some((win) => win.id === tab.windowId))
              lookupErrors.push(error)
          } catch (verificationError) {
            lookupErrors.push(verificationError)
          }
        }),
    )
  }
  /** Include tabs whose target URL becomes available after their creation. */
  const onUpdated = (
    _tabId: number,
    _change: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab,
  ) => observeTab(tab)
  chrome.tabs.onCreated.addListener(observeTab)
  chrome.tabs.onUpdated.addListener(onUpdated)
  return {
    contexts,
    /** Stop observing and await lookups, retaining unexpected browser errors. */
    async finish() {
      chrome.tabs.onCreated.removeListener(observeTab)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      await Promise.all(pending)
      if (lookupErrors.length) throw lookupErrors[0]
      return contexts
    },
  }
}

declare global {
  interface Window {
    accountDetectionProbe: typeof accountDetectionProbe
    startAccountDetectionUiObservation: (url: string) => void
    finishAccountDetectionUiObservation: () => Promise<
      { windowType: string | undefined }[]
    >
  }
}

window.accountDetectionProbe = accountDetectionProbe
/**
 * Observe native contexts for one UI attempt without invoking detection.
 * Call finishAccountDetectionUiObservation before starting another attempt;
 * finishing removes the listeners and returns the observed window types.
 */
window.startAccountDetectionUiObservation = (url) => {
  const observation = observeNativeContexts(url)
  window.finishAccountDetectionUiObservation = observation.finish
}
