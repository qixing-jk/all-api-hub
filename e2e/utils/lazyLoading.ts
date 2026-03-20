import fs from "node:fs/promises"
import path from "node:path"
import type { Page, TestInfo } from "@playwright/test"

import { OPTIONS_PAGE_PATH, POPUP_PAGE_PATH } from "~/constants/extensionPages"

export interface ExtensionMemorySnapshot {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

export interface ExtensionResourceSnapshot {
  label: string
  hash: string
  resourceCount: number
  resources: string[]
  jsResources: string[]
  cssResources: string[]
  memory: ExtensionMemorySnapshot | null
}

export interface ExtensionResourceDelta {
  newResources: string[]
  newJsResources: string[]
  newCssResources: string[]
}

export interface ExtensionRequestTracker {
  dispose: () => void
  getResourceCount: () => number
  getResources: () => string[]
}

interface ProbeSettleOptions {
  expectedHash?: string
  expectedSelector?: string
}

const APP_SHELL_SELECTOR_BY_PAGE_PATH: Record<string, string> = {
  [OPTIONS_PAGE_PATH]: '[data-testid="options-app"]',
  [POPUP_PAGE_PATH]: '[data-testid="popup-view-accounts"]',
}
const PROBE_POLL_INTERVAL_MS = 50

/**
 * Resolve the stable app-shell selector for the current extension page.
 */
function resolveAppShellSelector(page: Page) {
  const pathname = new URL(page.url()).pathname.replace(/^\//, "")
  return APP_SHELL_SELECTOR_BY_PAGE_PATH[pathname] ?? "#root > *"
}

/**
 * Count extension-origin resource timing entries currently visible from the page context.
 */
async function getTrackedResourceCountFromPage(page: Page) {
  return await page.evaluate(() => {
    const extensionOrigin = window.location.origin

    return performance.getEntriesByType("resource").filter((entry) => {
      if (!entry.name) {
        return false
      }

      try {
        return new URL(entry.name, extensionOrigin).origin === extensionOrigin
      } catch {
        return false
      }
    }).length
  })
}

/**
 * Returns whether the lazy-loading probe should enforce strict assertions.
 */
export function shouldAssertLazyLoading(): boolean {
  return process.env.AAH_LAZY_LOADING_ASSERT !== "0"
}

/**
 * Wait until the extension page renders its stable app shell instead of the outer Suspense fallback.
 */
export async function waitForExtensionRoot(page: Page) {
  await page.waitForSelector(resolveAppShellSelector(page), { timeout: 30_000 })
  await page.waitForTimeout(300)
}

/**
 * Give the extension page a bounded window to settle after a view switch in non-strict probe mode.
 */
export async function waitForProbeSettle(
  page: Page,
  delayMs = 500,
  options: ProbeSettleOptions = {},
) {
  const initialTrackedResourceCount =
    await getTrackedResourceCountFromPage(page)
  const deadline = Date.now() + delayMs

  while (Date.now() < deadline) {
    const trackedResourceCount = await getTrackedResourceCountFromPage(page)
    if (trackedResourceCount > initialTrackedResourceCount) {
      return
    }

    if (
      options.expectedSelector &&
      (await page.locator(options.expectedSelector).count()) > 0
    ) {
      return
    }

    if (
      options.expectedHash &&
      (await page.evaluate(
        (expectedHash) => window.location.hash === expectedHash,
        options.expectedHash,
      ))
    ) {
      return
    }

    await page.waitForTimeout(PROBE_POLL_INTERVAL_MS)
  }
}

/**
 * Track extension-owned requests observed by Playwright for the current page.
 */
export function createExtensionRequestTracker(
  page: Page,
  extensionId: string,
): ExtensionRequestTracker {
  const extensionOrigin = `chrome-extension://${extensionId}/`
  const trackedResources = new Set<string>()

  const handleRequest = (request: { url: () => string }) => {
    const url = request.url()
    if (!url.startsWith(extensionOrigin)) {
      return
    }

    const parsed = new URL(url)
    trackedResources.add(`${parsed.pathname.slice(1)}${parsed.search}`)
  }

  page.on("request", handleRequest)

  return {
    dispose: () => {
      page.off("request", handleRequest)
    },
    getResourceCount: () => trackedResources.size,
    getResources: () => Array.from(trackedResources).sort(),
  }
}

/**
 * Capture tracked extension resources and optional JS heap information from the page.
 */
export async function captureExtensionResourceSnapshot(
  page: Page,
  label: string,
  tracker: ExtensionRequestTracker,
): Promise<ExtensionResourceSnapshot> {
  const [hash, memory] = await Promise.all([
    page.evaluate(() => window.location.hash),
    page.evaluate(() => {
      const perf = performance as Performance & {
        memory?: {
          usedJSHeapSize: number
          totalJSHeapSize: number
          jsHeapSizeLimit: number
        }
      }

      if (!perf.memory) {
        return null
      }

      return {
        usedJSHeapSize: perf.memory.usedJSHeapSize,
        totalJSHeapSize: perf.memory.totalJSHeapSize,
        jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
      }
    }),
  ])

  const resources = tracker.getResources()

  return {
    label,
    hash,
    resourceCount: resources.length,
    resources,
    jsResources: resources.filter((resource) => resource.endsWith(".js")),
    cssResources: resources.filter((resource) => resource.endsWith(".css")),
    memory,
  }
}

/**
 * Poll until the tracker observes at least one additional resource.
 */
export async function waitForTrackedResourceCountIncrease(
  tracker: ExtensionRequestTracker,
  previousCount: number,
  options?: { minimumIncrease?: number; timeoutMs?: number },
) {
  const minimumIncrease = options?.minimumIncrease ?? 1
  const timeoutMs = options?.timeoutMs ?? 15_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (tracker.getResourceCount() >= previousCount + minimumIncrease) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(
    `Timed out waiting for tracked resource count to exceed ${previousCount}`,
  )
}

/**
 * Compute newly loaded resources between two snapshots.
 */
export function diffExtensionResourceSnapshots(
  before: ExtensionResourceSnapshot,
  after: ExtensionResourceSnapshot,
): ExtensionResourceDelta {
  const existingResources = new Set(before.resources)

  const newResources = after.resources.filter(
    (resource) => !existingResources.has(resource),
  )

  return {
    newResources,
    newJsResources: newResources.filter((resource) => resource.endsWith(".js")),
    newCssResources: newResources.filter((resource) =>
      resource.endsWith(".css"),
    ),
  }
}

/**
 * Attach a JSON artifact to the current Playwright test run for later inspection.
 */
export async function attachJsonReport(
  testInfo: TestInfo,
  name: string,
  payload: unknown,
) {
  const json = JSON.stringify(payload, null, 2)
  const reportDir = process.env.AAH_LAZY_LOADING_REPORT_DIR
    ? path.resolve(process.env.AAH_LAZY_LOADING_REPORT_DIR)
    : path.resolve(process.cwd(), "test-results", "lazy-loading-report")
  const outputPath = path.join(reportDir, `${name}.json`)

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, json, "utf8")

  await testInfo.attach(name, {
    body: Buffer.from(json, "utf8"),
    contentType: "application/json",
  })
}
