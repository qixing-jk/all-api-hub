/* eslint-disable jsdoc/require-jsdoc, jsdoc/require-param, jsdoc/require-returns */
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { chromium } from "@playwright/test"

import { formatBytes } from "./extension-memory-report-utils.mjs"

const repoRoot = process.cwd()
const EXTENSION_PAGE_WAIT_MS = 1000
const NEUTRAL_PAGE_WAIT_MS = 1500
const STABLE_PAGE_POLL_MS = 200
const STABLE_PAGE_MAX_WAIT_MS = 15_000
const HASHED_ASSET_PATTERN =
  /(.+)-([A-Za-z0-9_]{6,})(\.(?:js|css|png|svg|jpg|jpeg|webp))$/i
const APP_SHELL_SELECTOR_BY_PAGE_PATH = {
  "options.html": '[data-testid="options-app"]',
  "popup.html": '[data-testid="popup-view-accounts"]',
}
const READY_SELECTOR_BY_PAGE_PATH = {
  "options.html": '[data-testid="basic-settings-page"]',
  "popup.html": '[data-testid="account-list-view"]',
}

/**
 * Parse CLI flags for the single-run memory probe.
 */
function parseArgs(argv) {
  const options = {
    extensionDir: process.env.AAH_EXTENSION_DIR
      ? path.resolve(repoRoot, process.env.AAH_EXTENSION_DIR)
      : path.resolve(repoRoot, ".output", "chrome-mv3"),
    outputDir: path.resolve(
      repoRoot,
      "diagnostics-results",
      "memory",
      "snapshot",
      new Date().toISOString().replace(/[:.]/g, "-"),
    ),
    targetUrl: "https://example.com/",
  }

  for (const arg of argv) {
    if (arg.startsWith("--extension-dir=")) {
      options.extensionDir = path.resolve(arg.slice("--extension-dir=".length))
      continue
    }

    if (arg.startsWith("--output-dir=")) {
      options.outputDir = path.resolve(arg.slice("--output-dir=".length))
      continue
    }

    if (arg.startsWith("--web-url=")) {
      options.targetUrl = arg.slice("--web-url=".length) || options.targetUrl
    }
  }

  return options
}

/**
 * Return a numeric delta when both operands are finite.
 */
function difference(current, baseline) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) {
    return null
  }

  return current - baseline
}

/**
 * Normalize hashed local asset names so diffs stay readable across builds.
 */
function normalizeLocalResourceName(resourcePath) {
  return resourcePath.replace(HASHED_ASSET_PATTERN, "$1$3")
}

/**
 * Normalize external URLs down to origin + pathname to reduce query-string noise.
 */
function normalizeExternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return rawUrl
  }
}

/**
 * Ensure the built extension manifest exists.
 */
async function assertBuiltExtensionExists(extensionDir) {
  const manifestPath = path.join(extensionDir, "manifest.json")

  try {
    await fs.access(manifestPath)
  } catch {
    throw new Error(
      `Missing built extension at '${extensionDir}'. Run 'pnpm build' first.`,
    )
  }
}

/**
 * Resolve a local built asset size if it exists.
 */
async function getLocalAssetSize(extensionDir, relativePath) {
  try {
    const stats = await fs.stat(path.join(extensionDir, relativePath))
    return stats.size
  } catch {
    return null
  }
}

/**
 * Collect sizes for the main always-on background/content bundles.
 */
async function collectBuildArtifacts(extensionDir) {
  return {
    backgroundBundleBytes: await getLocalAssetSize(
      extensionDir,
      "background.js",
    ),
    contentScriptBundleBytes: await getLocalAssetSize(
      extensionDir,
      path.join("content-scripts", "content.js"),
    ),
  }
}

/**
 * Create a temp profile directory, run the callback, and clean up afterward.
 */
async function withTempProfile(prefix, callback) {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))

  try {
    return await callback(profileDir)
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true })
  }
}

/**
 * Close install-time onboarding tabs or stray blank pages so page probes stay isolated.
 */
async function closeNoisePages(context, extensionId = null) {
  const extensionOrigin = extensionId
    ? `chrome-extension://${extensionId}/`
    : null

  for (const existingPage of context.pages()) {
    const url = existingPage.url()

    if (url === "about:blank") {
      await existingPage.close().catch(() => {})
      continue
    }

    if (extensionOrigin && url.startsWith(extensionOrigin)) {
      await existingPage.close().catch(() => {})
    }
  }
}

/**
 * Launch a clean persistent Chromium context without the extension.
 */
async function launchPlainContext(profileDir) {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    channel: "chromium",
    args: ["--no-default-browser-check", "--no-first-run"],
  })

  await closeNoisePages(context)
  return context
}

