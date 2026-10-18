/** Adapter-owned login method identifier, including native and custom OAuth methods. */
export type AccountLoginMethodId = string

/** Native methods shared by account configuration and adapter dispatch. */
export const ACCOUNT_LOGIN_METHODS = {
  Password: "password",
} as const

/** Known OAuth providers used by existing integrations and saved check-in settings. */
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

/** Native login identifiers presented by account editors and adopted by site policies. */
export const ACCOUNT_PASSWORD_IDENTITIES = {
  Username: "username",
  Email: "email",
  UsernameOrEmail: "usernameOrEmail",
} as const
export type AccountPasswordIdentity =
  (typeof ACCOUNT_PASSWORD_IDENTITIES)[keyof typeof ACCOUNT_PASSWORD_IDENTITIES]
