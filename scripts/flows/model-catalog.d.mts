import type { Page } from "@playwright/test"
export function testModelCatalogFlow(options: { page: Page; extensionId: string; accountName: string; accountId: string }): Promise<{ ok: boolean; countLine: string }>
