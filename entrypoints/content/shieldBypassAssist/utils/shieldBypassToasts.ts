import * as React from "react"
import toast from "react-hot-toast/headless"

import { ensureRedemptionToastUi } from "~/entrypoints/content/redemptionAssist/uiRoot"
import { sendRuntimeMessage } from "~/utils/browserApi"

import { ShieldBypassPromptToast } from "../components/ShieldBypassPromptToast"

const SHIELD_BYPASS_TOAST_ID = "shield-bypass-helper"

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
            await sendRuntimeMessage({ action: "openSettings:shieldBypass" })
          } catch (error) {
            console.error(
              "[ShieldBypass][Content] Failed to open settings page:",
              error,
            )
          }
        },
      }),
    { id: SHIELD_BYPASS_TOAST_ID, duration: Infinity },
  )
}
