import type { BrowserContext, Worker } from "@playwright/test"

export function runRequestyUiTest(options: {
  context: BrowserContext
  extensionId: string
  serviceWorker: Worker
  /** Optional manage key; enables the saved-account and key CRUD stages. */
  key?: string
  evidenceDir: string
}): Promise<void>

/** A console key the onboarding credential resolved to. */
export type RequestyConsoleKey = { id: string; name: string }

/**
 * True only when the run's own pre-write inventory proves key ownership.
 * @param onboardingKey Key the onboarding credential resolved to.
 * @param preRunConsoleKeyIds Console key ids present before the run, or null.
 * @returns Whether this run created the key and may therefore revoke it.
 */
export function consoleKeyBelongsToRun(
  onboardingKey: RequestyConsoleKey,
  preRunConsoleKeyIds: Set<string> | null,
): boolean
