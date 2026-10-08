import { startAccountDialogAnalyticsAction } from "~/features/AccountManagement/components/AccountDialog/analytics"
import {
  completePopupCriticalFlow,
  POPUP_CRITICAL_FLOWS,
  startPopupCriticalFlow,
} from "~/services/popupInterruptionHint"
import { PRODUCT_ANALYTICS_ACTION_IDS } from "~/services/productAnalytics/contracts"
import { isExtensionPopup } from "~/utils/browser"

type DetectionTracker = ReturnType<typeof startAccountDialogAnalyticsAction>
export type AccountDetectionAttempt = {
  isCurrent: () => boolean
  acceptNormalization: () => void
  beginDetection: () => DetectionTracker
  withPopup: (
    discover: () => Promise<void>,
    preparationFailed: (error: unknown) => Promise<void>,
    settled: () => void,
  ) => Promise<void>
}

/** Owns admission until provider work, popup cleanup and terminal feedback have unwound. */
export class AccountDetectionAttempts {
  private generation = 0
  private lease: symbol | null = null

  invalidate = () => {
    this.generation += 1
  }

  async run(work: (attempt: AccountDetectionAttempt) => Promise<void>) {
    if (this.lease) return
    const lease = Symbol("account-auto-detect-invocation")
    const generation = ++this.generation
    this.lease = lease
    try {
      await work(this.createAttempt(generation))
    } finally {
      if (this.lease === lease) this.lease = null
    }
  }

  private createAttempt(generation: number): AccountDetectionAttempt {
    let admittedGeneration = generation
    return {
      isCurrent: () => this.generation === admittedGeneration,
      // Accepted provider normalization may invalidate the draft synchronously.
      acceptNormalization: () => {
        admittedGeneration = this.generation
      },
      beginDetection: () =>
        startAccountDialogAnalyticsAction(
          PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect,
        ),
      withPopup: async (
        discover: () => Promise<void>,
        preparationFailed: (error: unknown) => Promise<void>,
        settled: () => void,
      ) => {
        const popup = isExtensionPopup()
        if (popup) {
          try {
            await startPopupCriticalFlow(POPUP_CRITICAL_FLOWS.AccountAutoDetect)
          } catch (error) {
            await preparationFailed(error)
            return
          }
        }
        try {
          await discover()
        } finally {
          if (popup)
            await completePopupCriticalFlow(
              POPUP_CRITICAL_FLOWS.AccountAutoDetect,
            )
          settled()
        }
      },
    }
  }
}
