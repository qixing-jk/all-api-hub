import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import type { CheckInConfig, CustomCheckInConfig } from "~/types/checkIn"
import type {
  BrowserCheckInAction,
  BrowserCheckInConfig,
  BrowserCheckInIdentityCondition,
  BrowserCheckInSuccessCondition,
} from "~/types/checkinAutomation"
import {
  BROWSER_CHECK_IN_ACTION_KINDS,
  BROWSER_CHECK_IN_DEFAULT_TIMEOUT_MS,
  BROWSER_CHECK_IN_MAX_PATTERN_LENGTH,
  BROWSER_CHECK_IN_MAX_SELECTOR_LENGTH,
  BROWSER_CHECK_IN_MAX_TIMEOUT_MS,
  BROWSER_CHECK_IN_MIN_TIMEOUT_MS,
  isBrowserCheckInAction,
  isBrowserCheckInConfig,
  isBrowserCheckInIdentityCondition,
  isBrowserCheckInSuccessCondition,
  isSafeBrowserCheckInPattern,
  isSafeBrowserCheckInSelector,
} from "~/types/checkinAutomation"
import { isHttpUrl } from "~/utils/core/urlParsing"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value)

/** Normalizes a bounded CSS selector from persisted user configuration. */
const normalizeSelector = (value: unknown): string | undefined => {
  if (!isSafeBrowserCheckInSelector(value)) return undefined
  return value.trim().slice(0, BROWSER_CHECK_IN_MAX_SELECTOR_LENGTH)
}

/** Normalizes a bounded regular-expression pattern from persisted configuration. */
const normalizePattern = (value: unknown): string | undefined => {
  if (!isSafeBrowserCheckInPattern(value)) return undefined
  return value.trim().slice(0, BROWSER_CHECK_IN_MAX_PATTERN_LENGTH)
}

/** Normalizes the one permitted declarative browser action. */
const normalizeAction = (value: unknown): BrowserCheckInAction | undefined => {
  if (!isRecord(value)) return undefined

  if (value.kind === BROWSER_CHECK_IN_ACTION_KINDS.PageLoad) {
    return { kind: BROWSER_CHECK_IN_ACTION_KINDS.PageLoad }
  }
  if (value.kind === BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector) {
    const selector = normalizeSelector(value.selector)
    return selector
      ? { kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickSelector, selector }
      : undefined
  }
  if (value.kind === BROWSER_CHECK_IN_ACTION_KINDS.ClickText) {
    const textPattern = normalizePattern(value.textPattern)
    const candidateSelector = normalizeSelector(value.candidateSelector)
    // A supplied selector that cannot be used must not be silently dropped, which
    // would widen the click to the default candidate set.
    const candidateSelectorIsUsable =
      value.candidateSelector === undefined || !!candidateSelector
    return textPattern && candidateSelectorIsUsable
      ? {
          kind: BROWSER_CHECK_IN_ACTION_KINDS.ClickText,
          textPattern,
          ...(candidateSelector ? { candidateSelector } : {}),
        }
      : undefined
  }
  return undefined
}

/** Keeps only valid success evidence fields from persisted configuration. */
const normalizeSuccessCondition = (
  value: unknown,
): BrowserCheckInSuccessCondition => {
  if (!isRecord(value)) return {}

  const selector = normalizeSelector(value.selector)
  const textPattern = normalizePattern(value.textPattern)
  const urlPattern = normalizePattern(value.urlPattern)
  return {
    ...(selector ? { selector } : {}),
    ...(textPattern ? { textPattern } : {}),
    ...(urlPattern ? { urlPattern } : {}),
  }
}

/** Normalizes the optional identity guard used before a browser action. */
const normalizeIdentityCondition = (
  value: unknown,
): BrowserCheckInIdentityCondition | undefined => {
  if (!isRecord(value)) return undefined

  const selector = normalizeSelector(value.selector)
  const textPattern = normalizePattern(value.textPattern)
  return selector && textPattern ? { selector, textPattern } : undefined
}

/** Bounds a persisted browser wait timeout to the supported execution window. */
const normalizeTimeoutMs = (value: unknown): number | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.min(
    BROWSER_CHECK_IN_MAX_TIMEOUT_MS,
    Math.max(BROWSER_CHECK_IN_MIN_TIMEOUT_MS, Math.round(value)),
  )
}

