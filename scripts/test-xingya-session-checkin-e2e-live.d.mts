import type { BrowserContext, Locator, Page } from "@playwright/test"

export function removeOwnedAccountFromUi(
  context: BrowserContext,
  page: Page | undefined,
  extensionId: string,
  accountName: string,
): Promise<void>

export function verifyDetectedIdentity(
  detected: { username: string; userId: string },
  expected?: { username?: string; userId?: string | number },
): { skipped: boolean; reason: string } | undefined
export function configureAccountLoginFromUi(
  page: Page,
  accountDialog: Locator,
  credentials: { username?: string; password?: string },
): Promise<void>
export function summarizeClaimResponse(
  url: URL,
  body: unknown,
  input: unknown,
  status: number,
): {
  status: number
  success: boolean
  alreadyClaimed: boolean
  powObserved: boolean
}

export function redetectCheckinMethod(
  section: Locator,
  expectedMethod: RegExp,
): Promise<void>
export function refreshAccountFromUi(
  page: Page,
  accountRow: Locator,
  accountName: string,
): Promise<void>
