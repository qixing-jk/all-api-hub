/** Identity providers supported by browser-based account login. */
export const ACCOUNT_LOGIN_PROVIDERS = {
  Github: "github",
  LinuxDo: "linuxdo",
} as const

export type AccountLoginProvider =
  (typeof ACCOUNT_LOGIN_PROVIDERS)[keyof typeof ACCOUNT_LOGIN_PROVIDERS]

/**
 * Provider names are product names, so they stay untranslated. Sharing one map
 * keeps the check-in settings UI and the conflict messages in agreement.
 */
export const ACCOUNT_LOGIN_PROVIDER_LABELS = {
  [ACCOUNT_LOGIN_PROVIDERS.Github]: "GitHub",
  [ACCOUNT_LOGIN_PROVIDERS.LinuxDo]: "Linux DO",
} as const satisfies Record<AccountLoginProvider, string>

/** Narrows unknown persisted or remote values to a supported login provider. */
export function isAccountLoginProvider(
  value: unknown,
): value is AccountLoginProvider {
  return (
    value === ACCOUNT_LOGIN_PROVIDERS.Github ||
    value === ACCOUNT_LOGIN_PROVIDERS.LinuxDo
  )
}
