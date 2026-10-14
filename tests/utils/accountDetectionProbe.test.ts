import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("~/services/protectionBypass/client", () => ({
  createUserCommandProtectionBypassExecution: vi.fn(),
}))
vi.mock("~/services/siteDetection/sources/currentTab", () => ({
  autoDetectFromCurrentTab: vi.fn(),
}))
vi.mock("~/services/siteDetection/sources/direct", () => ({
  autoDetectDirect: vi.fn(),
}))

/**
 * Start the packaged observer with controllable native browser lookups.
 * @returns Browser lookup controls and a target-tab event emitter.
 */
async function startObservation() {
  const onCreated = { addListener: vi.fn(), removeListener: vi.fn() }
  const onUpdated = { addListener: vi.fn(), removeListener: vi.fn() }
  const get = vi.fn()
  const getAll = vi.fn().mockResolvedValue([])
  vi.stubGlobal("chrome", {
    tabs: { onCreated, onUpdated },
    windows: { get, getAll },
  })
  vi.stubGlobal("window", {})
  await import("~~/e2e/fixtures/accountDetectionProbe")
  window.startAccountDetectionUiObservation("https://site.example")
  const emitTab = (windowId = 7) => {
    const listener = onCreated.addListener.mock.calls[0]?.[0]
    if (!listener) throw new Error("Native tab observation did not start")
    listener({
      id: 1,
      windowId,
      url: "https://site.example/dashboard",
    })
  }
  return { get, getAll, emitTab }
}

describe("account detection native-context observation", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it("finishes successfully when a temporary window closes before its lookup completes", async () => {
    const { get, emitTab } = await startObservation()
    get.mockRejectedValue(new Error("Window already closed"))
    emitTab()
    await expect(window.finishAccountDetectionUiObservation()).resolves.toEqual(
      [],
    )
  })

  it("waits for successful lookups and returns the actual native surface", async () => {
    const { get, emitTab } = await startObservation()
    let resolveWindow!: (window: { id: number; type: string }) => void
    get.mockReturnValue(
      new Promise((resolve) => {
        resolveWindow = resolve
      }),
    )
    emitTab()
    const completion = window.finishAccountDetectionUiObservation()
    resolveWindow({ id: 7, type: "popup" })
    await expect(completion).resolves.toEqual([{ windowType: "popup" }])
  })

  it("retains a lookup error when the window still exists", async () => {
    const { get, getAll, emitTab } = await startObservation()
    const failure = new Error("Window lookup failed")
    get.mockRejectedValue(failure)
    getAll.mockResolvedValue([{ id: 7 }])
    emitTab()
    // A delayed finish must not leave the browser rejection unhandled.
    await new Promise((resolve) => setImmediate(resolve))
    await expect(window.finishAccountDetectionUiObservation()).rejects.toBe(
      failure,
    )
  })

  it("reports a failure to verify whether the window closed", async () => {
    const { get, getAll, emitTab } = await startObservation()
    const failure = new Error("Window inventory unavailable")
    get.mockRejectedValue(new Error("Window lookup failed"))
    getAll.mockRejectedValue(failure)
    emitTab()
    await expect(window.finishAccountDetectionUiObservation()).rejects.toBe(
      failure,
    )
  })
})
