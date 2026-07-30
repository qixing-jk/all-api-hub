import type { TempWindowFallbackPreferences } from "~/services/preferences/userPreferences"

import {
  PROTECTION_BYPASS_DECISION_RESULTS,
  PROTECTION_BYPASS_SURFACES,
} from "./contracts"
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
    automaticAccountRefreshEnabled: source.useForAutoRefresh,
    manualAccountRefreshEnabled: source.useForManualRefresh,
    allowedSurfaces: {
      [PROTECTION_BYPASS_SURFACES.Popup]: source.useInPopup,
      [PROTECTION_BYPASS_SURFACES.Options]: source.useInOptions,
      [PROTECTION_BYPASS_SURFACES.Sidepanel]: source.useInSidePanel,
      [PROTECTION_BYPASS_SURFACES.ContentScript]: true,
      [PROTECTION_BYPASS_SURFACES.Background]: true,
    },
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
