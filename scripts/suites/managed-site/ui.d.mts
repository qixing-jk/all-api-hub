import type { BrowserContext, Locator, Page } from "@playwright/test"

export function readManagedSiteConnectionCopy(): {
  saving: string
  checking: string
  success: string
}

export function readNewManagedSiteConnectionFeedback(
  page: Page,
  locator: Locator,
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
