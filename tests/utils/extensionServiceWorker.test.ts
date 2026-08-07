import type { BrowserContext, Worker } from "@playwright/test"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_EXTENSION_SERVICE_WORKER_TIMEOUT_MS,
  getExtensionServiceWorker,
  isExtensionServiceWorkerUrl,
  resolveExtensionServiceWorkerTimeoutMs,
} from "~~/e2e/utils/extension"

type MockWorkerOptions = {
  probe?: {
    hasAlarms?: boolean
    hasRuntimeGetManifest?: boolean
    hasStorageLocal?: boolean
    runtimeId?: string | null
  }
  url: string
}

function createMockWorker({ probe, url }: MockWorkerOptions): Worker {
  return {
    evaluate: async () => ({
      hasAlarms: probe?.hasAlarms ?? true,
      hasRuntimeGetManifest: probe?.hasRuntimeGetManifest ?? true,
      hasStorageLocal: probe?.hasStorageLocal ?? true,
      runtimeId: probe?.runtimeId ?? new URL(url).host,
    }),
    url: () => url,
  } as unknown as Worker
}

function createMockContext(
  workers: Worker[],
  options: { eventWorker?: Worker } = {},
): BrowserContext {
  let eventDelivered = false

  return {
    serviceWorkers: () => workers,
    waitForEvent: async (
      _event: string,
      waitOptions?: { timeout?: number },
    ) => {
      if (options.eventWorker && !eventDelivered) {
        eventDelivered = true
        return options.eventWorker
      }

      await new Promise((resolve) =>
        setTimeout(resolve, waitOptions?.timeout ?? 0),
      )
      throw new Error("serviceworker event timed out")
    },
  } as unknown as BrowserContext
}

describe("isExtensionServiceWorkerUrl", () => {
  it("detects browser extension service worker URLs", () => {
    expect(
      isExtensionServiceWorkerUrl("chrome-extension://abc123/background.js"),
    ).toBe(true)
    expect(
      isExtensionServiceWorkerUrl("moz-extension://abc123/background.js"),
    ).toBe(true)
    expect(isExtensionServiceWorkerUrl("https://example.test/sw.js")).toBe(
      false,
    )
  })
})

describe("resolveExtensionServiceWorkerTimeoutMs", () => {
  it("uses the default timeout when no override is configured", () => {
    expect(resolveExtensionServiceWorkerTimeoutMs(undefined)).toBe(
      DEFAULT_EXTENSION_SERVICE_WORKER_TIMEOUT_MS,
    )
  })

  it("accepts a positive integer timeout override", () => {
    expect(resolveExtensionServiceWorkerTimeoutMs("45000")).toBe(45_000)
  })

  it.each(["0", "-1", "1.5", "invalid"])(
    "rejects invalid timeout override %s",
    (value) => {
      expect(() => resolveExtensionServiceWorkerTimeoutMs(value)).toThrow(
        "AAH_E2E_EXTENSION_STARTUP_TIMEOUT_MS",
      )
    },
  )
})

describe("getExtensionServiceWorker", () => {
  it("skips non-extension workers and workers whose extension APIs are not ready", async () => {
    const readyWorker = createMockWorker({
      url: "chrome-extension://ready-extension/background.js",
    })
    const context = createMockContext([
      createMockWorker({ url: "https://example.test/sw.js" }),
      createMockWorker({
        probe: { hasStorageLocal: false },
        url: "chrome-extension://not-ready/background.js",
      }),
      readyWorker,
    ])

    await expect(getExtensionServiceWorker(context)).resolves.toBe(readyWorker)
  })

  it("honors the expected extension id when multiple extension workers are visible", async () => {
    const expectedWorker = createMockWorker({
      url: "chrome-extension://expected-extension/background.js",
    })
    const context = createMockContext([
      createMockWorker({
        url: "chrome-extension://other-extension/background.js",
      }),
      expectedWorker,
    ])

    await expect(
      getExtensionServiceWorker(context, {
        extensionId: "expected-extension",
      }),
    ).resolves.toBe(expectedWorker)
  })

  it("uses a ready worker delivered by the serviceworker event even if it is not retained", async () => {
    const readyWorker = createMockWorker({
      url: "chrome-extension://transient-extension/background.js",
    })
    const context = createMockContext([], { eventWorker: readyWorker })

    await expect(
      getExtensionServiceWorker(context, { timeoutMs: 25 }),
    ).resolves.toBe(readyWorker)
  })

  it("reuses a previously verified worker when it leaves the active worker list", async () => {
    const readyWorker = createMockWorker({
      url: "chrome-extension://cached-extension/background.js",
    })
    const workers = [readyWorker]
    const context = createMockContext(workers)

    await expect(getExtensionServiceWorker(context)).resolves.toBe(readyWorker)

    workers.length = 0

    await expect(
      getExtensionServiceWorker(context, { timeoutMs: 5 }),
    ).resolves.toBe(readyWorker)
  })

  it("reports observed worker readiness when no usable extension worker appears", async () => {
    const context = createMockContext([
      createMockWorker({
        probe: { hasRuntimeGetManifest: false },
        url: "chrome-extension://not-ready/background.js",
      }),
    ])

    await expect(
      getExtensionServiceWorker(context, { timeoutMs: 1 }),
    ).rejects.toThrow(
      /chrome-extension:\/\/not-ready\/background\.js \(missing chrome\.runtime\.getManifest\)/,
    )
  })
})
