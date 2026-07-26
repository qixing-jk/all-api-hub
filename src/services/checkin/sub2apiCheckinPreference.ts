/**
 * Global opt-in switch for Sub2API daily check-in.
 *
 * Source: https://github.com/Wei-Shaw/sub2api
 * Upstream mainline does not register daily check-in routes; only some
 * deployments/forks expose `/api/v1/redeem/checkin` (or the older
 * `/api/v1/check-in`). Probing those routes for every Sub2API account would
 * produce 404 noise for the majority of users, so the capability stays behind
 * an explicit opt-in instead of being detected unconditionally.
 */

import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"

/**
 * Resolve whether the user opted into Sub2API check-in.
 *
 * Preference reads can fail while extension storage is unavailable; treat any
 * failure as "disabled" so a storage fault never starts probing unsupported
 * deployments.
 */
export async function isSub2ApiCheckinEnabled(): Promise<boolean> {
  try {
    const preferences = await userPreferences.getPreferences()
    const autoCheckin =
      preferences.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!

    return autoCheckin.sub2apiEnabled === true
  } catch {
    return false
  }
}
