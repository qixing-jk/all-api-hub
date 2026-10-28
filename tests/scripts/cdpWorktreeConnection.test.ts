import { beforeEach, expect, it, vi } from "vitest"

import { connectWorktreeExtension } from "~~/scripts/cdp/client.mjs"

const { connect, verify, find } = vi.hoisted(() => ({
  connect: vi.fn(),
  verify: vi.fn(),
  find: vi.fn(),
}))
vi.mock("@playwright/test", () => ({ chromium: { connectOverCDP: connect } }))
vi.mock("~~/scripts/cdp/browser-runtime.mjs", () => ({
  assertDevBrowserProfile: verify,
  findInstalledDevExtension: find,
}))
beforeEach(() => vi.resetAllMocks())

it("discovers the exact build and attaches through one verified browser connection", async () => {
  const close = vi.fn(async () => {})
  const worker = { url: () => "chrome-extension://selected/background.js" }
  const browser = {
    close,
    contexts: () => [{ serviceWorkers: () => [worker] }],
  }
  connect.mockResolvedValue(browser)
  find.mockResolvedValue("selected")
  const result = await connectWorktreeExtension({
    extensionPath: "worktree/.output/chrome-mv3",
  })
  expect(result.serviceWorker).toBe(worker)
  expect(find).toHaveBeenCalledWith(browser, "worktree/.output/chrome-mv3")
  expect(connect).toHaveBeenCalledOnce()
  expect(close).not.toHaveBeenCalled()
  await result.close()
  expect(close).toHaveBeenCalledOnce()
})

it.each(["missing", "discovery failure"])(
  "detaches on exact-build discovery failure: %s",
  async (failure) => {
    const close = vi.fn(async () => {})
    connect.mockResolvedValue({ close, contexts: () => [{}] })
    if (failure === "missing") find.mockResolvedValue(null)
    else find.mockRejectedValue(new Error("inspection failed"))
    await expect(
      connectWorktreeExtension({ extensionPath: "expected-build" }),
    ).rejects.toThrow(
      failure === "missing" ? "not installed" : "inspection failed",
    )
    expect(connect).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  },
)

it("rejects a foreign browser before trying to inspect extensions", async () => {
  const close = vi.fn(async () => {})
  connect.mockResolvedValue({ close })
  verify.mockRejectedValue(new Error("wrong profile"))
  await expect(
    connectWorktreeExtension({ extensionPath: "expected-build" }),
  ).rejects.toThrow("wrong profile")
  expect(find).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
})
