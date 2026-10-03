import type { BrowserContext, Worker } from "@playwright/test"

export function runGrsaiUiTest(options: {
  context: BrowserContext
  extensionId: string
  serviceWorker: Worker
  siteUrl?: string
  /** Real console session token; enables the signed key CRUD round trip. */
  token?: string
}): Promise<void>