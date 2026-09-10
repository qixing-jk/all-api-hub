import {
  TEMP_CONTEXT_PREFERENCE_MODES,
  type TempContextPreferenceMode,
} from "~/constants/tempContextMode"
import {
  PROTECTION_BYPASS_AUTOMATIC_FEATURES,
  type ProtectionBypassAutomaticFeature,
} from "~/services/protectionBypass/contracts"

export const DEFAULT_TEMP_CONTEXT_PREFERENCE =
  TEMP_CONTEXT_PREFERENCE_MODES.Auto

export const DEFAULT_TEMP_WINDOW_SIZE = { windowWidth: 600, windowHeight: 720 }
export const TEMP_WINDOW_SIZE_LIMITS = { min: 320, max: 4096 }

/** Accepts only usable integer window dimensions from settings or stored data. */
export function isValidTempWindowDimension(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= TEMP_WINDOW_SIZE_LIMITS.min &&
    value <= TEMP_WINDOW_SIZE_LIMITS.max
  )
}

export const DEFAULT_AUTOMATIC_FEATURE_BYPASS = Object.fromEntries(
  Object.values(PROTECTION_BYPASS_AUTOMATIC_FEATURES).map((feature) => [
    feature,
    true,
  ]),
) as Record<ProtectionBypassAutomaticFeature, boolean>

export interface TempWindowFallbackPreferences {
  enabled: boolean
  automaticFeatureBypass: Record<ProtectionBypassAutomaticFeature, boolean>
  tempContextMode: TempContextPreferenceMode
  windowWidth: number
  windowHeight: number
}

interface LegacyTempWindowFallbackPreferences {
  enabled?: unknown
  automaticFeatureBypass?: unknown
  useForAutoRefresh?: unknown
  tempContextMode?: unknown
  windowWidth?: unknown
  windowHeight?: unknown
}

/** Narrows persisted mode values to supported temporary-context preferences. */
function isTempContextPreferenceMode(
  value: unknown,
): value is TempContextPreferenceMode {
  return Object.values(TEMP_CONTEXT_PREFERENCE_MODES).includes(
    value as TempContextPreferenceMode,
  )
}

/** Rebuilds the persisted fallback shape and intentionally drops legacy keys. */
export function normalizeTempWindowFallbackPreferences(
  value: unknown,
): TempWindowFallbackPreferences {
  const source =
    value && typeof value === "object"
      ? (value as LegacyTempWindowFallbackPreferences)
      : {}
  const storedFeatures =
    source.automaticFeatureBypass &&
    typeof source.automaticFeatureBypass === "object"
      ? (source.automaticFeatureBypass as Record<string, unknown>)
      : {}

  const automaticFeatureBypass = Object.fromEntries(
    Object.values(PROTECTION_BYPASS_AUTOMATIC_FEATURES).map((feature) => {
      const canonical = storedFeatures[feature]
      if (typeof canonical === "boolean") return [feature, canonical]
      if (
        feature === PROTECTION_BYPASS_AUTOMATIC_FEATURES.AccountRefresh &&
        typeof source.useForAutoRefresh === "boolean"
      ) {
        return [feature, source.useForAutoRefresh]
      }
      return [feature, true]
    }),
  ) as Record<ProtectionBypassAutomaticFeature, boolean>

  return {
    windowWidth: isValidTempWindowDimension(source.windowWidth)
      ? source.windowWidth
      : DEFAULT_TEMP_WINDOW_SIZE.windowWidth,
    windowHeight: isValidTempWindowDimension(source.windowHeight)
      ? source.windowHeight
      : DEFAULT_TEMP_WINDOW_SIZE.windowHeight,
    enabled: typeof source.enabled === "boolean" ? source.enabled : true,
    automaticFeatureBypass,
    tempContextMode: isTempContextPreferenceMode(source.tempContextMode)
      ? source.tempContextMode
      : DEFAULT_TEMP_CONTEXT_PREFERENCE,
  }
}
