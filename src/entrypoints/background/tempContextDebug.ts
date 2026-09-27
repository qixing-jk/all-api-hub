import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  INTERNAL_TAB_WINDOW_SCOPES,
  isInternalTabOwned,
  listInternalTabRecords,
  persistInternalTabMarker,
} from "~/services/browsingContext/internalTabsBackground"
import { createTab, createWindow, queryTabs } from "~/utils/browser/browserApi"
import { isDevelopmentMode, isTestMode } from "~/utils/core/environment"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import {
  readTempPageReclamationHistory,
  reclaimOrphanedTempPages,
} from "./tempContextReclamation"
import { tempWindowBackgroundRuntime } from "./tempWindowPool"

/**
 * Unified logger scoped to the temp-context debug fixtures.
 */
const logger = createLogger("TempContextDebug")

/**
 * Fixtures open `about:blank`, the page a temp context is created at before it
 * is navigated: that is exactly the shape of leftover users report, and no
 * other page can be mistaken for it.
 */
const DEBUG_FIXTURE_URL = "about:blank"

/**
 * A real temp context needs a page with a content script and without protection
 * guards, otherwise the readiness wait never completes.
 */
const DEBUG_TRACKED_CONTEXT_URL = "https://example.com"

/** Leftover shapes the panel can reproduce, matching the ownership records. */
export const TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS = {
  /** A popup window the extension created for one tab (`owned`). */
  OwnedWindow: "owned-window",
  /** A background tab in a window someone else owns (`shared`). */
  SharedTab: "shared-tab",
  /** An active tab in a focused window: the case reclamation must leave alone. */
  VisibleTab: "visible-tab",
} as const

export type TempContextDebugOrphanScenario =
  (typeof TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS)[keyof typeof TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS]

const ORPHAN_SCENARIO_VALUES = new Set<string>(
  Object.values(TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS),
)

/** Debug fixtures exist for development and E2E builds, never for a shipped one. */
function isDebugSurfaceAvailable(): boolean {
  return isDevelopmentMode() || isTestMode()
}

/** Whether this action belongs to the temp-context debug surface. */
export function isTempContextDebugAction(action: unknown): boolean {
  return (
    action === RuntimeActionIds.TempContextDebugCreateOrphan ||
    action === RuntimeActionIds.TempContextDebugCreateTrackedContext ||
    action === RuntimeActionIds.TempContextDebugListMarkers ||
    action === RuntimeActionIds.TempContextDebugReclaimNow
  )
}

/**
 * Creates a browser page that carries an ownership marker but no live owner,
 * i.e. the state a dead worker leaves behind.
 */
async function createOrphanFixture(
  scenario: TempContextDebugOrphanScenario,
): Promise<Record<string, unknown>> {
  if (scenario === TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS.OwnedWindow) {
    const created = await createWindow({
      url: DEBUG_FIXTURE_URL,
      type: "popup",
      focused: false,
    })
    const windowId = created?.id
    if (typeof windowId !== "number") {
      throw new Error("Fixture window could not be created")
    }

    const [tab] = await queryTabs({ windowId, active: true })
    if (typeof tab?.id !== "number") {
      throw new Error("Fixture window has no tab to own")
    }

    // Persisted only: the tab is marked as extension-owned but nothing holds
    // it, exactly like a leftover from a worker that died.
    await persistInternalTabMarker(tab.id, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Owned,
      createdAt: Date.now(),
    })

    return { tabId: tab.id, windowId, windowScope: "owned" }
  }

  const tab = await createTab(
    DEBUG_FIXTURE_URL,
    scenario === TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS.VisibleTab,
  )
  if (typeof tab?.id !== "number") {
    throw new Error("Fixture tab could not be created")
  }

  await persistInternalTabMarker(tab.id, {
    windowScope: INTERNAL_TAB_WINDOW_SCOPES.Shared,
    createdAt: Date.now(),
  })

  return { tabId: tab.id, windowId: tab.windowId, windowScope: "shared" }
}

/** Reads one optional fixture URL from an untrusted request. */
function readFixtureUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return DEBUG_TRACKED_CONTEXT_URL
  }

  const candidate = value.trim()
  try {
    new URL(candidate)
  } catch {
    throw new Error("Fixture URL must be absolute")
  }
  return candidate
}

/**
 * Opens a real temp context that is never released, so the live pool keeps
 * owning it. Reclamation must skip it until the worker that owns it is gone.
 */
async function createTrackedFixture(
  url: unknown,
): Promise<Record<string, unknown>> {
  const requestId = `temp-context-debug-${Date.now()}`
  const handle = await tempWindowBackgroundRuntime.acquire(
    readFixtureUrl(url),
    requestId,
  )

  return { requestId, tabId: handle.tabId }
}

/**
 * Handles the dev-only temp-context surface: reproduce a leftover, inspect
 * current ownership, and run reclamation on demand.
 *
 * Answers `{ success, data }` / `{ success, error }` like the other runtime
 * actions; the caller is a human-driven dev panel or an E2E spec.
 */
export async function handleTempContextDebugMessage(
  request: any,
  sendResponse: (response?: any) => void,
) {
  try {
    if (!isDebugSurfaceAvailable()) {
      sendResponse({ success: false, error: "Debug action unavailable" })
      return
    }

    switch (request?.action) {
      case RuntimeActionIds.TempContextDebugCreateOrphan: {
        const scenario: unknown = request?.scenario
        if (
          typeof scenario !== "string" ||
          !ORPHAN_SCENARIO_VALUES.has(scenario)
        ) {
          sendResponse({ success: false, error: "Unknown orphan scenario" })
          return
        }

        const fixture = await createOrphanFixture(
          scenario as TempContextDebugOrphanScenario,
        )
        logger.info("Created temp-context orphan fixture", { scenario })
        sendResponse({ success: true, data: fixture })
        return
      }

      case RuntimeActionIds.TempContextDebugCreateTrackedContext: {
        const fixture = await createTrackedFixture(request?.url)
        logger.info("Created tracked temp-context fixture", { fixture })
        sendResponse({ success: true, data: fixture })
        return
      }

      case RuntimeActionIds.TempContextDebugListMarkers: {
        const records = await listInternalTabRecords()
        sendResponse({
          success: true,
          data: {
            markers: records.map((record) => ({
              tabId: record.tabId,
              windowScope: record.windowScope,
              createdAt: record.createdAt,
              tracked: isInternalTabOwned(record.tabId),
            })),
            // Newest first: a worker start reclaims before anything can ask, so
            // a single "last run" would hide what that start actually did.
            runs: readTempPageReclamationHistory(),
          },
        })
        return
      }

      case RuntimeActionIds.TempContextDebugReclaimNow: {
        const summary = await reclaimOrphanedTempPages()
        sendResponse({ success: true, data: { summary } })
        return
      }

      default:
        sendResponse({ success: false, error: "Unknown debug action" })
    }
  } catch (error) {
    logger.error("Temp-context debug action failed", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
