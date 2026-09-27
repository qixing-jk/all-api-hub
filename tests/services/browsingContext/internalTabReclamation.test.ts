import { afterEach, describe, expect, it, vi } from "vitest"

import {
  reclaimOrphanedInternalTabs,
  TEMP_PAGE_RECLAIM_RETRY_ALARM,
} from "~/services/browsingContext/internalTabReclamation"
import {
  INTERNAL_TAB_WINDOW_SCOPES,
  listInternalTabRecords,
  registerInternalTab,
  rotateInternalTabBrowserSession,
  unregisterInternalTab,
} from "~/services/browsingContext/internalTabsBackground"

/** Creates a window that is not focused, like a temp window waiting to be reclaimed. */
async function createWindow(focused = false) {
  const created = await browser.windows.create({ focused })
  if (typeof created?.id !== "number") throw new Error("window was not created")
  return created.id
}

async function createTab(windowId: number, active = false) {
  const tab = await browser.tabs.create({
    url: "about:blank",
    active,
    windowId,
  })
  if (typeof tab?.id !== "number") throw new Error("tab was not created")
  return tab.id
}

async function listTabIds() {
  return (await browser.tabs.query({})).map((tab) => tab.id)
}

async function listWindowIds() {
  return (await browser.windows.getAll()).map((item) => item.id)
}

afterEach(() => vi.restoreAllMocks())

