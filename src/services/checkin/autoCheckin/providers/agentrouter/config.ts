import {
  isAccountLoginProvider,
  type AccountLoginProvider,
} from "~/constants/accountLogin"
import type { CheckInConfig } from "~/types/checkIn"

/**
 * Reads the login provider selected for AgentRouter check-in.
 *
 * There is deliberately no GitHub fallback: the browser flow signs in with
 * whichever GitHub / Linux DO identity the browser currently holds, so guessing
 * a provider would run the wrong OAuth identity and report a misleading
 * `identity_mismatch` instead of asking the user to choose.
 */
export function resolveLoginCheckInProvider(
  config?: CheckInConfig,
): AccountLoginProvider | null {
  const provider = config?.loginCheckIn?.provider
  return isAccountLoginProvider(provider) ? provider : null
}
