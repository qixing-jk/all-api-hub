export const API_CREDENTIAL_PROFILE_EXPORT_ACTIONS = {
  CherryStudio: "cherryStudio",
  CCSwitch: "ccSwitch",
  KiloCode: "kiloCode",
  CliProxy: "cliProxy",
  ClaudeCodeRouter: "claudeCodeRouter",
  ManagedSite: "managedSite",
} as const

export type ApiCredentialProfileExportAction =
  (typeof API_CREDENTIAL_PROFILE_EXPORT_ACTIONS)[keyof typeof API_CREDENTIAL_PROFILE_EXPORT_ACTIONS]

export const API_CREDENTIAL_PROFILES_VIEW_VARIANTS = {
  Options: "options",
  Popup: "popup",
} as const

export type ApiCredentialProfilesViewVariant =
  (typeof API_CREDENTIAL_PROFILES_VIEW_VARIANTS)[keyof typeof API_CREDENTIAL_PROFILES_VIEW_VARIANTS]
