import { productAnalyticsClient } from "./client"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "./events"
import {
  productAnalyticsState,
  type ProductAnalyticsShieldBypassSummaryPatch,
  type ProductAnalyticsShieldBypassSummaryState,
} from "./state"

/**
 * Formats timestamps into the UTC day bucket used for daily summaries.
 */
function getUtcDay(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

/**
 * Builds an empty shield-bypass daily summary for the given UTC day.
 */
function emptySummary(
  day = getUtcDay(),
): ProductAnalyticsShieldBypassSummaryState {
  return {
    day,
    promptShownCount: 0,
    promptDismissedCount: 0,
    settingsVisitedCount: 0,
    tempWindowFetchSuccessCount: 0,
    tempWindowFetchFailureCount: 0,
    tempWindowTurnstileFetchSuccessCount: 0,
    tempWindowTurnstileFetchFailureCount: 0,
  }
}

/**
 * Checks whether a summary contains any non-zero activity counters.
 */
function hasSummaryActivity(summary: ProductAnalyticsShieldBypassSummaryState) {
  return (
    (summary.promptShownCount ?? 0) > 0 ||
    (summary.promptDismissedCount ?? 0) > 0 ||
    (summary.settingsVisitedCount ?? 0) > 0 ||
    (summary.tempWindowFetchSuccessCount ?? 0) > 0 ||
    (summary.tempWindowFetchFailureCount ?? 0) > 0 ||
    (summary.tempWindowTurnstileFetchSuccessCount ?? 0) > 0 ||
    (summary.tempWindowTurnstileFetchFailureCount ?? 0) > 0
  )
}

/**
 * Converts local counters into privacy-filtered analytics properties.
 */
function buildSummaryProperties(
  summary: ProductAnalyticsShieldBypassSummaryState,
) {
  return {
    feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ShieldBypassAssist,
    surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundShieldBypassTempContext,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    shield_bypass_prompt_shown_count: summary.promptShownCount ?? 0,
    shield_bypass_prompt_dismissed_count: summary.promptDismissedCount ?? 0,
    shield_bypass_settings_visited_count: summary.settingsVisitedCount ?? 0,
    temp_window_fetch_success_count: summary.tempWindowFetchSuccessCount ?? 0,
    temp_window_fetch_failure_count: summary.tempWindowFetchFailureCount ?? 0,
    temp_window_turnstile_fetch_success_count:
      summary.tempWindowTurnstileFetchSuccessCount ?? 0,
    temp_window_turnstile_fetch_failure_count:
      summary.tempWindowTurnstileFetchFailureCount ?? 0,
  }
}

/**
 * Persists a partial counter increment for the current shield-bypass day.
 */
async function incrementShieldBypassSummary(
  patch: ProductAnalyticsShieldBypassSummaryPatch,
) {
  await productAnalyticsState.incrementShieldBypassSummary(patch)
}

/**
 * Records that the shield-bypass prompt was shown locally.
 */
export async function recordShieldBypassPromptShown() {
  await incrementShieldBypassSummary({ promptShownCount: 1 })
}

/**
 * Records that the shield-bypass prompt was dismissed locally.
 */
export async function recordShieldBypassPromptDismissed() {
  await incrementShieldBypassSummary({ promptDismissedCount: 1 })
}

/**
 * Records that the user opened shield-bypass settings from the prompt.
 */
export async function recordShieldBypassSettingsVisited() {
  await incrementShieldBypassSummary({ settingsVisitedCount: 1 })
}

/**
 * Records the temp-window fetch outcome used by shield-bypass analysis.
 */
export async function recordShieldBypassTempWindowFetchResult(
  result:
    | typeof PRODUCT_ANALYTICS_RESULTS.Success
    | typeof PRODUCT_ANALYTICS_RESULTS.Failure,
) {
  await incrementShieldBypassSummary(
    result === PRODUCT_ANALYTICS_RESULTS.Success
      ? { tempWindowFetchSuccessCount: 1 }
      : { tempWindowFetchFailureCount: 1 },
  )
}

/**
 * Records the Turnstile temp-window fetch outcome used by shield-bypass analysis.
 */
export async function recordShieldBypassTempWindowTurnstileFetchResult(
  result:
    | typeof PRODUCT_ANALYTICS_RESULTS.Success
    | typeof PRODUCT_ANALYTICS_RESULTS.Failure,
) {
  await incrementShieldBypassSummary(
    result === PRODUCT_ANALYTICS_RESULTS.Success
      ? { tempWindowTurnstileFetchSuccessCount: 1 }
      : { tempWindowTurnstileFetchFailureCount: 1 },
  )
}

/**
 * Sends the previous UTC day's shield-bypass summary when it has activity.
 */
export async function flushShieldBypassDailySummary(): Promise<boolean> {
  const summary = await productAnalyticsState.getShieldBypassSummaryState()
  const today = getUtcDay()

  if (!summary.day || summary.day === today || !hasSummaryActivity(summary)) {
    return false
  }

  const captured = await productAnalyticsClient.capture(
    PRODUCT_ANALYTICS_EVENTS.ShieldBypassSummaryCaptured,
    buildSummaryProperties(summary),
  )
  if (!captured) return false

  await productAnalyticsState.replaceShieldBypassSummaryState(
    emptySummary(today),
  )
  return true
}
