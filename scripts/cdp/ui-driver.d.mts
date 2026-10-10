import type { BrowserContext, Page } from "@playwright/test"

/**
 * Dismisses dialogs through application controls without removing their DOM.
 * @param page Extension page containing the dialogs.
 * @returns Resolves after the visible dialogs have been dismissed.
 */
export function dismissModals(page: Page): Promise<void>

/**
 * Opens an extension route in a new page.
 * @param options Browser context, extension identity, and route preferences.
 * @param options.context Connected browser context.
 * @param options.extensionId Extension runtime identifier.
 * @param options.route Optional extension route to open.
 * @param options.autoDismissModals Whether to dismiss initial dialogs.
 * @returns The opened extension page.
 */
export function openExtensionPage(options: {
  context: BrowserContext
  extensionId: string
  route?: string
  autoDismissModals?: boolean
}): Promise<Page>
