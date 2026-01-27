import * as React from "react"
import toast from "react-hot-toast/headless"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ensureRedemptionToastUi } from "~/entrypoints/content/redemptionAssist/uiRoot"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { createLogger } from "~/utils/logger"

import { ShieldBypassPromptToast } from "../components/ShieldBypassPromptToast"

const SHIELD_BYPASS_TOAST_ID = "shield-bypass-helper"

/**
 * Unified logger scoped to shield-bypass toast interactions.
 */
const logger = createLogger("ShieldBypassToasts")

/**
 * Shows (or updates) the shield-bypass helper prompt toast in the content UI root.
 */
export async function showShieldBypassPromptToast() {
  await ensureRedemptionToastUi()

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
