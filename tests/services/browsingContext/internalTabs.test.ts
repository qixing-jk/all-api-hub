import { afterEach, describe, expect, it, vi } from "vitest"

const OWNED_WINDOW = { windowScope: "owned", createdAt: 1 } as const
const SHARED_WINDOW = { windowScope: "shared", createdAt: 1 } as const

describe("internal browsing tab ownership", () => {
  afterEach(() => vi.restoreAllMocks())

  it("reports failed persistence even when subsequent reads succeed after restart", async () => {
    const owner = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    vi.spyOn(browser.storage.session, "set").mockRejectedValueOnce(
      new Error("write failed"),
    )
    expect(await owner.registerInternalTab(814, SHARED_WINDOW)).toBe(false)
    expect(await owner.getInternalTabIds([814])).toEqual([814])
    vi.resetModules()
    const restarted = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    expect(await restarted.getInternalTabIds([814])).toEqual([])
  })

  it("reads only candidate markers and never reads unrelated session data", async () => {
    const owner = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    await owner.registerInternalTab(811, SHARED_WINDOW)
    await owner.registerInternalTab(812, SHARED_WINDOW)
    vi.resetModules()
    const restarted = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    const read = vi.spyOn(browser.storage.session, "get")
    expect(await restarted.getInternalTabIds([811, 813])).toEqual([811])
    expect(read).toHaveBeenCalledWith([
      "internalBrowsingTab:811",
      "internalBrowsingTab:813",
    ])
    await restarted.unregisterInternalTab(811)
    await restarted.unregisterInternalTab(812)
  })

  it("survives a background restart and clears ownership on removal", async () => {
    const owner = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    await owner.registerInternalTab(801, SHARED_WINDOW)
    vi.resetModules()
    const restarted = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    expect(await restarted.getInternalTabIds([801])).toContain(801)
    await restarted.unregisterInternalTab(801)
    expect(await restarted.getInternalTabIds([801])).not.toContain(801)
  })

  it("keeps live ownership when session storage fails", async () => {
    const owner = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    vi.spyOn(browser.storage.session, "set").mockRejectedValue(
      new Error("unavailable"),
    )
    vi.spyOn(browser.storage.session, "get").mockRejectedValue(
      new Error("unavailable"),
    )
    await owner.registerInternalTab(802, SHARED_WINDOW)
    expect(await owner.getInternalTabIds([802])).toContain(802)
    await owner.unregisterInternalTab(802)
    await expect(owner.getInternalTabIds([802])).rejects.toThrow("unavailable")
  })

  it("allows cleanup to retry when removing the persisted marker fails", async () => {
    const owner = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    expect(await owner.registerInternalTab(815, SHARED_WINDOW)).toBe(true)
    vi.spyOn(browser.storage.session, "remove").mockRejectedValueOnce(
      new Error("remove failed"),
    )
    await expect(owner.unregisterInternalTab(815)).resolves.toBeUndefined()
    vi.resetModules()
    const restarted = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    expect(await restarted.getInternalTabIds([815])).toEqual([815])
    await restarted.unregisterInternalTab(815)
    expect(await restarted.getInternalTabIds([815])).toEqual([])
  })

  it("keeps the ownership record readable for the worker that has to reclaim it", async () => {
    const owner = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    await owner.registerInternalTab(821, OWNED_WINDOW)
    await owner.registerInternalTab(822, SHARED_WINDOW)
    vi.resetModules()
    const restarted = await import(
      "~/services/browsingContext/internalTabsBackground"
    )

    expect(await restarted.listInternalTabRecords()).toEqual([
      { tabId: 821, windowScope: "owned", createdAt: 1 },
      { tabId: 822, windowScope: "shared", createdAt: 1 },
    ])

    await restarted.unregisterInternalTab(821)
    await restarted.unregisterInternalTab(822)
  })

  it("treats a legacy boolean marker as shared-window ownership without rewriting it", async () => {
    await browser.storage.session.set({ "internalBrowsingTab:831": true })
    const owner = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    const write = vi.spyOn(browser.storage.session, "set")

    expect(await owner.getInternalTabIds([831])).toEqual([831])
    expect(await owner.listInternalTabRecords()).toEqual([
      { tabId: 831, windowScope: "shared", createdAt: null },
    ])
    expect(write).not.toHaveBeenCalled()

    await owner.unregisterInternalTab(831)
  })

  it("enumerates only internal tab markers and ignores unrelated session data", async () => {
    await browser.storage.session.set({
      "accountDraft:unrelated": { secret: "should-not-surface" },
      "internalBrowsingTab:841": SHARED_WINDOW,
      internalBrowsingTab: "not-a-tab-key",
    })
    const owner = await import(
      "~/services/browsingContext/internalTabsBackground"
    )

    expect(await owner.listInternalTabRecords()).toEqual([
      { tabId: 841, windowScope: "shared", createdAt: 1 },
    ])
  })

  it("claims live ownership before the marker is written", async () => {
    const owner = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    vi.spyOn(browser.storage.session, "set").mockRejectedValue(
      new Error("write failed"),
    )

    // A sweep keys on markers, so a tab whose marker write failed must already
    // be claimed: otherwise the sweep closes a context that is being created.
    expect(await owner.registerInternalTab(851, SHARED_WINDOW)).toBe(false)
    expect(owner.isInternalTabOwned(851)).toBe(true)

    await owner.unregisterInternalTab(851)
    expect(owner.isInternalTabOwned(851)).toBe(false)
  })

  it("persists a marker without claiming live ownership", async () => {
    const owner = await import(
      "~/services/browsingContext/internalTabsBackground"
    )

    // This is the state a dead worker leaves: the marker outlives its owner.
    expect(await owner.persistInternalTabMarker(861, OWNED_WINDOW)).toBe(true)
    expect(owner.isInternalTabOwned(861)).toBe(false)
    expect(await owner.listInternalTabRecords()).toEqual([
      { tabId: 861, windowScope: "owned", createdAt: 1 },
    ])

    await owner.unregisterInternalTab(861)
  })
})
