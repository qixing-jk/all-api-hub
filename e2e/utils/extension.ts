import fs from "node:fs/promises"
import path from "node:path"
import type { BrowserContext, Worker } from "@playwright/test"

import { assertE2eBuildMetadataCurrent } from "~~/e2e/utils/e2eBuildMetadata"

const verifiedExtensionDirs = new Set<string>()
const extensionServiceWorkerProtocols = new Set([
  "chrome-extension:",
  "moz-extension:",
])

type ExtensionServiceWorkerOptions = {
  extensionId?: string
  timeoutMs?: number
}

type ExtensionServiceWorkerProbe = {
  hasAlarms: boolean
  hasRuntimeGetManifest: boolean
  hasStorageLocal: boolean
  runtimeId: string | null
}

/**
 * Checks whether a Playwright worker URL belongs to a browser extension.
 */
export function isExtensionServiceWorkerUrl(workerUrl: string): boolean {
  try {
    return extensionServiceWorkerProtocols.has(new URL(workerUrl).protocol)
  } catch {
    return false
  }
}

async function probeExtensionServiceWorker(
  worker: Worker,
): Promise<ExtensionServiceWorkerProbe> {
  return await worker.evaluate(() => {
    const chromeApi = (
      globalThis as typeof globalThis & { chrome?: typeof chrome }
    ).chrome

    return {
      hasAlarms: typeof chromeApi?.alarms?.clear === "function",
      hasRuntimeGetManifest:
        typeof chromeApi?.runtime?.getManifest === "function",
      hasStorageLocal: typeof chromeApi?.storage?.local?.get === "function",
      runtimeId: chromeApi?.runtime?.id ?? null,
    }
  })
}

async function describeServiceWorkerReadiness(
  worker: Worker,
  expectedExtensionId?: string,
): Promise<{ reason: string; ready: boolean }> {
  const workerUrl = worker.url()

  if (!isExtensionServiceWorkerUrl(workerUrl)) {
    return { ready: false, reason: "not an extension service worker" }
  }

  const workerExtensionId = new URL(workerUrl).host
  if (expectedExtensionId && workerExtensionId !== expectedExtensionId) {
    return {
      ready: false,
      reason: `extension id ${workerExtensionId} did not match ${expectedExtensionId}`,
    }
  }

  try {
    const probe = await probeExtensionServiceWorker(worker)
    const missingApis = [
      probe.runtimeId ? null : "chrome.runtime.id",
      probe.hasRuntimeGetManifest ? null : "chrome.runtime.getManifest",
      probe.hasStorageLocal ? null : "chrome.storage.local",
      probe.hasAlarms ? null : "chrome.alarms",
    ].filter((api): api is string => Boolean(api))

    if (missingApis.length > 0) {
      return {
        ready: false,
        reason: `missing ${missingApis.join(", ")}`,
      }
    }

    return { ready: true, reason: "ready" }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ready: false, reason: `probe failed: ${message}` }
  }
}

/**
 * Resolve the production MV3 service worker and wait until Chrome has attached
 * the extension APIs used by the E2E storage/alarm helpers.
 */
export async function getExtensionServiceWorker(
  context: BrowserContext,
  options: ExtensionServiceWorkerOptions = {},
): Promise<Worker> {
  const timeoutMs = options.timeoutMs ?? 15_000
  const deadline = Date.now() + timeoutMs
  const observedWorkers = new Map<string, string>()

  while (Date.now() <= deadline) {
    for (const worker of context.serviceWorkers()) {
      const readiness = await describeServiceWorkerReadiness(
        worker,
        options.extensionId,
      )
      observedWorkers.set(worker.url(), readiness.reason)

      if (readiness.ready) {
        return worker
      }
    }

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      break
    }

    await context
      .waitForEvent("serviceworker", {
        timeout: Math.min(250, remainingMs),
      })
      .catch(() => undefined)
  }

  const observedSummary =
    [...observedWorkers.entries()]
      .map(([workerUrl, reason]) => `${workerUrl} (${reason})`)
      .join("; ") || "none"

  throw new Error(
    [
      "Timed out waiting for an extension service worker with ready browser APIs.",
      `Observed service workers: ${observedSummary}.`,
    ].join(" "),
  )
}

/**
 * Ensures the built MV3 extension output exists before running E2E.
 */
export async function assertBuiltExtensionExists(
  extensionDir: string,
): Promise<void> {
  if (verifiedExtensionDirs.has(extensionDir)) {
    return
  }

  const manifestPath = path.join(extensionDir, "manifest.json")

  try {
    await fs.access(manifestPath)
  } catch {
    throw new Error(
      [
        `Missing built extension at '${extensionDir}'.`,
        "Run 'pnpm build:e2e' to generate the default E2E extension output.",
      ].join(" "),
    )
  }

  await assertE2eBuildMetadataCurrent(extensionDir)
  verifiedExtensionDirs.add(extensionDir)
}

/**
 * Derives the runtime MV3 extension id from the service worker URL.
 */
export async function getExtensionIdFromServiceWorker(
  context: BrowserContext,
  options?: { timeoutMs?: number },
): Promise<string> {
  const serviceWorker = await getExtensionServiceWorker(context, options)
  return new URL(serviceWorker.url()).host
}

/**
 * Reads and parses the built Chromium MV3 manifest.json from the provided extension directory.
 */
async function getBuiltManifest(
  extensionDir: string,
): Promise<Record<string, unknown>> {
  const manifestPath = path.join(extensionDir, "manifest.json")
  const raw = await fs.readFile(manifestPath, "utf8")

  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to parse manifest.json at '${manifestPath}': ${errorMessage}`,
    )
  }
}

/**
 * Returns the sidepanel html path from the built manifest, if present.
 */
export async function getSidePanelPagePath(
  extensionDir: string,
): Promise<string | null> {
  const manifest = await getBuiltManifest(extensionDir)
  const sidePanel =
    (manifest["side_panel"] as Record<string, unknown> | undefined) ??
    (manifest["sidePanel"] as Record<string, unknown> | undefined)

  const defaultPath =
    (sidePanel?.["default_path"] as string | undefined) ??
    (sidePanel?.["defaultPath"] as string | undefined)

  if (!defaultPath || typeof defaultPath !== "string") return null
  return defaultPath.startsWith("/") ? defaultPath.slice(1) : defaultPath
}
