import { afterEach, describe, expect, it, vi } from "vitest"

describe("internal browsing tab ownership", () => {
  afterEach(() => vi.restoreAllMocks())

  it("reads only candidate markers and never reads unrelated session data", async () => {
    const owner = await import(
      "~/services/browsingContext/internalTabsBackground"
    )
    await owner.registerInternalTab(811)
    await owner.registerInternalTab(812)
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
    await owner.registerInternalTab(801)
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
    await owner.registerInternalTab(802)
    expect(await owner.getInternalTabIds([802])).toContain(802)
    await owner.unregisterInternalTab(802)
    await expect(owner.getInternalTabIds([802])).rejects.toThrow("unavailable")
  })
})
