import type { BrowserContext, Page } from "@playwright/test"

/** Dismisses dialogs through application controls without removing their DOM. */
export function dismissModals(page: Page): Promise<void>

/** Opens an extension route in a new page. */
export function openExtensionPage(options: {
  context: BrowserContext
  extensionId: string
  route?: string
  autoDismissModals?: boolean
}): Promise<Page>