describe("orphaned internal tab reclamation", () => {
  it("closes the window a dead worker left behind, even when its tab was active", async () => {
    const windowId = await createWindow()
    const tabId = await createTab(windowId, true)
    await registerInternalTab(tabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Owned,
      createdAt: Date.now(),
    })

    const summary = await reclaimOrphanedInternalTabs({
      isTabTracked: () => false,
    })

    expect(summary.outcomes).toEqual([{ kind: "closed-window", tabId }])
    expect(summary.reclaimedCount).toBe(1)
    expect(await listWindowIds()).not.toContain(windowId)
    expect(await listInternalTabRecords()).toEqual([])
  })

  it("closes only the tab when the window belongs to someone else", async () => {
    const windowId = await createWindow(true)
    const userTabId = await createTab(windowId)
    const tempTabId = await createTab(windowId)
    await registerInternalTab(tempTabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Shared,
      createdAt: Date.now(),
    })

    const summary = await reclaimOrphanedInternalTabs({
      isTabTracked: () => false,
    })

    expect(summary.outcomes).toEqual([{ kind: "closed-tab", tabId: tempTabId }])
    expect(await listTabIds()).not.toContain(tempTabId)
    expect(await listTabIds()).toContain(userTabId)
    expect(await listWindowIds()).toContain(windowId)
    expect(await listInternalTabRecords()).toEqual([])
  })

  it("leaves a tab the live worker still tracks", async () => {
    const windowId = await createWindow()
    const tabId = await createTab(windowId)
    await registerInternalTab(tabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Owned,
      createdAt: Date.now(),
    })

    const summary = await reclaimOrphanedInternalTabs({
      isTabTracked: (id) => id === tabId,
    })

    expect(summary.outcomes).toEqual([{ kind: "skipped-tracked", tabId }])
    expect(summary.reclaimedCount).toBe(0)
    expect(await listWindowIds()).toContain(windowId)
    expect(await listInternalTabRecords()).toEqual([
      {
        tabId,
        windowScope: "owned",
        createdAt: expect.any(Number),
        browserSession: expect.any(String),
      },
    ])
  })

  it("leaves the tab of a focused window alone", async () => {
    const windowId = await createWindow(true)
    const tabId = await createTab(windowId, true)
    await registerInternalTab(tabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Owned,
      createdAt: Date.now(),
    })

    const summary = await reclaimOrphanedInternalTabs({
      isTabTracked: () => false,
    })

    expect(summary.outcomes).toEqual([{ kind: "skipped-visible", tabId }])
    expect(await listWindowIds()).toContain(windowId)
    expect(await listInternalTabRecords()).toHaveLength(1)
  })

  it("reports a marker from another browser session as stale and closes nothing", async () => {
    const windowId = await createWindow()
    const tabId = await createTab(windowId)
    await registerInternalTab(tabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Owned,
      createdAt: Date.now(),
    })
    // The browser session that owned this tab is over, so its tab id means
    // nothing now: the marker is cleared, the page is left alone.
    await rotateInternalTabBrowserSession()

    const summary = await reclaimOrphanedInternalTabs({
      isTabTracked: () => false,
    })

    expect(summary.outcomes).toEqual([{ kind: "skipped-stale-session", tabId }])
    expect(summary.reclaimedCount).toBe(0)
    expect(await listInternalTabRecords()).toEqual([])
    expect(await listTabIds()).toContain(tabId)
    expect(await listWindowIds()).toContain(windowId)
  })

  it("stops acting when the browser session ends mid-sweep", async () => {
    const windowId = await createWindow()
    const firstTabId = await createTab(windowId)
    const secondTabId = await createTab(windowId)
    for (const tabId of [firstTabId, secondTabId]) {
      await registerInternalTab(tabId, {
        windowScope: INTERNAL_TAB_WINDOW_SCOPES.Shared,
        createdAt: Date.now(),
      })
    }

    const removeTab = browser.tabs.remove.bind(browser.tabs)
    vi.spyOn(browser.tabs, "remove").mockImplementation(
      async (tabIds: number | number[]) => {
        // The browser starts a new session while the sweep is still closing.
        await rotateInternalTabBrowserSession()
        await removeTab(tabIds)
      },
    )

    const summary = await reclaimOrphanedInternalTabs({
      isTabTracked: () => false,
    })

    expect(summary.outcomes).toEqual([
      { kind: "closed-tab", tabId: firstTabId },
      { kind: "skipped-stale-session", tabId: secondTabId },
    ])
    expect(await listTabIds()).toContain(secondTabId)
  })

  it("forgets ownership of tabs that no longer exist", async () => {
    const windowId = await createWindow()
    const tabId = await createTab(windowId)
    await registerInternalTab(tabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Shared,
      createdAt: Date.now(),
    })
    await browser.tabs.remove(tabId)

    const summary = await reclaimOrphanedInternalTabs({
      isTabTracked: () => false,
    })

    expect(summary.outcomes).toEqual([{ kind: "skipped-missing", tabId }])
    expect(await listInternalTabRecords()).toEqual([])
  })

  it("removes the tab when the owned window cannot be closed", async () => {
    const windowId = await createWindow()
    const tabId = await createTab(windowId)
    await registerInternalTab(tabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Owned,
      createdAt: Date.now(),
    })
    vi.spyOn(browser.windows, "remove").mockRejectedValueOnce(
      new Error("window removal unavailable"),
    )

    const summary = await reclaimOrphanedInternalTabs({
      isTabTracked: () => false,
    })

    expect(summary.outcomes).toEqual([{ kind: "closed-tab", tabId }])
    expect(await listTabIds()).not.toContain(tabId)
    expect(await listInternalTabRecords()).toEqual([])
  })

  it("keeps ownership when the close fails so a later sweep can retry", async () => {
    const windowId = await createWindow()
    const tabId = await createTab(windowId)
    await registerInternalTab(tabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Shared,
      createdAt: Date.now(),
    })
    vi.spyOn(browser.tabs, "remove").mockRejectedValueOnce(
      new Error("tab removal failed"),
    )

    const summary = await reclaimOrphanedInternalTabs({
      isTabTracked: () => false,
    })

    expect(summary.outcomes).toEqual([
      { kind: "failed", tabId, reason: "tab removal failed" },
    ])
    expect(summary.reclaimedCount).toBe(0)
    expect(await listTabIds()).toContain(tabId)
    expect(await listInternalTabRecords()).toHaveLength(1)
  })

  it("arms a one-shot retry when a close fails", async () => {
    const windowId = await createWindow()
    const tabId = await createTab(windowId)
    await registerInternalTab(tabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Shared,
      createdAt: Date.now(),
    })
    vi.spyOn(browser.tabs, "remove").mockRejectedValue(
      new Error("tab removal failed"),
    )

    await reclaimOrphanedInternalTabs({ isTabTracked: () => false })

    expect(
      (await browser.alarms.get(TEMP_PAGE_RECLAIM_RETRY_ALARM))?.name,
    ).toBe(TEMP_PAGE_RECLAIM_RETRY_ALARM)
  })

  it("keeps an already armed retry instead of pushing it back", async () => {
    const windowId = await createWindow()
    const tabId = await createTab(windowId)
    await registerInternalTab(tabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Shared,
      createdAt: Date.now(),
    })
    vi.spyOn(browser.tabs, "remove").mockRejectedValue(
      new Error("tab removal failed"),
    )
    const createAlarm = vi.spyOn(browser.alarms, "create")

    await reclaimOrphanedInternalTabs({ isTabTracked: () => false })
    await reclaimOrphanedInternalTabs({ isTabTracked: () => false })

    expect(createAlarm).toHaveBeenCalledTimes(1)
  })

  it("keeps the retry armed while a live request holds a temp page", async () => {
    const windowId = await createWindow()
    const tabId = await createTab(windowId)
    await registerInternalTab(tabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Owned,
      createdAt: Date.now(),
    })

    const summary = await reclaimOrphanedInternalTabs({
      isTabTracked: (id) => id === tabId,
    })

    // Its delayed close has not run yet, so a worker that dies now would leave
    // this page behind with nothing else to retry it.
    expect(summary.outcomes).toEqual([{ kind: "skipped-tracked", tabId }])
    expect(
      (await browser.alarms.get(TEMP_PAGE_RECLAIM_RETRY_ALARM))?.name,
    ).toBe(TEMP_PAGE_RECLAIM_RETRY_ALARM)

    await unregisterInternalTab(tabId)
  })

  it("stops the heartbeat once the held temp page is old", async () => {
    const windowId = await createWindow()
    const tabId = await createTab(windowId)
    await registerInternalTab(tabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Owned,
      createdAt: Date.now() - 11 * 60 * 1000,
    })

    await reclaimOrphanedInternalTabs({ isTabTracked: (id) => id === tabId })

    // Nothing has closed this page for eleven minutes, so it is not a flow that
    // will finish on its own: stop paying a wake every minute for it.
    expect(await browser.alarms.get(TEMP_PAGE_RECLAIM_RETRY_ALARM)).toBeFalsy()

    await unregisterInternalTab(tabId)
  })

  it("does not arm a retry when nothing failed", async () => {
    const windowId = await createWindow()
    const tabId = await createTab(windowId)
    await registerInternalTab(tabId, {
      windowScope: INTERNAL_TAB_WINDOW_SCOPES.Shared,
      createdAt: Date.now(),
    })

    const summary = await reclaimOrphanedInternalTabs({
      isTabTracked: () => false,
    })

    expect(summary.outcomes).toEqual([{ kind: "closed-tab", tabId }])
    expect(await browser.alarms.get(TEMP_PAGE_RECLAIM_RETRY_ALARM)).toBeFalsy()
  })

  it("does not inspect the browser when no tab is marked", async () => {
    const queryTabs = vi.spyOn(browser.tabs, "query")
    const listWindows = vi.spyOn(browser.windows, "getAll")

    const summary = await reclaimOrphanedInternalTabs({
      isTabTracked: () => false,
    })

    expect(summary).toEqual({ outcomes: [], reclaimedCount: 0 })
    expect(queryTabs).not.toHaveBeenCalled()
    expect(listWindows).not.toHaveBeenCalled()
  })
})
