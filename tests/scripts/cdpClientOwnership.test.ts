import { afterEach, describe, expect, it, vi } from "vitest"

import {
  connectDevBrowser,
  connectDevExtension,
  connectExtensionById,
} from "~~/scripts/cdp/client.mjs"

const { connectOverCDP } = vi.hoisted(() => ({ connectOverCDP: vi.fn() }))
vi.mock("@playwright/test", () => ({ chromium: { connectOverCDP } }))
afterEach(() => vi.unstubAllEnvs())

describe("isolated CDP connection", () => {
  it.each(["discovery", "pinned"])(
    "closes its wake-up page and detaches if waiting fails: %s",
    async (mode) => {
      vi.stubEnv("AAH_DEV_PROFILE_PER_WORKTREE", "1")
      vi.stubEnv("AAH_DEV_PROFILE_DIR", "expected-profile")
      const failure = new Error("wake-up interrupted")
      const closePage = vi.fn(async () => {})
      const close = vi.fn(async () => {})
      connectOverCDP.mockResolvedValue({
        contexts: () => [
          {
            serviceWorkers: () => [],
            newPage: async () => ({
              goto: async () => {},
              waitForTimeout: async () => {
                throw failure
              },
              close: closePage,
            }),
          },
        ],
        close,
        newBrowserCDPSession: async () => ({
          send: async () => ({
            arguments: ["--user-data-dir=expected-profile"],
            targetInfos: [],
          }),
          detach: async () => {},
        }),
      })
      await expect(
        mode === "discovery"
          ? connectDevExtension()
          : connectExtensionById({ extensionId: "fixture-id" }),
      ).rejects.toBe(failure)
      expect(closePage).toHaveBeenCalledOnce()
      expect(close).toHaveBeenCalledOnce()
    },
  )

  it.each(["discovery", "pinned"])(
    "detaches after a post-connect page creation failure: %s",
    async (mode) => {
      vi.stubEnv("AAH_DEV_PROFILE_PER_WORKTREE", "1")
      vi.stubEnv("AAH_DEV_PROFILE_DIR", "expected-profile")
      const failure = new Error("page creation failed")
      const close = vi.fn(async () => {})
      connectOverCDP.mockResolvedValue({
        contexts: () => [
          {
            serviceWorkers: () => [],
            newPage: async () => {
              throw failure
            },
          },
        ],
        close,
        newBrowserCDPSession: async () => ({
          send: async () => ({
            arguments: ["--user-data-dir=expected-profile"],
            targetInfos: [],
          }),
          detach: async () => {},
        }),
      })
      const connection =
        mode === "discovery"
          ? connectDevExtension()
          : connectExtensionById({ extensionId: "fixture-id" })
      await expect(connection).rejects.toBe(failure)
      expect(close).toHaveBeenCalledOnce()
    },
  )

  it.each(["browser", "discovery", "pinned"])(
    "refuses a foreign browser before extension access: %s",
    async (mode) => {
      vi.stubEnv("AAH_DEV_PROFILE_PER_WORKTREE", "1")
      vi.stubEnv("AAH_DEV_PROFILE_DIR", "expected-profile")
      const contexts = vi.fn()
      const close = vi.fn(async () => {})
      connectOverCDP.mockResolvedValue({
        contexts,
        close,
        newBrowserCDPSession: async () => ({
          send: async () => ({ arguments: ["--user-data-dir=other-profile"] }),
          detach: async () => {},
        }),
      })
      const connection =
        mode === "browser"
          ? connectDevBrowser({ cdpUrl: "http://127.0.0.1:9444" })
          : mode === "discovery"
            ? connectDevExtension({ cdpUrl: "http://127.0.0.1:9444" })
            : connectExtensionById({
                cdpUrl: "http://127.0.0.1:9444",
                extensionId: "fixture-id",
              })
      await expect(connection).rejects.toThrow("profile mismatch")
      expect(contexts).not.toHaveBeenCalled()
      expect(close).toHaveBeenCalledTimes(1)
    },
  )

  it("inspects the verified browser even when extension workers are dormant", async () => {
    vi.stubEnv("AAH_DEV_PROFILE_PER_WORKTREE", "1")
    vi.stubEnv("AAH_DEV_PROFILE_DIR", "expected-profile")
    const serviceWorkers = vi.fn(() => [])
    const context = { serviceWorkers }
    const close = vi.fn(async () => {})
    connectOverCDP.mockResolvedValue({
      contexts: () => [context],
      close,
      newBrowserCDPSession: async () => ({
        send: async () => ({ arguments: ["--user-data-dir=expected-profile"] }),
        detach: async () => {},
      }),
    })
    const dev = await connectDevBrowser()
    expect(dev.context).toBe(context)
    expect(serviceWorkers).not.toHaveBeenCalled()
    await dev.close()
    expect(close).toHaveBeenCalledOnce()
  })
})
