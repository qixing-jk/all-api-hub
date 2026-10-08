import { type startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { resolveProductAnalyticsErrorCategoryFromProbeResult } from "~/services/productAnalytics/facts/verification"
import {
  API_VERIFICATION_PROBE_STATUSES,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"

type SuiteCompletion = Parameters<
  ReturnType<typeof startProductAnalyticsAction>["complete"]
>
type SuiteReport = { result: SuiteCompletion[0]; details?: SuiteCompletion[1] }

/** Report completed and interrupted suites from the same accepted probe results. */
export function resolveProfileProbeSuiteReport(
  results: readonly ApiVerificationProbeResult[],
  stopped: boolean,
): SuiteReport {
  const successCount = results.filter(
    (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Pass,
  ).length
  const failureCount = results.filter(
    (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
  ).length
  const insights = { itemCount: results.length, successCount, failureCount }
  if (stopped)
    return {
      result: PRODUCT_ANALYTICS_RESULTS.Cancelled,
      details: { insights },
    }
  if (results.length === 0) return { result: PRODUCT_ANALYTICS_RESULTS.Skipped }
  if (failureCount > 0) {
    const errorCategory = results
      .filter(
        (result) => result.status === API_VERIFICATION_PROBE_STATUSES.Fail,
      )
      .map((result) =>
        resolveProductAnalyticsErrorCategoryFromProbeResult(result),
      )
      .find(
        (category) => category !== PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      )
    return {
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      details: {
        errorCategory:
          errorCategory ?? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights,
      },
    }
  }
  if (successCount === 0)
    return { result: PRODUCT_ANALYTICS_RESULTS.Skipped, details: { insights } }
  return { result: PRODUCT_ANALYTICS_RESULTS.Success, details: { insights } }
}
