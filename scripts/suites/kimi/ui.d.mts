import type { BrowserContext, Worker } from "@playwright/test"

export function runKimiUiTest(options: {
  context: BrowserContext
  extensionId: string
  serviceWorker: Worker
  token?: string
  refreshToken?: string
  organizationId?: string
  siteUrl?: string
  siteType?: string
}): Promise<void>
