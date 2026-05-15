import toast from "react-hot-toast/headless"

import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type { DisplaySiteData } from "~/types"

import { ensureRedemptionToastUi } from "../../shared/uiRoot"
import type { RedemptionBatchResultItem } from "../components/RedemptionBatchResultToast"
import {
  type RedemptionPromptCodeItem,
  type RedemptionPromptResult,
} from "../components/RedemptionPromptToast"

let redemptionToastModulesPromise: Promise<{
  createElement: typeof import("react").createElement
  RedemptionAccountSelectToast: typeof import("../components/RedemptionAccountSelectToast").RedemptionAccountSelectToast
  RedemptionBatchResultToast: typeof import("../components/RedemptionBatchResultToast").RedemptionBatchResultToast
  RedemptionLoadingToast: typeof import("../components/RedemptionLoadingToast").RedemptionLoadingToast
  RedemptionPromptToast: typeof import("../components/RedemptionPromptToast").RedemptionPromptToast
}> | null = null

/**
 * Defer the redemption toast React tree until a toast is actually shown.
 */
async function loadRedemptionToastModules() {
  if (!redemptionToastModulesPromise) {
    redemptionToastModulesPromise = Promise.all([
      import("react"),
      import("../components/RedemptionAccountSelectToast"),
      import("../components/RedemptionBatchResultToast"),
      import("../components/RedemptionLoadingToast"),
      import("../components/RedemptionPromptToast"),
    ]).then(
      ([
        reactModule,
        accountSelectModule,
        batchResultModule,
        loadingModule,
        promptModule,
      ]) => ({
        createElement: reactModule.createElement,
        RedemptionAccountSelectToast:
          accountSelectModule.RedemptionAccountSelectToast,
        RedemptionBatchResultToast:
          batchResultModule.RedemptionBatchResultToast,
        RedemptionLoadingToast: loadingModule.RedemptionLoadingToast,
        RedemptionPromptToast: promptModule.RedemptionPromptToast,
      }),
    )
  }

  return redemptionToastModulesPromise
}

/**
 * Shows an indefinite loading toast while auto-redeem runs.
 * @param message Loading copy for the toast body.
 * @returns Toast ID for later dismissal.
 */
export async function showRedeemLoadingToast(message: string) {
  await ensureRedemptionToastUi()
  const { createElement, RedemptionLoadingToast } =
    await loadRedemptionToastModules()
  return toast.custom(
    () => createElement(RedemptionLoadingToast, { message }),
    {
      duration: Infinity,
    },
  )
}

/**
 * Wrapper around react-hot-toast dismiss to avoid direct dependency elsewhere.
 * @param toastId Optional toast identifier.
 */
export function dismissToast(toastId?: string) {
  toast.dismiss(toastId)
}

/**
 * Prompts user to select an account when multiple candidates exist.
 * @param accounts Candidate account list.
 * @param options Optional overrides container.
 * @param options.title Custom heading for the toast.
 * @param options.message Supplemental body copy for the toast.
 * @returns Selected account or null when cancelled.
 */
export async function showAccountSelectToast(
  accounts: DisplaySiteData[],
  options?: { title?: string; message?: string },
): Promise<DisplaySiteData | null> {
  await ensureRedemptionToastUi()
  const { createElement, RedemptionAccountSelectToast } =
    await loadRedemptionToastModules()

  void trackProductAnalyticsActionCompleted({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShowRedemptionAccountSelect,
    surfaceId:
      PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionAccountSelectToast,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    result: PRODUCT_ANALYTICS_RESULTS.Success,
    insights: {
      itemCount: accounts.length,
    },
  })

  return new Promise((resolve) => {
    let resolved = false

    const handleResolve = (
      account: DisplaySiteData | null,
      toastId: string,
    ) => {
      if (resolved) return
      resolved = true
      toast.dismiss(toastId)
      resolve(account)
    }

    toast.custom(
      (toastInstance) => {
        const toastId = toastInstance.id
        return createElement(RedemptionAccountSelectToast, {
          title: options?.title,
          message: options?.message,
          accounts,
          onSelect: (account: DisplaySiteData | null) =>
            handleResolve(account, toastId),
        })
      },
      {
        // Keep the account select toast on screen until user confirms or cancels
        duration: Infinity,
      },
    )
  })
}

/**
 * Renders prompt toast asking user whether to auto redeem.
 * @param message Prompt copy.
 * @returns Action user chose (auto/manual/cancel).
 */
export async function showRedemptionPromptToast(
  message: string,
  codes: RedemptionPromptCodeItem[],
): Promise<RedemptionPromptResult> {
  await ensureRedemptionToastUi()
  const { createElement, RedemptionPromptToast } =
    await loadRedemptionToastModules()

  void trackProductAnalyticsActionCompleted({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShowRedemptionPrompt,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    result: PRODUCT_ANALYTICS_RESULTS.Success,
    insights: {
      itemCount: codes.length,
    },
  })

  return new Promise((resolve) => {
    let resolved = false

    const handleResolve = (result: RedemptionPromptResult, toastId: string) => {
      if (resolved) return
      resolved = true
      toast.dismiss(toastId)
      resolve(result)
    }

    toast.custom((toastInstance) => {
      const toastId = toastInstance.id
      return createElement(RedemptionPromptToast, {
        message,
        codes,
        onAction: (result: RedemptionPromptResult) =>
          handleResolve(result, toastId),
      })
    })
  })
}

/**
 * Displays success/error result toast after redeem completes.
 * @param success Whether operation succeeded.
 * @param message Message to show (no trailing period per UI rules).
 */
export async function showRedeemResultToast(success: boolean, message: string) {
  if (!message) return

  await ensureRedemptionToastUi()

  if (success) {
    toast.success(message)
  } else {
    toast.error(message)
  }
}

/**
 * Displays a batch redemption result toast with per-item retry controls.
 * @param results Results for each redeemed code (success/failure).
 * @param onRetry Handler to retry a specific code.
 * @returns Toast ID for optional dismissal.
 */
export async function showRedeemBatchResultToast(
  results: RedemptionBatchResultItem[],
  onRetry: (code: string) => Promise<RedemptionBatchResultItem>,
) {
  await ensureRedemptionToastUi()
  const { createElement, RedemptionBatchResultToast } =
    await loadRedemptionToastModules()
  const successCount = results.filter((item) => item.success).length
  const failureCount = results.length - successCount

  void trackProductAnalyticsActionCompleted({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShowRedemptionBatchResult,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionBatchResultToast,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    result: PRODUCT_ANALYTICS_RESULTS.Success,
    insights: {
      itemCount: results.length,
      successCount,
      failureCount,
      skippedCount: 0,
    },
  })

  return toast.custom(
    (toastInstance) =>
      createElement(RedemptionBatchResultToast, {
        results,
        onRetry,
        onClose: () => toast.dismiss(toastInstance.id),
      }),
    {
      duration: Infinity,
    },
  )
}
