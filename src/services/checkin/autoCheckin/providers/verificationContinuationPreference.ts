import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { CheckInConfig } from "~/types/checkIn"

/**
 * Reads the operator's global preference for continuing a check-in whose site
 * requires human verification. Missing or unreadable preferences keep the
 * conservative default (off).
 */
async function readGlobalVerificationContinuation(): Promise<boolean> {
  try {
    const preferences = await userPreferences.getPreferences()
    return (
      (preferences.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!)
        .continueWhenVerificationRequired === true
    )
  } catch {
    return false
  }
}

/**
 * Resolves whether one account keeps going after a verification refusal: the
 * account-level override wins; without an override the account follows the
 * operator's global preference.
 */
export async function resolveVerificationContinuation(
  config: Pick<CheckInConfig, "continueWhenVerificationRequired">,
): Promise<boolean> {
  if (typeof config.continueWhenVerificationRequired === "boolean")
    return config.continueWhenVerificationRequired
  return readGlobalVerificationContinuation()
}
