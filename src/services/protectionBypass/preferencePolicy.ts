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
  return {
    automaticMasterEnabled: source.enabled,
    automaticFeatureBypass: source.automaticFeatureBypass,
    preferredMode: source.tempContextMode,
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
