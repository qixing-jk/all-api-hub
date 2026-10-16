import * as React from "react"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ensureRedemptionToastUi } from "~/entrypoints/content/shared/uiRoot"
import toast from "~/lib/notify/content"
import { recordShieldBypassPromptShown } from "~/services/productAnalytics/facts/shieldBypassSummary"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { createLogger } from "~/utils/core/logger"

import { ShieldBypassPromptToast } from "../components/ShieldBypassPromptToast"
import { TurnstileManualAssistToast } from "../components/TurnstileManualAssistToast"

const SHIELD_BYPASS_TOAST_ID = "shield-bypass-helper"
const TURNSTILE_MANUAL_ASSIST_TOAST_ID = "turnstile-manual-assist"

/**
 * Unified logger scoped to shield-bypass toast interactions.
 */
const logger = createLogger("ShieldBypassToasts")

/**
 * Shows (or updates) the shield-bypass helper prompt toast in the content UI root.
 */
export async function showShieldBypassPromptToast() {
  await ensureRedemptionToastUi()

  void recordShieldBypassPromptShown()

  toast.custom(
    () =>
      React.createElement(ShieldBypassPromptToast, {
        onDismiss: () => toast.dismiss(SHIELD_BYPASS_TOAST_ID),
        onOpenSettings: async () => {
          try {
            await sendRuntimeMessage({
              action: RuntimeActionIds.OpenSettingsShieldBypass,
            })
          } catch (error) {
            logger.error("Failed to open settings page", error)
          }
        },
      }),
    { id: SHIELD_BYPASS_TOAST_ID, duration: Infinity },
  )
}

/**
 * Asks the user to finish an interactive Turnstile check in the temp window.
 */
export async function showTurnstileManualAssistToast() {
  await ensureRedemptionToastUi()

  toast.custom(
    () =>
      React.createElement(TurnstileManualAssistToast, {
        onDismiss: () => toast.dismiss(TURNSTILE_MANUAL_ASSIST_TOAST_ID),
      }),
    { id: TURNSTILE_MANUAL_ASSIST_TOAST_ID, duration: Infinity },
  )
}
