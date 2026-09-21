// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://github.com/qixing-jk/all-api-hub"}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setupStarPromotionContent } from "~/entrypoints/content/starPromotion/observeRepoStarButton"

const { sendRuntimeActionMessageMock } = vi.hoisted(() => ({
  sendRuntimeActionMessageMock: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  sendRuntimeActionMessage: sendRuntimeActionMessageMock,
}))

function renderStarButton(pressed: boolean) {
  document.body.innerHTML = `<button aria-label="Star this repository" aria-pressed="${pressed}">Star</button>`
}

describe("setupStarPromotionContent", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.history.replaceState({}, "", "/qixing-jk/all-api-hub")
    sendRuntimeActionMessageMock
      .mockReset()
      .mockResolvedValue({ success: true })
    renderStarButton(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ""
  })

  it("retries an unchanged state after a failed acknowledgement", async () => {
    sendRuntimeActionMessageMock
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true })
    const cleanup = setupStarPromotionContent()

    await vi.waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(1)
    })
    document.body.append(document.createElement("span"))

    await vi.waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(2)
    })
    cleanup()
  })

  it("keeps mutation detection active after hydration polling times out", async () => {
    renderStarButton(false)
    const cleanup = setupStarPromotionContent()
    expect(sendRuntimeActionMessageMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(30_000)
    document.querySelector("button")?.setAttribute("aria-pressed", "true")

    await vi.waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(1)
    })
    cleanup()
  })

  it("does not report unstarred changes or duplicate the starred state", async () => {
    const cleanup = setupStarPromotionContent()
    await vi.waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(1)
    })

    document.body.append(document.createElement("span"))
    await Promise.resolve()
    expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(1)

    document.querySelector("button")?.setAttribute("aria-pressed", "false")
    await Promise.resolve()
    expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it("waits for GitHub to hydrate a star control", async () => {
    document.body.innerHTML = ""
    const cleanup = setupStarPromotionContent()
    expect(sendRuntimeActionMessageMock).not.toHaveBeenCalled()

    renderStarButton(false)
    await Promise.resolve()
    expect(sendRuntimeActionMessageMock).not.toHaveBeenCalled()

    document.querySelector("button")?.setAttribute("aria-pressed", "true")
    await vi.waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(1)
    })
    cleanup()
  })

  it("stops observing after cleanup", async () => {
    const cleanup = setupStarPromotionContent()
    await vi.waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(1)
    })
    cleanup()

    document.querySelector("button")?.setAttribute("aria-pressed", "false")
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(1)
  })

  it("does not observe repository subpages", () => {
    window.history.replaceState({}, "", "/qixing-jk/all-api-hub/issues")

    const cleanup = setupStarPromotionContent()
    void vi.advanceTimersByTimeAsync(1_000)

    expect(sendRuntimeActionMessageMock).not.toHaveBeenCalled()
    cleanup()
  })
})
