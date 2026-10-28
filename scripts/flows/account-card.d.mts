import type { Page } from "@playwright/test"

export function testAccountCardFlow(options: {
  page: Page
  extensionId: string
  accountName: string
  accountId: string
  timeoutMs?: number
}): Promise<{ ok: true }>
