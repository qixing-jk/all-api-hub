import toast from "react-hot-toast/headless"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ensureRedemptionToastUi } from "~/entrypoints/content/shared/uiRoot"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ApiCheckToasts")

let apiCheckToastModulesPromise: Promise<{
  createElement: typeof import("react").createElement
  ApiCheckConfirmToast: typeof import("~/entrypoints/content/webAiApiCheck/components/ApiCheckConfirmToast").ApiCheckConfirmToast
}> | null = null

/**
 * Load the API-check toast component tree only when auto-detect needs to prompt.
 */
async function loadApiCheckToastModules() {
  if (!apiCheckToastModulesPromise) {
    apiCheckToastModulesPromise = Promise.all([
      import("react"),
      import(
        "~/entrypoints/content/webAiApiCheck/components/ApiCheckConfirmToast"
      ),
    ]).then(([reactModule, confirmToastModule]) => ({
      createElement: reactModule.createElement,
      ApiCheckConfirmToast: confirmToastModule.ApiCheckConfirmToast,
    }))
  }

  return apiCheckToastModulesPromise
}

/**
 * Show the top-right confirmation toast used by auto-detect.
 * @returns Resolves `true` when confirmed, `false` when cancelled/dismissed.
 */
export async function showApiCheckConfirmToast(options?: {
  usesEnhancedResult?: boolean
}): Promise<boolean> {
  await ensureRedemptionToastUi()
  const { createElement, ApiCheckConfirmToast } =
    await loadApiCheckToastModules()

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
        createElement(ApiCheckConfirmToast, {
          onAction: (action) => {
            if (action === "settings") {
              void sendRuntimeMessage({
                action: RuntimeActionIds.OpenSettingsWebAiApiCheck,
              }).catch((error) => {
                logger.error(
                  "Failed to open Web AI API Check settings page",
                  error,
                )
              })
              return
            }
            if (action === "feedback") {
              void sendRuntimeMessage({
                action: RuntimeActionIds.OpenFeedbackBugReport,
              }).catch((error) => {
                logger.error(
                  "Failed to open Web AI API Check feedback page",
                  error,
                )
              })
              return
            }
            finish(action === "confirm", toastInstance.id)
          },
          usesEnhancedResult: !!options?.usesEnhancedResult,
        }),
      {
        duration: Infinity,
      },
    )
  })
}
