import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  TURNSTILE_AUTO_ASSIST_MS,
  TURNSTILE_MANUAL_WAIT_MS,
  TURNSTILE_PAGE_API_POLL_MS,
} from "~/constants/turnstile"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"

import type { TurnstileUserAssist } from "./turnstileGuard"

/**
 * Builds the in-page assist hooks for a Turnstile wait.
 * The page API read stays in the background so only an owned temp tab is probed.
 */
export function createTurnstileUserAssist(
  requestId?: string,
): TurnstileUserAssist {
  return {
    autoAttemptMs: TURNSTILE_AUTO_ASSIST_MS,
    manualTimeoutMs: TURNSTILE_MANUAL_WAIT_MS,
    pageTokenIntervalMs: TURNSTILE_PAGE_API_POLL_MS,
    requestAssist: async () => {
      let presented: boolean
      try {
        const response = await sendRuntimeMessage<{ presented?: boolean }>({
          action: RuntimeActionIds.TurnstileRequestUserAssist,
          requestId,
        })
        presented = response?.presented === true
      } catch {
        presented = false
      }
      if (!presented) return false
      // Loaded lazily so content-script UI setup is not pulled into node tests.
      const { showTurnstileManualAssistToast } =
        await import("~/entrypoints/content/shieldBypassAssist/utils/shieldBypassToasts")
      await showTurnstileManualAssistToast()
      return true
    },
    readPageToken: async ({ allowExecute }) => {
      try {
        const response = await sendRuntimeMessage<{
          success?: boolean
          token?: unknown
        }>({
          action: RuntimeActionIds.TurnstileReadPageApi,
          allowExecute,
        })
        if (!response?.success || typeof response.token !== "string")
          return null
        const token = response.token.trim()
        return token || null
      } catch {
        return null
      }
    },
  }
}