/**
 * Launch a clean persistent Chromium context with the built extension loaded.
 */
async function launchExtensionContext(profileDir, extensionDir) {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    channel: "chromium",
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      "--no-default-browser-check",
      "--no-first-run",
    ],
    ignoreDefaultArgs: ["--disable-extensions"],
  })

  const serviceWorker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker", { timeout: 15_000 }))
  const extensionId = new URL(serviceWorker.url()).host

  await closeNoisePages(context, extensionId)

  return {
    context,
    extensionId,
  }
}

/**
 * Attach a response collector to the page.
 */
function createResponseCollector(page) {
  const responses = []

  const handleResponse = (response) => {
    responses.push({
      url: response.url(),
      resourceType: response.request().resourceType(),
      status: response.status(),
    })
  }

  page.on("response", handleResponse)

  return {
    dispose() {
      page.off("response", handleResponse)
    },
    getResponses() {
      return [...responses]
    },
  }
}

/**
 * Gather page-level memory and DOM metrics after forcing a GC where possible.
 */
async function capturePageMetrics(context, page) {
  const cdp = await context.newCDPSession(page)
  await cdp.send("Performance.enable")

  try {
    await cdp.send("HeapProfiler.enable")
    await cdp.send("HeapProfiler.collectGarbage")
  } catch {
    // Best-effort: some targets refuse heap-profiler commands.
  }

  const [performanceMetrics, domCounters, heapUsage, pageState] =
    await Promise.all([
      cdp.send("Performance.getMetrics"),
      cdp.send("Memory.getDOMCounters"),
      cdp.send("Runtime.getHeapUsage"),
      page.evaluate(() => {
        const perf = performance

        return {
          title: document.title,
          perfMemory:
            "memory" in perf
              ? {
                  usedJSHeapSize: perf.memory.usedJSHeapSize,
                  totalJSHeapSize: perf.memory.totalJSHeapSize,
                  jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
                }
              : null,
        }
      }),
    ])

  const namedMetrics = Object.fromEntries(
    performanceMetrics.metrics.map((metric) => [metric.name, metric.value]),
  )

  return {
    title: pageState.title,
    memory: {
      performanceJsHeapUsedSize: namedMetrics.JSHeapUsedSize ?? null,
      performanceJsHeapTotalSize: namedMetrics.JSHeapTotalSize ?? null,
      runtimeUsedSize: heapUsage.usedSize ?? null,
      runtimeTotalSize: heapUsage.totalSize ?? null,
      embedderHeapUsedSize: heapUsage.embedderHeapUsedSize ?? null,
      backingStorageSize: heapUsage.backingStorageSize ?? null,
      perfUsedJSHeapSize: pageState.perfMemory?.usedJSHeapSize ?? null,
      perfTotalJSHeapSize: pageState.perfMemory?.totalJSHeapSize ?? null,
      jsHeapSizeLimit: pageState.perfMemory?.jsHeapSizeLimit ?? null,
    },
    dom: {
      documents: domCounters.documents ?? namedMetrics.Documents ?? null,
      frames: namedMetrics.Frames ?? null,
      nodes: domCounters.nodes ?? namedMetrics.Nodes ?? null,
      jsEventListeners:
        domCounters.jsEventListeners ?? namedMetrics.JSEventListeners ?? null,
    },
  }
}

/**
 * Convert raw response observations into stable local/external resource lists.
 */
async function summarizeResponses({
  extensionDir,
  extensionOrigin = null,
  responses,
}) {
  const localResourcesByPath = new Map()
  const externalResourcesByUrl = new Map()

  for (const response of responses) {
    if (extensionOrigin && response.url.startsWith(extensionOrigin)) {
      const parsed = new URL(response.url)
      const relativePath = `${parsed.pathname.slice(1)}${parsed.search}`

      if (!localResourcesByPath.has(relativePath)) {
        localResourcesByPath.set(relativePath, {
          path: relativePath,
          normalizedPath: normalizeLocalResourceName(parsed.pathname.slice(1)),
          resourceType: response.resourceType,
          status: response.status,
          sizeBytes: await getLocalAssetSize(
            extensionDir,
            parsed.pathname.slice(1),
          ),
        })
      }
      continue
    }

    if (response.url.startsWith("data:")) {
      continue
    }

    if (!externalResourcesByUrl.has(response.url)) {
      externalResourcesByUrl.set(response.url, {
        url: response.url,
        normalizedUrl: normalizeExternalUrl(response.url),
        resourceType: response.resourceType,
        status: response.status,
      })
    }
  }

  const local = Array.from(localResourcesByPath.values()).sort((left, right) =>
    left.path.localeCompare(right.path),
  )
  const external = Array.from(externalResourcesByUrl.values()).sort(
    (left, right) => left.url.localeCompare(right.url),
  )

  return {
    localCount: local.length,
    externalCount: external.length,
    startupJsBytes: local
      .filter((resource) => resource.resourceType === "script")
      .reduce((total, resource) => total + (resource.sizeBytes ?? 0), 0),
    startupCssBytes: local
      .filter((resource) => resource.resourceType === "stylesheet")
      .reduce((total, resource) => total + (resource.sizeBytes ?? 0), 0),
    local,
    external,
  }
}

