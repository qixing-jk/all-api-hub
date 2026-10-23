import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { reloadRunningExtension } from "~~/scripts/cdp/reload.mjs"

const { connectOverCDP } = vi.hoisted(() => ({ connectOverCDP: vi.fn() }))
vi.mock("@playwright/test", () => ({ chromium: { connectOverCDP } }))

afterEach(() => vi.unstubAllEnvs())

function fixture(output = "chrome-mv3-dev") {
  vi.stubEnv("AAH_DEV_PROFILE_PER_WORKTREE", "0")
  vi.stubEnv("AAH_DEV_PROFILE_DIR", "")
  const extensionDir = path.resolve(".output", output)
  const worker = (id: string) => ({
    url: () => `chrome-extension://${id}/background.js`,
    evaluate: vi.fn(async () => {}),
    waitForEvent: vi.fn(async () => {}),
  })
  const otherWorker = worker("other")
  const selectedWorker = worker("selected")
  const replacementWorker = {
    ...worker("selected"),
    evaluate: vi.fn(async () => "selected"),
  }
  const page = (url: string) => ({
    url: () => url,
    isClosed: vi.fn(() => false),
    reload: vi.fn(async () => {}),
    evaluate: vi.fn(async () => ({ success: true, tabIds: [] })),
  })
  const otherPage = page("chrome-extension://other/options.html")
  const selectedPage = page("chrome-extension://selected/options.html")
  const prefixPage = page("chrome-extension://selected-extra/options.html")
  const website = page("https://example.com/")
  const inspection = {
    goto: vi.fn(async () => {}),
    evaluate: vi.fn(async () => [
      {
        id: "other",
        path: path.resolve(
          ".output",
          output === "chrome-mv3-dev" ? "chrome-mv3" : "chrome-mv3-dev",
        ),
        state: "ENABLED",
      },
      { id: "selected", path: extensionDir, state: "ENABLED" },
    ]),
    close: vi.fn(async () => {}),
  }
  const context = {
    serviceWorkers: vi.fn(() => [otherWorker, selectedWorker]),
    waitForEvent: vi.fn(
      async (
        _event: string,
        _options: {
          predicate: (worker: typeof selectedWorker) => boolean
          timeout: number
        },
      ) => replacementWorker,
    ),
    pages: () => [otherPage, selectedPage, prefixPage, website],
    newPage: vi.fn(async (): Promise<unknown> => inspection),
  }
  const session = {
    send: vi.fn(async () => ({
      targetInfos: [{ url: otherWorker.url() }, { url: selectedWorker.url() }],
    })),
    detach: vi.fn(async () => {}),
  }
  const browser = {
    contexts: () => [context],
    newBrowserCDPSession: async () => session,
    close: vi.fn(async () => {}),
  }
  connectOverCDP.mockResolvedValue(browser)
  return {
    extensionDir,
    otherWorker,
    selectedWorker,
    otherPage,
    selectedPage,
    prefixPage,
    website,
    inspection,
    context,
    browser,
    session,
    replacementWorker,
  }
}