/** Normalizes persisted browser-action settings and drops executable unknown fields. */
export function normalizeBrowserCheckInConfig(
  value: unknown,
): BrowserCheckInConfig | undefined {
  if (!isRecord(value)) return undefined

  const action = normalizeAction(value.action)
  const success = normalizeSuccessCondition(value.success)
  const identity = normalizeIdentityCondition(value.identity)
  const timeoutMs = normalizeTimeoutMs(value.timeoutMs)
  // A supplied guard that cannot be used must not be dropped: the page treats a
  // missing identity as satisfied, so the action would run unguarded.
  const identityIsUsable = value.identity === undefined || !!identity
  const enabled =
    value.enabled === true &&
    !!action &&
    identityIsUsable &&
    isBrowserCheckInSuccessCondition(success)

  return {
    enabled,
    action: action ?? { kind: BROWSER_CHECK_IN_ACTION_KINDS.PageLoad },
    success,
    ...(identity ? { identity } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  }
}

/** Returns whether the custom URL and its browser-action contract are executable. */
export function isBrowserAutomationCheckInConfigured(
  customCheckIn: CustomCheckInConfig | undefined,
): boolean {
  return (
    !!customCheckIn &&
    isHttpUrl(customCheckIn.url) &&
    isBrowserCheckInConfig(customCheckIn.browserAutomation) &&
    customCheckIn.browserAutomation.enabled
  )
}

/**
 * Treats a valid user-supplied browser contract as a local method registration.
 * The page success condition remains the only execution proof; this state only
 * lets the selection model expose the configured method without a network probe.
 */
export function ensureBrowserAutomationMethodState(
  config: CheckInConfig,
): CheckInConfig {
  if (!isBrowserAutomationCheckInConfigured(config.customCheckIn)) {
    return config
  }

  const methodId = AUTO_CHECKIN_METHOD_IDS.BrowserAutomationDailyCheckIn
  const methods = Object.assign(
    Object.create(null),
    config.methodKnowledge.methods,
  ) as CheckInConfig["methodKnowledge"]["methods"]
  const previous = methods[methodId]
  if (!previous || previous.detection.outcome !== "matched") {
    methods[methodId] = {
      detection: {
        outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
        evidence: {
          source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.UserConfiguration,
        },
      },
      ...(previous?.status ? { status: previous.status } : {}),
    }
  }

  if (
    config.selection.mode === CHECK_IN_SELECTION_MODES.Automatic &&
    !config.selection.methodId
  ) {
    const hasOtherMatchedMethod = Object.entries(methods).some(
      ([candidateId, knowledge]) =>
        candidateId !== methodId && knowledge?.detection.outcome === "matched",
    )
    const hasOtherUnknownMethod = Object.entries(methods).some(
      ([candidateId, knowledge]) =>
        candidateId !== methodId &&
        knowledge?.detection.outcome !== "matched" &&
        knowledge?.detection.outcome !== "unsupported",
    )
    if (!hasOtherMatchedMethod && !hasOtherUnknownMethod) {
      return {
        ...config,
        methodKnowledge: { ...config.methodKnowledge, methods },
        selection: {
          mode: CHECK_IN_SELECTION_MODES.Automatic,
          methodId,
        },
      }
    }
  }

  return {
    ...config,
    methodKnowledge: { ...config.methodKnowledge, methods },
  }
}

/** Removes the configured method after persisted settings are disabled or invalid. */
export function syncBrowserAutomationMethodState(
  config: CheckInConfig,
): CheckInConfig {
  if (isBrowserAutomationCheckInConfigured(config.customCheckIn)) {
    return ensureBrowserAutomationMethodState(config)
  }

  const methodId = AUTO_CHECKIN_METHOD_IDS.BrowserAutomationDailyCheckIn
  const methods = Object.assign(
    Object.create(null),
    config.methodKnowledge.methods,
  ) as CheckInConfig["methodKnowledge"]["methods"]
  delete methods[methodId]
  const selection =
    config.selection.methodId === methodId
      ? { mode: CHECK_IN_SELECTION_MODES.Automatic }
      : config.selection

  return {
    ...config,
    methodKnowledge: { ...config.methodKnowledge, methods },
    selection,
  }
}

/** Checks a task payload without making page actions executable. */
export function isValidBrowserCheckInTaskContract(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    isBrowserCheckInAction(value.action) &&
    isBrowserCheckInSuccessCondition(value.success) &&
    (value.identity === undefined ||
      isBrowserCheckInIdentityCondition(value.identity)) &&
    (value.timeoutMs === undefined ||
      (typeof value.timeoutMs === "number" &&
        Number.isInteger(value.timeoutMs) &&
        value.timeoutMs >= BROWSER_CHECK_IN_MIN_TIMEOUT_MS &&
        value.timeoutMs <= BROWSER_CHECK_IN_MAX_TIMEOUT_MS))
  )
}

export const DEFAULT_BROWSER_CHECK_IN_CONFIG: BrowserCheckInConfig = {
  enabled: false,
  action: { kind: BROWSER_CHECK_IN_ACTION_KINDS.PageLoad },
  success: {},
  timeoutMs: BROWSER_CHECK_IN_DEFAULT_TIMEOUT_MS,
}
