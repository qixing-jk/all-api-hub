import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  handleTempContextDebugMessage,
  isTempContextDebugAction,
  TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS,
} from "~/entrypoints/background/tempContextDebug"
import type { TempPageReclamationRun } from "~/entrypoints/background/tempContextReclamation"
import {
  INTERNAL_TAB_WINDOW_SCOPES,
  listInternalTabRecords,
  registerInternalTab,
} from "~/services/browsingContext/internalTabsBackground"

const {
  acquireMock,
  createTabMock,
  createWindowMock,
  queryTabsMock,
  readTempPageReclaimRetryArmedMock,
  readTempPageReclamationHistoryMock,
  reclaimOrphanedTempPagesMock,
} = vi.hoisted(() => ({
  acquireMock: vi.fn(),
  createTabMock: vi.fn(),
  createWindowMock: vi.fn(),
  queryTabsMock: vi.fn(),
  readTempPageReclamationHistoryMock: vi.fn<() => TempPageReclamationRun[]>(
    () => [],
  ),
  reclaimOrphanedTempPagesMock: vi.fn(),
  readTempPageReclaimRetryArmedMock: vi.fn<() => Promise<boolean>>(
    async () => false,
  ),
}))

// Fixture windows and tabs are asserted through these seams: the fake browser
// does not model a window that is created together with its first tab.
vi.mock("~/utils/browser/browserApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
  createTab: createTabMock,
  createWindow: createWindowMock,
  queryTabs: queryTabsMock,
}))

const envFlags = vi.hoisted(() => ({ dev: true, test: true }))

vi.mock("~/utils/core/environment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/core/environment")>()),
  isDevelopmentMode: () => envFlags.dev,
  isTestMode: () => envFlags.test,
}))

vi.mock("~/services/browsingContext/tempPage/runtime", () => ({
  tempWindowBackgroundRuntime: { acquire: acquireMock },
}))

vi.mock("~/entrypoints/background/tempContextReclamation", () => ({
  readTempPageReclaimRetryArmed: readTempPageReclaimRetryArmedMock,
  readTempPageReclamationHistory: readTempPageReclamationHistoryMock,
  reclaimOrphanedTempPages: reclaimOrphanedTempPagesMock,
}))

const FIXTURE_WINDOW_ID = 900
const FIXTURE_WINDOW_TAB_ID = 901
const FIXTURE_TAB_ID = 902

/** Runs one debug action the way the background message router does. */
async function runDebugAction(request: Record<string, unknown>) {
  const sendResponse = vi.fn()
  await handleTempContextDebugMessage(request, sendResponse)
  return sendResponse.mock.calls[0]?.[0] as {
    success: boolean
    error?: string
    data?: Record<string, any>
  }
}

beforeEach(() => {
  envFlags.dev = true
  envFlags.test = true
  readTempPageReclamationHistoryMock.mockReset().mockReturnValue([])
  readTempPageReclaimRetryArmedMock.mockReset().mockResolvedValue(false)
  reclaimOrphanedTempPagesMock
    .mockReset()
    .mockResolvedValue({ outcomes: [], reclaimedCount: 0 })
  acquireMock.mockReset()
  createTabMock.mockReset().mockResolvedValue({
    id: FIXTURE_TAB_ID,
    windowId: 1,
    active: false,
  })
  createWindowMock.mockReset().mockResolvedValue({ id: FIXTURE_WINDOW_ID })
  queryTabsMock
    .mockReset()
    .mockResolvedValue([
      { id: FIXTURE_WINDOW_TAB_ID, windowId: FIXTURE_WINDOW_ID, active: true },
    ])
})

afterEach(() => vi.restoreAllMocks())

