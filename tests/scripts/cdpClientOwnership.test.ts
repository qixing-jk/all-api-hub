import { afterEach, describe, expect, it, vi } from "vitest"

import {
  connectDevExtension,
  connectExtensionById,
} from "~~/scripts/cdp/client.mjs"

const { connectOverCDP } = vi.hoisted(() => ({ connectOverCDP: vi.fn() }))
vi.mock("@playwright/test", () => ({ chromium: { connectOverCDP } }))
afterEach(() => vi.unstubAllEnvs())

describe("isolated CDP connection", () => {
  it.each(["discovery", "pinned"])(
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
        mode === "discovery"
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
})
