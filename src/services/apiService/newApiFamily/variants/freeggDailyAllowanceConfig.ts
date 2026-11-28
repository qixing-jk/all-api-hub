/** Pure metadata for the verified FreeGG daily-allowance deployment. */

/**
 * Verified deployments of the self-triggered allowance protocol. Public branding
 * and checkin_enabled do not identify this separate capability. Extend this list
 * only after verifying both the trigger and ledger contract at the new origin.
 */
export const FREEGG_DAILY_ALLOWANCE_ORIGINS: readonly string[] = [
  "https://freegg.app",
]
export const FREEGG_ALLOWANCE_LOG_ENDPOINT = "/api/log/self"
export const FREEGG_ALLOWANCE_TRIGGER_ENDPOINT = "/api/user/self"
export const FREEGG_ALLOWANCE_RESET_TIME_ZONE = "Asia/Shanghai"

/** Match only the verified deployment, without embedded URL credentials. */
export function isFreeggUrl(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? "")
    return (
      !url.username &&
      !url.password &&
      FREEGG_DAILY_ALLOWANCE_ORIGINS.includes(url.origin)
    )
  } catch {
    return false
  }
}