describe("temp-context debug actions", () => {
  it("recognizes only its own actions", () => {
    expect(
      isTempContextDebugAction(RuntimeActionIds.TempContextDebugCreateOrphan),
    ).toBe(true)
    expect(
      isTempContextDebugAction(RuntimeActionIds.TempContextDebugReclaimNow),
    ).toBe(true)
    expect(isTempContextDebugAction(RuntimeActionIds.GetInternalTabIds)).toBe(
      false,
    )
    expect(isTempContextDebugAction(undefined)).toBe(false)
  })

  it("refuses every action outside development and test builds", async () => {
    envFlags.dev = false
    envFlags.test = false

    for (const action of [
      RuntimeActionIds.TempContextDebugCreateOrphan,
      RuntimeActionIds.TempContextDebugCreateTrackedContext,
      RuntimeActionIds.TempContextDebugListMarkers,
      RuntimeActionIds.TempContextDebugReclaimNow,
    ]) {
      const response = await runDebugAction({ action })
      expect(response.success).toBe(false)
      expect(response.error).toBe("Debug action unavailable")
    }

    expect(createTabMock).not.toHaveBeenCalled()
    expect(reclaimOrphanedTempPagesMock).not.toHaveBeenCalled()
  })

  it("leaks an owned popup window and marks its tab as owning it", async () => {
    const response = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugCreateOrphan,
      scenario: TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS.OwnedWindow,
    })

    expect(response.success).toBe(true)
    expect(response.data).toEqual({
      tabId: FIXTURE_WINDOW_TAB_ID,
      windowId: FIXTURE_WINDOW_ID,
      windowScope: "owned",
    })
    expect(createWindowMock).toHaveBeenCalledWith({
      url: "about:blank",
      type: "popup",
      focused: false,
    })
    expect(queryTabsMock).toHaveBeenCalledWith({
      windowId: FIXTURE_WINDOW_ID,
      active: true,
    })
    expect(await listInternalTabRecords()).toEqual([
      {
        tabId: FIXTURE_WINDOW_TAB_ID,
        windowScope: "owned",
        createdAt: expect.any(Number),
        browserSession: expect.any(String),
      },
    ])
  })

  it("leaks a shared background tab", async () => {
    const response = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugCreateOrphan,
      scenario: TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS.SharedTab,
    })

    expect(response.success).toBe(true)
    expect(createTabMock).toHaveBeenCalledWith("about:blank", false)
    expect(await listInternalTabRecords()).toEqual([
      {
        tabId: FIXTURE_TAB_ID,
        windowScope: "shared",
        createdAt: expect.any(Number),
        browserSession: expect.any(String),
      },
    ])
  })

  it("leaks a tab the user is looking at when asked for a visible one", async () => {
    const response = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugCreateOrphan,
      scenario: TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS.VisibleTab,
    })

    expect(response.success).toBe(true)
    expect(createTabMock).toHaveBeenCalledWith("about:blank", true)
  })

  it("rejects an unknown scenario without touching the browser", async () => {
    const response = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugCreateOrphan,
      scenario: "not-a-scenario",
    })

    expect(response).toEqual({
      success: false,
      error: "Unknown orphan scenario",
    })
    expect(createTabMock).not.toHaveBeenCalled()
  })

  it("reports a fixture that could not be created as an error", async () => {
    createWindowMock.mockResolvedValue({})

    const response = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugCreateOrphan,
      scenario: TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS.OwnedWindow,
    })

    expect(response.success).toBe(false)
    expect(response.error).toBe("Fixture window could not be created")
  })

  it("reports when an owned fixture window has no tab to mark", async () => {
    queryTabsMock.mockResolvedValueOnce([])

    const response = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugCreateOrphan,
      scenario: TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS.OwnedWindow,
    })

    expect(response).toEqual({
      success: false,
      error: "Fixture window has no tab to own",
    })
  })

  it("reports when a shared fixture tab has no id to mark", async () => {
    createTabMock.mockResolvedValueOnce({ windowId: 1 })

    const response = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugCreateOrphan,
      scenario: TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS.SharedTab,
    })

    expect(response).toEqual({
      success: false,
      error: "Fixture tab could not be created",
    })
  })

  it("opens a tracked context that reclamation must skip", async () => {
    acquireMock.mockResolvedValue({ tabId: 42 })

    const response = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugCreateTrackedContext,
    })

    expect(response.success).toBe(true)
    expect(response.data?.tabId).toBe(42)
    expect(typeof response.data?.requestId).toBe("string")
    expect(acquireMock).toHaveBeenCalledWith(
      "https://example.com",
      expect.stringContaining("temp-context-debug-"),
    )
  })

  it("rejects a tracked-context fixture URL that is not absolute", async () => {
    const response = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugCreateTrackedContext,
      url: "example.com",
    })

    expect(response.success).toBe(false)
    expect(response.error).toBe("Fixture URL must be absolute")
    expect(acquireMock).not.toHaveBeenCalled()
  })

  it("accepts an absolute URL for a tracked fixture", async () => {
    acquireMock.mockResolvedValueOnce({ tabId: 43 })

    const response = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugCreateTrackedContext,
      url: "https://example.org/fixture",
    })

    expect(response.success).toBe(true)
    expect(acquireMock).toHaveBeenCalledWith(
      "https://example.org/fixture",
      expect.any(String),
    )
  })

  it("lists markers with their live ownership and the last run", async () => {
    const fixture = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugCreateOrphan,
      scenario: TEMP_CONTEXT_DEBUG_ORPHAN_SCENARIOS.SharedTab,
    })
    const tabId = fixture.data?.tabId as number
    // Persisting a marker is what a dead worker leaves; claiming live
    // ownership for it is what tells reclamation to skip it.
    await registerInternalTab(tabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Shared,
      createdAt: Date.now(),
    })
    readTempPageReclamationHistoryMock.mockReturnValue([
      {
        at: 1_700_000_000_000,
        summary: {
          outcomes: [{ kind: "closed-tab", tabId: 7 }],
          reclaimedCount: 1,
        },
      },
    ])

    const response = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugListMarkers,
    })

    expect(response.success).toBe(true)
    expect(response.data?.markers).toEqual([
      {
        tabId,
        windowScope: "shared",
        createdAt: expect.any(Number),
        browserSession: expect.any(String),
        tracked: true,
      },
    ])
    expect(response.data?.runs).toEqual([
      {
        at: 1_700_000_000_000,
        summary: {
          outcomes: [{ kind: "closed-tab", tabId: 7 }],
          reclaimedCount: 1,
        },
      },
    ])
  })

  it("lists no markers and no run before anything happened", async () => {
    const response = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugListMarkers,
    })

    expect(response).toEqual({
      success: true,
      data: {
        browserSession: expect.any(String),
        retryArmed: false,
        markers: [],
        runs: [],
      },
    })
  })

  it("runs reclamation on demand and returns its summary", async () => {
    const summary = {
      outcomes: [{ kind: "closed-window", tabId: 9 }],
      reclaimedCount: 1,
    }
    reclaimOrphanedTempPagesMock.mockResolvedValue(summary)

    const response = await runDebugAction({
      action: RuntimeActionIds.TempContextDebugReclaimNow,
    })

    expect(response).toEqual({ success: true, data: { summary } })
    expect(reclaimOrphanedTempPagesMock).toHaveBeenCalledTimes(1)
  })

  it("answers unknown actions without failing the message channel", async () => {
    const response = await runDebugAction({ action: "tempContextDebug:nope" })

    expect(response).toEqual({ success: false, error: "Unknown debug action" })
  })
})
