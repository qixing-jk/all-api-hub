import type { Browser, BrowserContext, Worker } from "@playwright/test"

/** Live CDP connection bundle returned by the connect helpers. */
export interface DevBrowserConnection {
  browser: Browser
  context: BrowserContext
  close(): Promise<void>
}

export interface DevExtensionConnection extends DevBrowserConnection {
  extensionId: string
  serviceWorker: Worker
}

/**
 * Resolve the CDP URL at call time (honors `--isolate`).
 * @returns The configured browser debugging endpoint.
 */
export function defaultCdpUrl(): string
export function connectDevBrowser(options?: {
  cdpUrl?: string
}): Promise<DevBrowserConnection>
export function connectExtensionById(options: {
  cdpUrl?: string
  extensionId: string
}): Promise<DevExtensionConnection>
export function connectDevExtension(options?: {
  cdpUrl?: string
}): Promise<DevExtensionConnection>
