import type { BrowserContext, Locator, Page } from "@playwright/test"

export function deleteManagedSiteChannelRow(
  page: Page,
  row: Locator,
  options?: { timeoutMs?: number },
): Promise<void>

export function readManagedSiteConnectionCopy(): {
  saving: string
  checking: string
  success: string
}

export function readNewManagedSiteConnectionFeedback(
  page: Pick<Page, "waitForTimeout">,
  locator: Pick<Locator, "allTextContents">,
  previousTexts: readonly string[],
  timeoutMs: number,
): Promise<{ text: string; observed: string[] }>

export function managedSiteOptionsPageUrl(
  extensionId: string,
  params?: Record<string, string>,
  hash?: string,
): string
export function openManagedSiteOptionsPage(
  context: BrowserContext,
  extensionId: string,
  route: { params?: Record<string, string>; hash?: string },
): Promise<Page>
