import type { Locator, Page } from "@playwright/test"

export function readModelCatalog(options: {
  page: Page
  accountId: string
  timeoutMs?: number
  requirePrices?: boolean
}): Promise<{ names: string[]; modelDisplay: Locator }>

export function testModelCatalogFlow(options: {
  page: Page
  extensionId: string
  accountName: string
  accountId: string
  timeoutMs?: number
  requirePrices?: boolean
}): Promise<{ ok: boolean; countLine: string }>
