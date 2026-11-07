import {
  ACCOUNT_LOGIN_PROVIDER_LABELS,
  ACCOUNT_LOGIN_PROVIDERS,
} from "~/constants/accountLogin"

/** Provider protocols actually implemented by the New API OAuth transport. */
export const NEW_API_OAUTH_PROVIDERS = {
  Github: "github",
  LinuxDo: "linuxdo",
  Discord: "discord",
  Oidc: "oidc",
} as const

export type NewApiOAuthProvider =
  (typeof NEW_API_OAUTH_PROVIDERS)[keyof typeof NEW_API_OAUTH_PROVIDERS]
/** Provider labels shared by configured methods and deployment discovery. */
export const NEW_API_OAUTH_PROVIDER_LABELS = {
  [NEW_API_OAUTH_PROVIDERS.Github]:
    ACCOUNT_LOGIN_PROVIDER_LABELS[ACCOUNT_LOGIN_PROVIDERS.Github],
  [NEW_API_OAUTH_PROVIDERS.LinuxDo]:
    ACCOUNT_LOGIN_PROVIDER_LABELS[ACCOUNT_LOGIN_PROVIDERS.LinuxDo],
  discord: "Discord",
  oidc: "OIDC",
} as const