describe("reload the selected installed extension", () => {
  it.each(["chrome-mv3-dev", "chrome-mv3"])(
    "reloads only the selected %s build when another extension is first",
    async (output) => {
      const f = fixture(output)
      await reloadRunningExtension(9444, f.extensionDir)
      expect(f.selectedWorker.evaluate).toHaveBeenCalledOnce()
      expect(f.otherWorker.evaluate).not.toHaveBeenCalled()
      expect(f.selectedPage.reload).toHaveBeenCalledOnce()
      expect(f.otherPage.reload).not.toHaveBeenCalled()
      expect(f.prefixPage.reload).not.toHaveBeenCalled()
      expect(f.website.reload).not.toHaveBeenCalled()
      expect(f.browser.close).toHaveBeenCalledOnce()
    },
  )

  it("fails without reloading another extension when the requested path is absent", async () => {
    const f = fixture()
    f.inspection.evaluate.mockResolvedValue([
      { id: "other", path: path.resolve("other-worktree"), state: "ENABLED" },
    ])
    await expect(reloadRunningExtension(9444, f.extensionDir)).rejects.toThrow(
      "requested extension is not loaded",
    )
    expect(f.otherWorker.evaluate).not.toHaveBeenCalled()
    expect(f.selectedWorker.evaluate).not.toHaveBeenCalled()
    expect(f.inspection.close).toHaveBeenCalledOnce()
    expect(f.browser.close).toHaveBeenCalledOnce()
  })

  it("reports worker reload failures and detaches without refreshing any pages", async () => {
    const f = fixture()
    const failure = new Error("reload denied")
    f.selectedWorker.evaluate.mockRejectedValue(failure)
    await expect(reloadRunningExtension(9444, f.extensionDir)).rejects.toBe(
      failure,
    )
    expect(f.selectedPage.reload).not.toHaveBeenCalled()
    expect(f.otherPage.reload).not.toHaveBeenCalled()
    expect(f.browser.close).toHaveBeenCalledOnce()
  })

  it("waits for the old worker to exit before refreshing the selected page", async () => {
    const f = fixture()
    let closeWorker!: () => void
    f.selectedWorker.waitForEvent.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          closeWorker = resolve
        }),
    )
    const reload = reloadRunningExtension(9444, f.extensionDir)
    await vi.waitFor(() =>
      expect(f.selectedWorker.evaluate).toHaveBeenCalledOnce(),
    )
    expect(f.selectedPage.reload).not.toHaveBeenCalled()
    closeWorker()
    await reload
    expect(f.selectedPage.reload).toHaveBeenCalledOnce()
  })

  it("accepts reload-induced context destruction only after observing worker closure", async () => {
    const f = fixture()
    f.selectedWorker.evaluate.mockRejectedValue(
      new Error("Execution context was destroyed"),
    )
    await expect(reloadRunningExtension(9444, f.extensionDir)).resolves.toBe(
      "selected",
    )
    expect(f.selectedWorker.waitForEvent).toHaveBeenCalledWith("close", {
      timeout: 10000,
    })
    expect(f.selectedPage.reload).toHaveBeenCalledOnce()
  })

  it("reports a worker closure timeout instead of claiming reload succeeded", async () => {
    const f = fixture()
    const failure = new Error("worker close timeout")
    f.selectedWorker.waitForEvent.mockRejectedValue(failure)
    await expect(reloadRunningExtension(9444, f.extensionDir)).rejects.toBe(
      failure,
    )
    expect(f.selectedPage.reload).not.toHaveBeenCalled()
    expect(f.browser.close).toHaveBeenCalledOnce()
  })

  it("rejects when the old worker exits but a replacement cannot start", async () => {
    const f = fixture()
    const failure = new Error("replacement worker startup timeout")
    f.context.waitForEvent.mockRejectedValue(failure)
    await expect(reloadRunningExtension(9444, f.extensionDir)).rejects.toBe(
      failure,
    )
    expect(f.browser.close).toHaveBeenCalledOnce()
  })

  it("rejects when the replacement worker cannot answer a runtime identity check", async () => {
    const f = fixture()
    const failure = new Error("replacement worker terminated")
    f.replacementWorker.evaluate.mockRejectedValue(failure)
    await expect(reloadRunningExtension(9444, f.extensionDir)).rejects.toBe(
      failure,
    )
    expect(f.otherWorker.evaluate).not.toHaveBeenCalled()
    expect(f.browser.close).toHaveBeenCalledOnce()
  })

  it("rejects a replacement whose background listener did not start", async () => {
    const f = fixture()
    const failure = new Error("Receiving end does not exist")
    f.selectedPage.evaluate.mockRejectedValue(failure)
    await expect(reloadRunningExtension(9444, f.extensionDir)).rejects.toBe(
      failure,
    )
    expect(f.replacementWorker.evaluate).toHaveBeenCalledOnce()
    expect(f.otherWorker.evaluate).not.toHaveBeenCalled()
    expect(f.browser.close).toHaveBeenCalledOnce()
  })

  it.each([
    { success: false, tabIds: [] },
    { success: true, tabIds: [42] },
    undefined,
  ])(
    "rejects an invalid background readiness response: %j",
    async (response) => {
      const f = fixture()
      f.selectedPage.evaluate.mockResolvedValue(response as never)
      await expect(
        reloadRunningExtension(9444, f.extensionDir),
      ).rejects.toThrow("Background readiness probe failed")
      expect(f.otherPage.reload).not.toHaveBeenCalled()
      expect(f.browser.close).toHaveBeenCalledOnce()
    },
  )

  it("wakes and verifies the replacement even when no extension page was open", async () => {
    const f = fixture()
    vi.spyOn(f.context, "pages").mockReturnValue([])
    const readyPage = {
      goto: vi.fn(async () => {}),
      evaluate: vi.fn(async () => ({ success: true, tabIds: [] })),
      close: vi.fn(async () => {}),
    }
    f.context.newPage
      .mockResolvedValueOnce(f.inspection)
      .mockResolvedValueOnce(readyPage)
    await reloadRunningExtension(9444, f.extensionDir)
    expect(readyPage.goto).toHaveBeenCalledWith(
      "chrome-extension://selected/options.html",
      expect.any(Object),
    )
    expect(f.replacementWorker.evaluate).toHaveBeenCalledOnce()
    expect(readyPage.close).toHaveBeenCalledOnce()
    expect(f.otherPage.reload).not.toHaveBeenCalled()
  })

  it("finishes pending page creation before cleaning up a replacement startup failure", async () => {
    const f = fixture()
    vi.spyOn(f.context, "pages").mockReturnValue([])
    const failure = new Error("replacement startup timeout")
    f.context.waitForEvent.mockRejectedValue(failure)
    const readyPage = {
      goto: vi.fn(async () => {}),
      evaluate: vi.fn(async () => ({ success: true, tabIds: [] })),
      close: vi.fn(async () => {}),
    }
    let createPage!: (page: unknown) => void
    f.context.newPage
      .mockResolvedValueOnce(f.inspection)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            createPage = resolve
          }),
      )
    let settled = false
    const result = reloadRunningExtension(9444, f.extensionDir).then(
      () => {
        settled = true
        return undefined
      },
      (error) => {
        settled = true
        return error
      },
    )
    await vi.waitFor(() => expect(f.context.newPage).toHaveBeenCalledTimes(2))
    try {
      expect(settled).toBe(false)
    } finally {
      createPage(readyPage)
    }
    expect(await result).toBe(failure)
    expect(readyPage.close).toHaveBeenCalledOnce()
  })

  it("restores a selected Options page closed by the extension reload", async () => {
    const f = fixture()
    f.selectedPage.isClosed.mockReturnValue(true)
    const replacement = {
      goto: vi.fn(async () => {}),
      evaluate: vi.fn(async () => ({ success: true, tabIds: [] })),
      close: vi.fn(async () => {}),
    }
    f.context.newPage
      .mockResolvedValueOnce(f.inspection)
      .mockResolvedValueOnce(replacement)
    await reloadRunningExtension(9444, f.extensionDir)
    expect(replacement.goto).toHaveBeenCalledWith(
      "chrome-extension://selected/options.html",
      expect.any(Object),
    )
    expect(f.selectedPage.reload).not.toHaveBeenCalled()
    expect(f.otherPage.reload).not.toHaveBeenCalled()
    expect(f.selectedWorker.waitForEvent).toHaveBeenCalledWith("close", {
      timeout: 10000,
    })
  })

  it("refuses a foreign browser profile before inspecting or reloading extensions", async () => {
    const f = fixture()
    vi.stubEnv("AAH_DEV_PROFILE_DIR", "expected-profile")
    f.session.send.mockResolvedValue({
      arguments: ["--user-data-dir=foreign-profile"],
    } as never)
    await expect(reloadRunningExtension(9444, f.extensionDir)).rejects.toThrow(
      "profile mismatch",
    )
    expect(f.context.newPage).not.toHaveBeenCalled()
    expect(f.otherWorker.evaluate).not.toHaveBeenCalled()
    expect(f.browser.close).toHaveBeenCalledOnce()
    expect(f.session.detach).toHaveBeenCalledOnce()
  })

  it("wakes a dormant selected worker through its own page without touching the active foreign worker", async () => {
    const f = fixture()
    f.context.serviceWorkers.mockReturnValue([f.otherWorker])
    const wakePage = {
      goto: vi.fn(async () => {}),
      evaluate: vi.fn(async () => ({ success: true, tabIds: [] })),
      close: vi.fn(async () => {}),
    }
    f.context.newPage
      .mockResolvedValueOnce(f.inspection)
      .mockResolvedValueOnce(wakePage)
    await reloadRunningExtension(9444, f.extensionDir)
    expect(wakePage.goto).toHaveBeenCalledWith(
      "chrome-extension://selected/options.html",
      expect.any(Object),
    )
    expect(wakePage.evaluate).toHaveBeenCalledOnce()
    const [, options] = f.context.waitForEvent.mock.calls[0] as unknown as [
      string,
      {
        predicate: (worker: typeof f.selectedWorker) => boolean
        timeout: number
      },
    ]
    expect(options.predicate(f.otherWorker)).toBe(false)
    expect(options.predicate(f.selectedWorker)).toBe(true)
    expect(options.timeout).toBeGreaterThan(0)
    expect(f.selectedWorker.evaluate).not.toHaveBeenCalled()
    expect(f.otherWorker.evaluate).not.toHaveBeenCalled()
    expect(f.replacementWorker.evaluate).toHaveBeenCalledOnce()
    expect(wakePage.close).toHaveBeenCalledOnce()
    expect(f.inspection.close).toHaveBeenCalledOnce()
    expect(f.browser.close).toHaveBeenCalledOnce()
  })

  it("cleans up the temporary page and connection when the selected worker does not wake", async () => {
    const f = fixture()
    f.context.serviceWorkers.mockReturnValue([f.otherWorker])
    const failure = new Error("worker wake timeout")
    f.context.waitForEvent.mockRejectedValue(failure)
    const wakePage = {
      goto: vi.fn(async () => {}),
      evaluate: vi.fn(async () => ({ success: true, tabIds: [] })),
      close: vi.fn(async () => {}),
    }
    f.context.newPage
      .mockResolvedValueOnce(f.inspection)
      .mockResolvedValueOnce(wakePage)
    await expect(reloadRunningExtension(9444, f.extensionDir)).rejects.toBe(
      failure,
    )
    expect(f.otherWorker.evaluate).not.toHaveBeenCalled()
    expect(f.selectedWorker.evaluate).not.toHaveBeenCalled()
    expect(wakePage.close).toHaveBeenCalledOnce()
    expect(f.browser.close).toHaveBeenCalledOnce()
  })
})
