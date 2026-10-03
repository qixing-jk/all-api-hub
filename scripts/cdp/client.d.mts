import type { Browser, BrowserContext, Worker } from "@playwright/test"

/** Live CDP connection bundle returned by the connect helpers. */
export interface DevExtensionConnection {
  browser: Browser
  context: BrowserContext
  extensionId: string
  serviceWorker: Worker
  close(): Promise<void>
}

/** Resolve the CDP URL at call time (honors `--isolate`). */
export function defaultCdpUrl(): string
export function connectExtensionById(options: {
  cdpUrl?: string
  extensionId: string
}): Promise<DevExtensionConnection>
export function connectDevExtension(options?: {
  cdpUrl?: string
}): Promise<DevExtensionConnection>
