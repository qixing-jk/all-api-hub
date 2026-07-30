import type { TempWindowFallbackPreferences } from "~/services/preferences/userPreferences"

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
      popup: source.useInPopup,
      options: source.useInOptions,
      sidepanel: source.useInSidePanel,
      content_script: true,
      background: true,
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
    return { kind: "unavailable" }
  }
}
