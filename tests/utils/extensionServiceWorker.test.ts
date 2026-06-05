import type { BrowserContext, Worker } from "@playwright/test"
import { describe, expect, it } from "vitest"

import {
  getExtensionServiceWorker,
  isExtensionServiceWorkerUrl,
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

function createMockContext(workers: Worker[]): BrowserContext {
  return {
    serviceWorkers: () => workers,
    waitForEvent: async () => undefined,
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