/**
 * Wait until an extension page's app shell is present and its DOM stops changing.
 */
async function waitForStableExtensionPageState(page, pagePath) {
  const appShellSelector =
    APP_SHELL_SELECTOR_BY_PAGE_PATH[pagePath] ?? "#root > *"
  const readySelector = READY_SELECTOR_BY_PAGE_PATH[pagePath] ?? null

  await page.waitForSelector(appShellSelector, { timeout: 30_000 })

  let previousSignature = null
  let stableIterations = 0
  const deadline = Date.now() + STABLE_PAGE_MAX_WAIT_MS

  while (Date.now() < deadline) {
    const signature = await page.evaluate(
      ({ readySelector }) => {
        const rootHtmlLength =
          document.getElementById("root")?.innerHTML.length ?? 0
        const nodeCount = document.getElementsByTagName("*").length
        const hasReadySelector = readySelector
          ? !!document.querySelector(readySelector)
          : true

        return {
          rootHtmlLength,
          nodeCount,
          hasReadySelector,
        }
      },
      { readySelector },
    )

    const isDomStable =
      previousSignature &&
      previousSignature.rootHtmlLength === signature.rootHtmlLength &&
      previousSignature.nodeCount === signature.nodeCount

    const isReadyAndStable = readySelector
      ? signature.hasReadySelector &&
        previousSignature?.hasReadySelector &&
        isDomStable
      : isDomStable

    if (isReadyAndStable) {
      stableIterations += 1
      if (stableIterations >= 2) {
        return
      }
    } else if (signature.hasReadySelector) {
      stableIterations = 1
    } else {
      stableIterations = 0
    }

    previousSignature = signature
    await page.waitForTimeout(STABLE_PAGE_POLL_MS)
  }

  await page.waitForTimeout(EXTENSION_PAGE_WAIT_MS)
}

/**
 * Capture an extension page snapshot in a fresh context.
 */
async function collectExtensionPageSnapshot({ extensionDir, pagePath }) {
  return await withTempProfile(
    "all-api-hub-memory-ext-",
    async (profileDir) => {
      const { context, extensionId } = await launchExtensionContext(
        profileDir,
        extensionDir,
      )

      try {
        const browserVersion = context.browser()?.version() ?? "unknown"
        const pageUrl = `chrome-extension://${extensionId}/${pagePath}`
        const page = await context.newPage()
        const responseCollector = createResponseCollector(page)

        try {
          await page.goto(pageUrl, { waitUntil: "networkidle" })
          await waitForStableExtensionPageState(page, pagePath)

          const metrics = await capturePageMetrics(context, page)
          const resources = await summarizeResponses({
            extensionDir,
            extensionOrigin: `chrome-extension://${extensionId}/`,
            responses: responseCollector.getResponses(),
          })

          return {
            browserVersion,
            extensionId,
            pagePath,
            url: pageUrl,
            title: metrics.title,
            memory: metrics.memory,
            dom: metrics.dom,
            resources,
          }
        } finally {
          responseCollector.dispose()
          await page.close().catch(() => {})
        }
      } finally {
        await context.close().catch(() => {})
      }
    },
  )
}

/**
 * Capture a simple page-level memory snapshot in the given context.
 */
async function collectGenericPageSnapshot({ context, targetUrl, waitMs }) {
  const page = await context.newPage()

  try {
    await page.goto(targetUrl, { waitUntil: "networkidle" })
    await page.waitForTimeout(waitMs)

    const metrics = await capturePageMetrics(context, page)

    return {
      url: targetUrl,
      title: metrics.title,
      memory: metrics.memory,
      dom: metrics.dom,
    }
  } finally {
    await page.close().catch(() => {})
  }
}

/**
 * Capture the plain vs extension-enabled delta on a neutral page.
 */
