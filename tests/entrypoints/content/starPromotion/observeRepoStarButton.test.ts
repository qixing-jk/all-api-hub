// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://github.com/qixing-jk/all-api-hub"}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setupStarPromotionContent } from "~/entrypoints/content/starPromotion/observeRepoStarButton"

const { sendRuntimeActionMessageMock } = vi.hoisted(() => ({
  sendRuntimeActionMessageMock: vi.fn(),
}))

vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendRuntimeActionMessage: sendRuntimeActionMessageMock,
}))

function renderStarButton(pressed: boolean) {
  document.body.innerHTML = `<button aria-label="Star this repository" aria-pressed="${pressed}">Star</button>`
}

describe("setupStarPromotionContent", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    vi.useFakeTimers()
    window.history.replaceState({}, "", "/qixing-jk/all-api-hub")
    sendRuntimeActionMessageMock
      .mockReset()
      .mockResolvedValue({ success: true })
    renderStarButton(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    document.body.innerHTML = ""
  })

  it("verifies an initial unstarred page with a fresh authenticated read", async () => {
    renderStarButton(false)
    vi.mocked(fetch).mockResolvedValue(
      new Response('<form action="/qixing-jk/all-api-hub/star"></form>'),
    )
    const cleanup = setupStarPromotionContent()
    await vi.waitFor(() =>
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ starred: false, starRemoved: true }),
      ),
    )
    expect(fetch).toHaveBeenCalledWith(
      window.location.href,
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    )
    cleanup()
  })

  it("does not revoke a star when a fresh page still shows starred", async () => {
    renderStarButton(false)
    vi.mocked(fetch).mockResolvedValue(
      new Response('<form action="/qixing-jk/all-api-hub/unstar"></form>'),
    )
    const cleanup = setupStarPromotionContent()
    await vi.waitFor(() =>
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ starred: false, starRemoved: false }),
      ),
    )
    cleanup()
  })

  it.each(["unknown", "http-error", "redirect"])(
    "does not confirm removal from a %s verification result",
    async (result) => {
      renderStarButton(false)
      const response = new Response("<html></html>", {
        status: result === "http-error" ? 500 : 200,
      })
      if (result === "redirect")
        Object.defineProperty(response, "redirected", { value: true })
      vi.mocked(fetch).mockResolvedValue(response)
      const cleanup = setupStarPromotionContent()
      await vi.waitFor(() =>
        expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
          expect.objectContaining({ starred: false, starRemoved: false }),
        ),
      )
      cleanup()
    },
  )

  it("keeps detected completion when verification times out", async () => {
    renderStarButton(false)
    vi.mocked(fetch).mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          )
        }),
    )
    const cleanup = setupStarPromotionContent()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ starred: false, starRemoved: false }),
    )
    cleanup()
  })

  it("does not publish verification after the observer is disposed", async () => {
    renderStarButton(false)
    let finish!: (response: Response) => void
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const cleanup = setupStarPromotionContent()
    cleanup()
    finish(new Response('<form action="/qixing-jk/all-api-hub/star"></form>'))
    await vi.advanceTimersByTimeAsync(1)
    expect(sendRuntimeActionMessageMock).not.toHaveBeenCalled()
  })

  it("discards removal evidence when the live page became starred during verification", async () => {
    renderStarButton(false)
    let finish!: (response: Response) => void
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const cleanup = setupStarPromotionContent()
    document.querySelector("button")?.setAttribute("aria-pressed", "true")
    finish(new Response('<form action="/qixing-jk/all-api-hub/star"></form>'))
    await vi.waitFor(() =>
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ starred: true }),
      ),
    )
    expect(sendRuntimeActionMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ starRemoved: true }),
    )
    cleanup()
  })

  it.each([new Error("worker failed"), "worker failed"])(
    "retries after a rejected report",
    async (error) => {
      sendRuntimeActionMessageMock
        .mockRejectedValueOnce(error)
        .mockResolvedValue({ success: true })
      const cleanup = setupStarPromotionContent()
      await vi.advanceTimersByTimeAsync(1_000)
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(2)
      cleanup()
    },
  )

  it("retries fresh verification after a failed read was acknowledged", async () => {
    renderStarButton(false)
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(
        new Response('<form action="/qixing-jk/all-api-hub/star"></form>'),
      )
    const cleanup = setupStarPromotionContent()
    await vi.waitFor(() =>
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ starRemoved: false }),
      ),
    )
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sendRuntimeActionMessageMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ starRemoved: true }),
    )
    cleanup()
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
    vi.mocked(fetch).mockResolvedValue(
      new Response('<form action="/qixing-jk/all-api-hub/star"></form>'),
    )
    const cleanup = setupStarPromotionContent()
    await vi.waitFor(() =>
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ starred: false, starRemoved: true }),
      ),
    )

    await vi.advanceTimersByTimeAsync(30_000)
    document.querySelector("button")?.setAttribute("aria-pressed", "true")

    await vi.waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(2)
    })
    cleanup()
  })

  it("reports unstarred changes or duplicate the starred state", async () => {
    const cleanup = setupStarPromotionContent()
    await vi.waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(1)
    })

    document.body.append(document.createElement("span"))
    await Promise.resolve()
    expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(1)

    document.querySelector("button")?.setAttribute("aria-pressed", "false")
    await vi.waitFor(() =>
      expect(sendRuntimeActionMessageMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ starred: false, starRemoved: true }),
      ),
    )
    cleanup()
  })

  it("waits for GitHub to hydrate a star control", async () => {
    document.body.innerHTML = ""
    const cleanup = setupStarPromotionContent()
    expect(sendRuntimeActionMessageMock).not.toHaveBeenCalled()

    renderStarButton(false)
    await vi.waitFor(() =>
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({ starred: false }),
      ),
    )

    document.querySelector("button")?.setAttribute("aria-pressed", "true")
    await vi.waitFor(() => {
      expect(sendRuntimeActionMessageMock).toHaveBeenCalledTimes(2)
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
