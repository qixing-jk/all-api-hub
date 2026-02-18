import fs from "node:fs/promises"
import path from "node:path"
import type { BrowserContext } from "@playwright/test"

/**
 * Ensures the built MV3 extension output exists before running E2E.
 */
export async function assertBuiltExtensionExists(
  extensionDir: string,
): Promise<void> {
  const manifestPath = path.join(extensionDir, "manifest.json")

  try {
    await fs.access(manifestPath)
  } catch {
    throw new Error(
      [
        `Missing built extension at '${extensionDir}'.`,
        "Run 'pnpm build' to generate '.output/chrome-mv3/'.",
      ].join(" "),
    )
  }
}

/**
 * Derives the runtime MV3 extension id from the service worker URL.
 */
export async function getExtensionIdFromServiceWorker(
  context: BrowserContext,
  options?: { timeoutMs?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 15_000

  const existing = context.serviceWorkers()[0]
  const serviceWorker =
    existing ??
    (await context.waitForEvent("serviceworker", { timeout: timeoutMs }))

  return new URL(serviceWorker.url()).host
}

/**
 * Reads and parses the built Chromium MV3 manifest.json from the provided extension directory.
 */
export async function getBuiltManifest(
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
