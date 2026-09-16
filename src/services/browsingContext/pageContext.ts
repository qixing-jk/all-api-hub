import { RuntimeActionIds } from "~/constants/runtimeActions"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { isRecord } from "~/utils/core/object"

export const PAGE_CONTEXT = {
  Ordinary: "ordinary",
  Internal: "internal",
  Unknown: "unknown",
} as const

/** Ask the background to classify this content script's actual sender tab. */
export async function readCurrentPageContext(): Promise<
  (typeof PAGE_CONTEXT)[keyof typeof PAGE_CONTEXT]
> {
  try {
    const response = await sendRuntimeMessage<unknown>(
      { action: RuntimeActionIds.GetSenderPageContext },
      { maxAttempts: 1 },
    )
    if (
      isRecord(response) &&
      response.success === true &&
      (response.pageContext === PAGE_CONTEXT.Ordinary ||
        response.pageContext === PAGE_CONTEXT.Internal)
    ) {
      return response.pageContext
    }
  } catch {
    // An unavailable background is inconclusive, never proof of an ordinary tab.
  }
  return PAGE_CONTEXT.Unknown
}
