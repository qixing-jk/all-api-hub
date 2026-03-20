import toast from "react-hot-toast/headless"

import { ensureRedemptionToastUi } from "~/entrypoints/content/shared/uiRoot"

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
export async function showApiCheckConfirmToast(): Promise<boolean> {
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
          onAction: (action) => finish(action === "confirm", toastInstance.id),
        }),
      {
        duration: Infinity,
      },
    )
  })
}
