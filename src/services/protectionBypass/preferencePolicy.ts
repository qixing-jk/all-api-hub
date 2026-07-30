import { normalizeTempWindowFallbackPreferences } from "~/services/preferences/tempWindowFallbackPreferences"
import type { TempWindowFallbackPreferences } from "~/services/preferences/userPreferences"

import { PROTECTION_BYPASS_DECISION_RESULTS } from "./contracts"
import type {
  ProtectionBypassPolicy,
  ProtectionBypassPolicyState,
} from "./policy"

/** Maps the stored compatibility fields to the canonical runtime policy. */
export function normalizeProtectionBypassPreferences(
  source: TempWindowFallbackPreferences,
): ProtectionBypassPolicy {
  const preferences = normalizeTempWindowFallbackPreferences(source)
  return {
    automaticMasterEnabled: preferences.enabled,
    automaticFeatureBypass: preferences.automaticFeatureBypass,
    preferredMode: preferences.tempContextMode,
  }
}

/** Reads current preferences and preserves storage failures as policy facts. */
export async function readProtectionBypassPolicy(
  readPreferences: () => Promise<TempWindowFallbackPreferences>,
): Promise<ProtectionBypassPolicyState> {
  try {
    return normalizeProtectionBypassPreferences(await readPreferences())
  } catch {
    return { kind: PROTECTION_BYPASS_DECISION_RESULTS.Unavailable }
  }
}
