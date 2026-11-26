import type { Locator, Page } from "@playwright/test"

export function settleAccountSaveForCleanup(
  page: Page,
  options?: { timeoutMs?: number },
): Promise<void>

export function closeAccountDraft(
  page: Page,
  options?: { timeoutMs?: number },
): Promise<void>

export function assertAccountDetectionOutcome(options: {
  page: Page
  expectedType: string
  fields: Partial<
    Record<
      | "siteUrlInput"
      | "userIdInput"
      | "usernameInput"
      | "accessTokenInput"
      | "siteNameInput"
      | "exchangeRateInput",
      string
    >
  >
  saveState: "absent" | "disabled" | "enabled" | "validates-access-token"
  guidance?: string | RegExp
  timeoutMs?: number
}): Promise<Locator>

export function openAccountAddDialog(options: {
  page: Page
  targetUrl: string
  timeoutMs?: number
}): Promise<Locator>
export function detectAccountSiteType(options: {
  page: Page
  expectedType: string
  timeoutMs?: number
}): Promise<Locator>
export function testAutoDetectFlow(options: {
  page: Page
  targetUrl: string
  expectedType: string
  timeoutMs?: number
}): Promise<{ ok: true; dialogText: string }>
