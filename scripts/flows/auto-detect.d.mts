import type { Locator, Page } from "@playwright/test"

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
      | "siteNameInput",
      string
    >
  >
  saveState: "absent" | "disabled" | "enabled"
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