async function collectContentScriptImpact({ extensionDir, targetUrl }) {
  const plain = await withTempProfile(
    "all-api-hub-memory-plain-",
    async (profileDir) => {
      const context = await launchPlainContext(profileDir)

      try {
        const browserVersion = context.browser()?.version() ?? "unknown"
        const snapshot = await collectGenericPageSnapshot({
          context,
          targetUrl,
          waitMs: NEUTRAL_PAGE_WAIT_MS,
        })

        return {
          browserVersion,
          ...snapshot,
        }
      } finally {
        await context.close().catch(() => {})
      }
    },
  )

  const withExtension = await withTempProfile(
    "all-api-hub-memory-ext-page-",
    async (profileDir) => {
      const { context } = await launchExtensionContext(profileDir, extensionDir)

      try {
        const browserVersion = context.browser()?.version() ?? "unknown"
        const snapshot = await collectGenericPageSnapshot({
          context,
          targetUrl,
          waitMs: NEUTRAL_PAGE_WAIT_MS,
        })

        return {
          browserVersion,
          ...snapshot,
        }
      } finally {
        await context.close().catch(() => {})
      }
    },
  )

  return {
    targetUrl,
    plain,
    withExtension,
    delta: {
      runtimeUsedSize: difference(
        withExtension.memory.runtimeUsedSize,
        plain.memory.runtimeUsedSize,
      ),
      embedderHeapUsedSize: difference(
        withExtension.memory.embedderHeapUsedSize,
        plain.memory.embedderHeapUsedSize,
      ),
      backingStorageSize: difference(
        withExtension.memory.backingStorageSize,
        plain.memory.backingStorageSize,
      ),
      perfUsedJSHeapSize: difference(
        withExtension.memory.perfUsedJSHeapSize,
        plain.memory.perfUsedJSHeapSize,
      ),
      nodes: difference(withExtension.dom.nodes, plain.dom.nodes),
      jsEventListeners: difference(
        withExtension.dom.jsEventListeners,
        plain.dom.jsEventListeners,
      ),
    },
  }
}

/**
 * Write the report payload to disk.
 */
async function writeReport(outputDir, payload) {
  await fs.mkdir(outputDir, { recursive: true })
  const reportPath = path.join(outputDir, "report.json")

  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2), "utf8")
  return reportPath
}

/**
 * Print a short human-readable summary for local iteration.
 */
function printSummary(report, reportPath) {
  console.log("")
  console.log("Extension memory diagnostics summary")
  console.log(`Report: ${reportPath}`)
  console.log(`Browser: Chromium ${report.runtime.browserVersion}`)
  console.log("")
  console.log(
    `Popup runtime heap: ${formatBytes(report.popup.memory.runtimeUsedSize)} | embedder ${formatBytes(report.popup.memory.embedderHeapUsedSize)} | nodes ${report.popup.dom.nodes} | listeners ${report.popup.dom.jsEventListeners}`,
  )
  console.log(
    `Options runtime heap: ${formatBytes(report.options.memory.runtimeUsedSize)} | embedder ${formatBytes(report.options.memory.embedderHeapUsedSize)} | nodes ${report.options.dom.nodes} | listeners ${report.options.dom.jsEventListeners}`,
  )
  console.log(
    `Content script delta (${report.contentScriptImpact.targetUrl}): runtime heap ${formatBytes(report.contentScriptImpact.delta.runtimeUsedSize)} | listeners ${report.contentScriptImpact.delta.jsEventListeners ?? "n/a"} | nodes ${report.contentScriptImpact.delta.nodes ?? "n/a"}`,
  )
  console.log(
    `Built bundles: background ${formatBytes(report.buildArtifacts.backgroundBundleBytes)} | content script ${formatBytes(report.buildArtifacts.contentScriptBundleBytes)}`,
  )
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  await assertBuiltExtensionExists(options.extensionDir)

  const buildArtifacts = await collectBuildArtifacts(options.extensionDir)
  const popup = await collectExtensionPageSnapshot({
    extensionDir: options.extensionDir,
    pagePath: "popup.html",
  })
  const optionsPage = await collectExtensionPageSnapshot({
    extensionDir: options.extensionDir,
    pagePath: "options.html",
  })
  const contentScriptImpact = await collectContentScriptImpact({
    extensionDir: options.extensionDir,
    targetUrl: options.targetUrl,
  })

  const report = {
    generatedAt: new Date().toISOString(),
    extensionDir: options.extensionDir,
    targetUrl: options.targetUrl,
    runtime: {
      browserChannel: "chromium",
      browserVersion:
        popup.browserVersion ||
        optionsPage.browserVersion ||
        contentScriptImpact.withExtension.browserVersion ||
        "unknown",
    },
    buildArtifacts,
    popup,
    options: optionsPage,
    contentScriptImpact,
  }

  const reportPath = await writeReport(options.outputDir, report)
  printSummary(report, reportPath)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
