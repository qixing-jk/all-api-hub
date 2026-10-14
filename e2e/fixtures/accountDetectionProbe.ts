import type { AccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"
import { createUserCommandProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { autoDetectFromCurrentTab } from "~/services/siteDetection/sources/currentTab"
import { autoDetectDirect } from "~/services/siteDetection/sources/direct"

export type AccountDetectionProbeInput = {
  source: "current_tab" | "direct"
  url: string
  tabId: number
}

/** Packaged test-build probe: real interfaces, no eval or production test switch. */
export async function accountDetectionProbe(input: AccountDetectionProbeInput) {
  const events: Record<string, unknown>[] = []
  const observation = observeNativeContexts(input.url)
  const contexts = observation.contexts
  const diagnostics: AccountDetectionDiagnostics = {
    requestId: crypto.randomUUID(),
    record(event, details = {}) {
      const safeKeys = [
        "source",
        "strategy",
        "success",
        "reason",
        "from",
        "to",
        "mode",
        "requestedMode",
      ]
      events.push({
        event,
        ...Object.fromEntries(
          Object.entries(details).filter(([key]) => safeKeys.includes(key)),
        ),
      })
    },
    finish(outcome) {
      events.push({ event: "detection_finished", outcome })
    },
  }
  const execution = createUserCommandProtectionBypassExecution(
    PROTECTION_BYPASS_USER_COMMANDS.DetectAccount,
    PROTECTION_BYPASS_SURFACES.Options,
  )
  try {
    const result =
      input.source === "current_tab"
        ? await autoDetectFromCurrentTab(
            input.url,
            input.tabId,
            false,
            undefined,
            execution,
            diagnostics,
          )
        : await autoDetectDirect(input.url, undefined, diagnostics)
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

/** Read-only native observation; UI actions own all successful detection calls. */
function observeNativeContexts(url: string) {
  const contexts: { windowType: string | undefined }[] = []
  const pending: Promise<void>[] = []
  const observedTabs = new Set<number>()
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
      chrome.windows.get(tab.windowId).then((win) => {
        contexts.push({ windowType: win.type })
      }),
    )
  }
  const onUpdated = (
    _tabId: number,
    _change: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab,
  ) => observeTab(tab)
  chrome.tabs.onCreated.addListener(observeTab)
  chrome.tabs.onUpdated.addListener(onUpdated)
  return {
    contexts,
    async finish() {
      chrome.tabs.onCreated.removeListener(observeTab)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      await Promise.all(pending)
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
window.startAccountDetectionUiObservation = (url) => {
  const observation = observeNativeContexts(url)
  window.finishAccountDetectionUiObservation = observation.finish
}
