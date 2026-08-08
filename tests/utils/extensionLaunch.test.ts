import path from "node:path"
import { describe, expect, it, vi } from "vitest"

import {
  buildExtensionLaunchOptions,
  launchExtensionContextWithStartupRetry,
} from "~~/e2e/utils/extensionLaunch"

describe("buildExtensionLaunchOptions", () => {
  it("forces modern headless when running an explicit Chrome binary for extension E2E", () => {
    const options = buildExtensionLaunchOptions({
      extensionDir: "/repo/.output/chrome-mv3-e2e",
      headless: true,
      chromeExecutablePath: "/opt/chrome-116/chrome",
    })

    expect(options.args).toContain("--headless=new")
    expect(options.ignoreDefaultArgs).toContain("--headless")
    expect(options.ignoreDefaultArgs).toContain("--disable-extensions")
    expect(options.executablePath).toBe(path.resolve("/opt/chrome-116/chrome"))
    expect(options.channel).toBeUndefined()
  })

  it("keeps Playwright Chromium on its channel-based new headless path", () => {
    const options = buildExtensionLaunchOptions({
      extensionDir: "/repo/.output/chrome-mv3-e2e",
      headless: true,
    })

    expect(options.args).not.toContain("--headless=new")
    expect(options.ignoreDefaultArgs).not.toContain("--headless")
    expect(options.channel).toBe("chromium")
    expect(options.executablePath).toBeUndefined()
  })

  it("does not inject headless flags for headed debugging", () => {
    const options = buildExtensionLaunchOptions({
      extensionDir: "/repo/.output/chrome-mv3-e2e",
      headless: false,
      chromeExecutablePath: "/opt/chrome-116/chrome",
    })

    expect(options.args).not.toContain("--headless=new")
    expect(options.ignoreDefaultArgs).not.toContain("--headless")
    expect(options.executablePath).toBe(path.resolve("/opt/chrome-116/chrome"))
  })
})

describe("launchExtensionContextWithStartupRetry", () => {
  it("returns the first ready context without retrying", async () => {
    const firstContext = { close: vi.fn().mockResolvedValue(undefined) }
    const launch = vi.fn().mockResolvedValue(firstContext)
    const waitForReady = vi.fn().mockResolvedValue(undefined)
    const onRetry = vi.fn()

    await expect(
      launchExtensionContextWithStartupRetry({
        launch,
        onRetry,
        waitForReady,
      }),
    ).resolves.toBe(firstContext)

    expect(launch).toHaveBeenCalledOnce()
    expect(waitForReady).toHaveBeenCalledWith(firstContext, 1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it("does not retry browser launch failures", async () => {
    const launchError = new Error("browser executable is unavailable")
    const launch = vi.fn().mockRejectedValue(launchError)
    const waitForReady = vi.fn()

    await expect(
      launchExtensionContextWithStartupRetry({ launch, waitForReady }),
    ).rejects.toBe(launchError)

    expect(launch).toHaveBeenCalledOnce()
    expect(waitForReady).not.toHaveBeenCalled()
  })

  it("closes a context whose worker startup failed and retries once", async () => {
    const firstContext = { close: vi.fn().mockResolvedValue(undefined) }
    const secondContext = { close: vi.fn().mockResolvedValue(undefined) }
    const launch = vi
      .fn()
      .mockResolvedValueOnce(firstContext)
      .mockResolvedValueOnce(secondContext)
    const waitForReady = vi
      .fn()
      .mockRejectedValueOnce(new Error("worker startup timed out"))
      .mockResolvedValueOnce(undefined)
    const onRetry = vi.fn()

    await expect(
      launchExtensionContextWithStartupRetry({
        launch,
        onRetry,
        waitForReady,
      }),
    ).resolves.toBe(secondContext)

    expect(firstContext.close).toHaveBeenCalledOnce()
    expect(secondContext.close).not.toHaveBeenCalled()
    expect(launch).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ message: "worker startup timed out" }),
      1,
    )
  })

  it("preserves the final readiness error after the bounded retry", async () => {
    const contexts = [
      { close: vi.fn().mockResolvedValue(undefined) },
      { close: vi.fn().mockResolvedValue(undefined) },
    ]
    const launch = vi
      .fn()
      .mockResolvedValueOnce(contexts[0])
      .mockResolvedValueOnce(contexts[1])
    const waitForReady = vi
      .fn()
      .mockRejectedValueOnce(new Error("first startup timed out"))
      .mockRejectedValueOnce(new Error("second startup timed out"))

    await expect(
      launchExtensionContextWithStartupRetry({ launch, waitForReady }),
    ).rejects.toThrow("second startup timed out")

    expect(contexts[0].close).toHaveBeenCalledOnce()
    expect(contexts[1].close).toHaveBeenCalledOnce()
    expect(launch).toHaveBeenCalledTimes(2)
  })

  it("does not retry when the failed context cannot be closed", async () => {
    const closeError = new Error("context close failed")
    const context = { close: vi.fn().mockRejectedValue(closeError) }
    const launch = vi.fn().mockResolvedValue(context)
    const waitForReady = vi
      .fn()
      .mockRejectedValue(new Error("worker startup timed out"))

    await expect(
      launchExtensionContextWithStartupRetry({ launch, waitForReady }),
    ).rejects.toEqual(
      expect.objectContaining({
        errors: expect.arrayContaining([closeError]),
      }),
    )

    expect(launch).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
  })
})
