import type { Page } from "@playwright/test"

/**
 * Sends a typed WebExtension runtime envelope from an extension page.
 */
export async function sendTypedRuntimeMessageFromPage<TResponse>(
  page: Page,
  type: string,
  data?: Record<string, unknown>,
): Promise<TResponse> {
  return await page.evaluate(
    async ({ type, data }) => {
      const chromeApi = (globalThis as any).chrome
      const response = await chromeApi.runtime.sendMessage({
        id: Date.now(),
        type,
        data,
        timestamp: Date.now(),
      })

      return response?.res ?? response
    },
    { type, data },
  )
}
