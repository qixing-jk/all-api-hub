/** Provider protocols actually implemented by the New API OAuth transport. */
export const NEW_API_OAUTH_PROVIDERS = {
  Github: "github",
  LinuxDo: "linuxdo",
  Discord: "discord",
  Oidc: "oidc",
} as const

export type NewApiOAuthProvider =
  (typeof NEW_API_OAUTH_PROVIDERS)[keyof typeof NEW_API_OAUTH_PROVIDERS]
