/** Identity providers supported by browser-based account login. */
export const ACCOUNT_LOGIN_PROVIDERS = {
  Github: "github",
  LinuxDo: "linuxdo",
} as const

export type AccountLoginProvider =
  (typeof ACCOUNT_LOGIN_PROVIDERS)[keyof typeof ACCOUNT_LOGIN_PROVIDERS]
