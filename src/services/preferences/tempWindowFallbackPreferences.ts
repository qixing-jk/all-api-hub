import {
  TEMP_CONTEXT_MODES,
  type TempContextMode,
} from "~/constants/tempContextMode"
import {
  PROTECTION_BYPASS_AUTOMATIC_FEATURES,
  type ProtectionBypassAutomaticFeature,
} from "~/services/protectionBypass/contracts"

export const DEFAULT_TEMP_CONTEXT_MODE = TEMP_CONTEXT_MODES.Tab

export const DEFAULT_AUTOMATIC_FEATURE_BYPASS = Object.fromEntries(
  Object.values(PROTECTION_BYPASS_AUTOMATIC_FEATURES).map((feature) => [
    feature,
    true,
  ]),
) as Record<ProtectionBypassAutomaticFeature, boolean>

export interface TempWindowFallbackPreferences {
  enabled: boolean
  automaticFeatureBypass: Record<ProtectionBypassAutomaticFeature, boolean>
  tempContextMode: TempContextMode
}

interface LegacyTempWindowFallbackPreferences {
  enabled?: unknown
  automaticFeatureBypass?: unknown
  useForAutoRefresh?: unknown
  tempContextMode?: unknown
}

/** Narrows persisted mode values to supported temporary-context modes. */
function isTempContextMode(value: unknown): value is TempContextMode {
  return Object.values(TEMP_CONTEXT_MODES).includes(value as TempContextMode)
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
    enabled: typeof source.enabled === "boolean" ? source.enabled : true,
    automaticFeatureBypass,
    tempContextMode: isTempContextMode(source.tempContextMode)
      ? source.tempContextMode
      : DEFAULT_TEMP_CONTEXT_MODE,
  }
}
