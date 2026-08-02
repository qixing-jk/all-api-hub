import type { TempContextMode } from "~/constants/tempContextMode"
import type {
  ProtectionBypassAutomaticTrigger,
  ProtectionBypassDecisionResult,
  ProtectionBypassDeniedReason,
  ProtectionBypassExecutionKind,
  ProtectionBypassFeature,
  ProtectionBypassOperation,
} from "~/services/protectionBypass/contracts"
import {
  BROWSER_FOCUS_STATES,
  BROWSER_FOCUS_TRANSITIONS,
  type BrowserFocusObservation,
} from "~/utils/browser/browserFocus"

import { productAnalyticsClient } from "./client"
import {
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_PROTECTION_BYPASS_COUNT_PROPERTIES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsProtectionBypassCountProperty,
} from "./contracts"
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
    featureCounts: {},
    invocationKindCounts: {},
    automaticTriggerCounts: {},
    operationCounts: {},
    decisionCounts: {},
    denialReasonCounts: {},
    adapterCounts: {},
    focusStartCounts: {},
    focusEndCounts: {},
    focusTransitionCounts: {},
    focusBackgroundStartAdapterCounts: {},
    focusForegroundActivationAdapterCounts: {},
    focusUnknownAdapterCounts: {},
  }
}

/**
 * Checks whether a summary contains any non-zero activity counters.
 */
function hasSummaryActivity(summary: ProductAnalyticsShieldBypassSummaryState) {
  const hasPolicyDecisionActivity = [
    summary.featureCounts,
    summary.invocationKindCounts,
    summary.automaticTriggerCounts,
    summary.operationCounts,
    summary.decisionCounts,
    summary.denialReasonCounts,
    summary.adapterCounts,
    summary.focusStartCounts,
    summary.focusEndCounts,
    summary.focusTransitionCounts,
    summary.focusBackgroundStartAdapterCounts,
    summary.focusForegroundActivationAdapterCounts,
    summary.focusUnknownAdapterCounts,
  ].some((counts) =>
    Object.values(counts ?? {}).some((count) => (count ?? 0) > 0),
  )
  return (
    (summary.promptShownCount ?? 0) > 0 ||
    (summary.promptDismissedCount ?? 0) > 0 ||
    (summary.settingsVisitedCount ?? 0) > 0 ||
    (summary.tempWindowFetchSuccessCount ?? 0) > 0 ||
    (summary.tempWindowFetchFailureCount ?? 0) > 0 ||
    (summary.tempWindowTurnstileFetchSuccessCount ?? 0) > 0 ||
    (summary.tempWindowTurnstileFetchFailureCount ?? 0) > 0 ||
    hasPolicyDecisionActivity
  )
}

const PROTECTION_BYPASS_COUNT_PROPERTY_SET = new Set<string>(
  PRODUCT_ANALYTICS_PROTECTION_BYPASS_COUNT_PROPERTIES,
)

/** Flattens controlled counter maps into the event's fixed scalar properties. */
function buildProtectionBypassCountProperties(
  summary: ProductAnalyticsShieldBypassSummaryState,
): Partial<Record<ProductAnalyticsProtectionBypassCountProperty, number>> {
  const properties: Partial<
    Record<ProductAnalyticsProtectionBypassCountProperty, number>
  > = {}
  const dimensions = [
    ["feature", summary.featureCounts],
    ["invocation", summary.invocationKindCounts],
    ["trigger", summary.automaticTriggerCounts],
    ["operation", summary.operationCounts],
    ["decision", summary.decisionCounts],
    ["denial", summary.denialReasonCounts],
    ["adapter", summary.adapterCounts],
    ["focus_start", summary.focusStartCounts],
    ["focus_end", summary.focusEndCounts],
    ["focus_transition", summary.focusTransitionCounts],
    [
      "focus_background_start_adapter",
      summary.focusBackgroundStartAdapterCounts,
    ],
    [
      "focus_foreground_activation_adapter",
      summary.focusForegroundActivationAdapterCounts,
    ],
    ["focus_unknown_adapter", summary.focusUnknownAdapterCounts],
  ] as const

  for (const [dimension, counts] of dimensions) {
    for (const [value, count] of Object.entries(counts ?? {})) {
      const property = `protection_bypass_${dimension}_${value}_count`
      if (!PROTECTION_BYPASS_COUNT_PROPERTY_SET.has(property)) continue
      properties[property as ProductAnalyticsProtectionBypassCountProperty] =
        count
    }
  }
  return properties
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
    ...buildProtectionBypassCountProperties(summary),
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

export type ProtectionBypassDecisionSummary = {
  feature?: ProtectionBypassFeature
  invocationKind: ProtectionBypassExecutionKind
  automaticTrigger?: ProtectionBypassAutomaticTrigger
  operation: ProtectionBypassOperation
  decision: ProtectionBypassDecisionResult
  denialReason?: ProtectionBypassDeniedReason
  adapter?: TempContextMode
}

/** Records only controlled marginal dimensions for one final policy decision. */
export async function recordProtectionBypassDecision(
  summary: ProtectionBypassDecisionSummary,
) {
  await incrementShieldBypassSummary({
    featureCounts: { [summary.feature ?? "other"]: 1 },
    invocationKindCounts: { [summary.invocationKind]: 1 },
    ...(summary.automaticTrigger
      ? { automaticTriggerCounts: { [summary.automaticTrigger]: 1 } }
      : {}),
    operationCounts: { [summary.operation]: 1 },
    decisionCounts: { [summary.decision]: 1 },
    ...(summary.denialReason
      ? { denialReasonCounts: { [summary.denialReason]: 1 } }
      : {}),
    ...(summary.adapter ? { adapterCounts: { [summary.adapter]: 1 } } : {}),
  })
}

/** Records one bounded focus observation as controlled daily counters only. */
export async function recordShieldBypassFocusObservation(params: {
  observation: BrowserFocusObservation
  adapter: TempContextMode
}) {
  const { observation, adapter } = params
  const foregroundActivationObserved =
    observation.start === BROWSER_FOCUS_STATES.Unfocused &&
    (observation.transition === BROWSER_FOCUS_TRANSITIONS.Foregrounded ||
      observation.transition === BROWSER_FOCUS_TRANSITIONS.Mixed ||
      observation.end === BROWSER_FOCUS_STATES.Focused)
  const incomplete =
    observation.start === BROWSER_FOCUS_STATES.Unknown ||
    observation.end === BROWSER_FOCUS_STATES.Unknown ||
    observation.transition === BROWSER_FOCUS_TRANSITIONS.Unknown

  await incrementShieldBypassSummary({
    focusStartCounts: { [observation.start]: 1 },
    focusEndCounts: { [observation.end]: 1 },
    focusTransitionCounts: { [observation.transition]: 1 },
    ...(observation.start === BROWSER_FOCUS_STATES.Unfocused
      ? { focusBackgroundStartAdapterCounts: { [adapter]: 1 } }
      : {}),
    ...(foregroundActivationObserved
      ? { focusForegroundActivationAdapterCounts: { [adapter]: 1 } }
      : {}),
    ...(incomplete ? { focusUnknownAdapterCounts: { [adapter]: 1 } } : {}),
  })
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
