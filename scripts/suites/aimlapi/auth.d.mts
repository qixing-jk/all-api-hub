import type { BrowserContext, Locator, Page, Worker } from "@playwright/test"

export interface AuthOptions {
  context: BrowserContext
  extensionId: string
  serviceWorker: Worker
  siteUrl?: string
  managementKey?: string
  apiKey?: string
}
export interface Credentials {
  primary: string
  regular?: string
}
export function openAimlapiAuthForm(
  options: Pick<AuthOptions, "context" | "extensionId" | "siteUrl">,
): Promise<{
  page: Page
  dialog: Locator
  primary: Locator
  regular: Locator
  save: Locator
}>
export function checkAimlapiRejectedCredential(
  options: AuthOptions,
  credentials: Credentials & { message: string },
): Promise<void>
export function checkAimlapiSavedCredentials(
  options: AuthOptions,
  credentials: Credentials & { replacements?: Credentials[] },
): Promise<void>
export function runAimlapiAuthMatrix(
  options: AuthOptions,
): Promise<{ name: string; status: string; reason?: string }[]>
