import {
  ExternalCheckInMessageTypes,
  sendExternalCheckInMessage,
} from "~/services/checkin/externalCheckInMessaging"
import {
  startProductAnalyticsAction,
  type ProductAnalyticsActionContext,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnosticsError"
import type { DisplaySiteData } from "~/types"

interface OpenExternalCheckInsOptions {
  openAll?: boolean
  openInNewWindow?: boolean
  analyticsContext?: ProductAnalyticsActionContext
  onSuccess?: (accountsToOpen: DisplaySiteData[]) => void | Promise<void>
  onSkipped?: () => void
  onFailure?: (error: unknown) => void
  onPartialFailure?: (failedCount: number, totalCount: number) => void
}

const runPostOpenSuccessCallback = async (
  callback: OpenExternalCheckInsOptions["onSuccess"],
  accountsToOpen: DisplaySiteData[],
) => {
  try {
    await callback?.(accountsToOpen)
  } catch {
    // A post-open refresh failure must not change the already completed open result.
  }
}

const getOpenableExternalCheckInAccounts = (
  accounts: DisplaySiteData[],
  options?: { openAll?: boolean },
) => {
  const enabledAccounts = accounts.filter((account) => !account.disabled)

  return options?.openAll
    ? enabledAccounts
    : enabledAccounts.filter(
        (account) => !account.checkIn?.customCheckIn?.isCheckedInToday,
      )
}

/**
 * Opens configured external check-in URLs through the background handler and
 * marks them as checked-in after the tabs/windows are opened.
 */
export async function openExternalCheckIns(
  accounts: DisplaySiteData[],
  options?: OpenExternalCheckInsOptions,
) {
  const tracker = options?.analyticsContext
    ? startProductAnalyticsAction(options.analyticsContext)
    : undefined
  let analyticsCompleted = false

  const accountsToOpen = getOpenableExternalCheckInAccounts(accounts, {
    openAll: options?.openAll,
  })

  if (!accountsToOpen.length) {
    analyticsCompleted = true
    tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
    options?.onSkipped?.()
    return {
      openedAccountCount: 0,
      skipped: true,
      partialFailure: false,
      failed: false,
    }
  }

  try {
    const response = await sendExternalCheckInMessage(
      ExternalCheckInMessageTypes.OpenAndMark,
      {
        accountIds: accountsToOpen.map((account) => account.id),
        openInNewWindow: Boolean(options?.openInNewWindow),
      },
    )

    if (!response?.success || !response.data) {
      analyticsCompleted = true
      const failure = buildActionFailureDiagnostics({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.InvalidResponseShape,
        stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Response,
      })
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        diagnostics: { failure },
        errorCategory: failure.category,
      })
      throw new Error(
        response?.success === false ? response.error : "Empty response",
      )
    }

    if (response.data.failedCount > 0) {
      analyticsCompleted = true
      const failure = buildActionFailureDiagnostics({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
        stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      })
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        diagnostics: { failure },
        errorCategory: failure.category,
      })
      options?.onPartialFailure?.(
        response.data.failedCount,
        response.data.totalCount,
      )
      await runPostOpenSuccessCallback(options?.onSuccess, accountsToOpen)
      return {
        openedAccountCount: accountsToOpen.length,
        skipped: false,
        partialFailure: true,
        failed: false,
      }
    }

    analyticsCompleted = true
    tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    await runPostOpenSuccessCallback(options?.onSuccess, accountsToOpen)
  } catch (error) {
    if (!analyticsCompleted) {
      analyticsCompleted = true
      const failure = buildActionFailureDiagnostics({ error })
      tracker?.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        diagnostics: { failure },
        errorCategory: failure.category,
      })
    }
    options?.onFailure?.(error)
    return {
      openedAccountCount: accountsToOpen.length,
      skipped: false,
      partialFailure: false,
      failed: true,
    }
  }

  return {
    openedAccountCount: accountsToOpen.length,
    skipped: false,
    partialFailure: false,
    failed: false,
  }
}
