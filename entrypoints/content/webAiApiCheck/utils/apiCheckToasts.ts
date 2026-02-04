import * as React from "react"
import toast from "react-hot-toast/headless"

import { ensureRedemptionToastUi } from "~/entrypoints/content/redemptionAssist/uiRoot"
import { ApiCheckConfirmToast } from "~/entrypoints/content/webAiApiCheck/components/ApiCheckConfirmToast"

/**
 * Show the top-right confirmation toast used by auto-detect.
 * @returns Resolves `true` when confirmed, `false` when cancelled/dismissed.
 */
export async function showApiCheckConfirmToast(): Promise<boolean> {
  await ensureRedemptionToastUi()

  return new Promise((resolve) => {
    let resolved = false

    const finish = (value: boolean, toastId: string) => {
      if (resolved) return
      resolved = true
      toast.dismiss(toastId)
      resolve(value)
    }

    toast.custom(
      (toastInstance) =>
        React.createElement(ApiCheckConfirmToast, {
          onAction: (action) => finish(action === "confirm", toastInstance.id),
        }),
      {
        duration: Infinity,
      },
    )
  })
}
