import type { Page } from "@playwright/test"

// Each Playwright worker owns its module instance, so this mirrors the production
// transport's randomized monotonic sequence without cross-context coordination.
let runtimeMessageIdSeq = Math.floor(Math.random() * 10_000)

/**
 * Sends a typed WebExtension runtime envelope from an extension page.
 */
export async function sendTypedRuntimeMessageFromPage<TResponse>(
  page: Page,
  type: string,
  data?: Record<string, unknown>,
): Promise<TResponse> {
  const id = runtimeMessageIdSeq++
  const timestamp = Date.now()

  return await page.evaluate(
    async ({ id, type, data, timestamp }) => {
      const chromeApi = (globalThis as any).chrome
      const response = await chromeApi.runtime.sendMessage({
        id,
        type,
        data,
        timestamp,
      })

      return response?.res ?? response
    },
    { id, type, data, timestamp },
  )
}
