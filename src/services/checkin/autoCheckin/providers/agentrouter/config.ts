import { ACCOUNT_LOGIN_PROVIDERS } from "~/constants/accountLogin"
import type { CheckInConfig } from "~/types/checkIn"

/** Existing login check-in configurations default to GitHub. */
export function getLoginCheckInProvider(config?: CheckInConfig) {
  return config?.loginCheckIn?.provider === ACCOUNT_LOGIN_PROVIDERS.LinuxDo
    ? ACCOUNT_LOGIN_PROVIDERS.LinuxDo
    : ACCOUNT_LOGIN_PROVIDERS.Github
}
