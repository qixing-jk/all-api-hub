import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  assertDevBrowserProfile,
  ensureDevExtensionReady,
} from "~~/scripts/cdp/browser-runtime.mjs"

afterEach(() => vi.unstubAllEnvs())
const browserWith = (send: ReturnType<typeof vi.fn>, evaluate = vi.fn()) =>
  ({
    newBrowserCDPSession: async () => ({ send, detach: vi.fn(async () => {}) }),
    contexts: () => [
      {
        newPage: async () => ({
          goto: vi.fn(),
          evaluate,
          close: vi.fn(async () => {}),
        }),
      },
    ],
  }) as never

describe("CDP browser ownership and extension readiness", () => {
  it("verifies an already installed extension when CDP loading requires pipe transport", async () => {
    const extensionDir = path.resolve("extension-fixture")
    const send = vi
      .fn()
      .mockRejectedValue(
        new Error("Method not available: requires --remote-debugging-pipe"),
      )
    const evaluate = vi
      .fn()
      .mockResolvedValue([
        { id: "fixture-id", path: extensionDir, state: "ENABLED" },
      ])
    await expect(
      ensureDevExtensionReady(browserWith(send, evaluate), extensionDir),
    ).resolves.toBe("fixture-id")
  })

  it("rejects a foreign installation on the compatibility path", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Method not available"))
    const evaluate = vi
      .fn()
      .mockResolvedValue([
        {
          id: "other",
          path: path.resolve("other-extension"),
          state: "ENABLED",
        },
      ])
    await expect(
      ensureDevExtensionReady(
        browserWith(send, evaluate),
        path.resolve("extension-fixture"),
      ),
    ).rejects.toThrow("requested extension is not loaded")
  })

  it("enables and rereads a disabled installation on the compatibility path", async () => {
    const extensionDir = path.resolve("extension-fixture")
    const send = vi.fn().mockRejectedValue(new Error("Method not available"))
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "fixture-id", path: extensionDir, state: "DISABLED" },
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        { id: "fixture-id", path: extensionDir, state: "ENABLED" },
      ])
    await expect(
      ensureDevExtensionReady(browserWith(send, evaluate), extensionDir),
    ).resolves.toBe("fixture-id")
    expect(evaluate).toHaveBeenCalledTimes(3)
  })

  it("preserves installation errors instead of hiding them behind a compatibility retry", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Invalid manifest"))
    const evaluate = vi.fn()
    await expect(
      ensureDevExtensionReady(
        browserWith(send, evaluate),
        path.resolve("extension-fixture"),
      ),
    ).rejects.toThrow("Invalid manifest")
    expect(evaluate).not.toHaveBeenCalled()
  })
  it("rejects another profile before a caller can reload or close it", async () => {
    vi.stubEnv("AAH_DEV_PROFILE_PER_WORKTREE", "1")
    vi.stubEnv("AAH_DEV_PROFILE_DIR", "expected-profile")
    const send = vi
      .fn()
      .mockResolvedValue({ arguments: ["--user-data-dir=other-profile"] })
    await expect(assertDevBrowserProfile(browserWith(send))).rejects.toThrow(
      "profile",
    )
  })

  it("rejects an unverifiable isolated listener", async () => {
    vi.stubEnv("AAH_DEV_PROFILE_PER_WORKTREE", "1")
    await expect(
      assertDevBrowserProfile(
        browserWith(vi.fn().mockRejectedValue(new Error("unavailable"))),
      ),
    ).rejects.toThrow()
  })

  it("accepts the requested profile", async () => {
    vi.stubEnv("AAH_DEV_PROFILE_PER_WORKTREE", "1")
    vi.stubEnv("AAH_DEV_PROFILE_DIR", "expected-profile")
    const send = vi.fn().mockResolvedValue({
      arguments: ["--user-data-dir", path.resolve("expected-profile")],
    })
    await assertDevBrowserProfile(browserWith(send))
    expect(send).toHaveBeenCalledWith("Browser.getBrowserCommandLine")
  })

  it("preserves shared browser compatibility", async () => {
    vi.stubEnv("AAH_DEV_PROFILE_PER_WORKTREE", "0")
    vi.stubEnv("AAH_DEV_PROFILE_DIR", "")
    const send = vi.fn()
    await assertDevBrowserProfile(browserWith(send))
    expect(send).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    "loads through the browser and checks enabled state: %s",
    async (enabled) => {
      const extensionDir = path.resolve("extension-fixture")
      const send = vi.fn().mockImplementation(async (method: string) =>
        method === "Extensions.loadUnpacked"
          ? { id: "fixture-id" }
          : {
              extensions: [{ id: "fixture-id", path: extensionDir, enabled }],
            },
      )
      const result = ensureDevExtensionReady(browserWith(send), extensionDir)
      if (enabled) await expect(result).resolves.toBe("fixture-id")
      else await expect(result).rejects.toThrow("enabled")
      expect(send).toHaveBeenCalledWith("Extensions.loadUnpacked", {
        path: extensionDir,
      })
    },
  )

  it("reenables a disabled unpacked extension through the browser manager and confirms it", async () => {
    const extensionDir = path.resolve("extension-fixture")
    let enabled = false
    const send = vi
      .fn()
      .mockImplementation(async (method: string) =>
        method === "Extensions.loadUnpacked"
          ? { id: "fixture-id" }
          : { extensions: [{ id: "fixture-id", path: extensionDir, enabled }] },
      )
    const evaluate = vi.fn(async () => {
      enabled = true
    })
    await expect(
      ensureDevExtensionReady(browserWith(send, evaluate), extensionDir),
    ).resolves.toBe("fixture-id")
    expect(evaluate).toHaveBeenCalledWith(expect.any(Function), "fixture-id")
  })
})
