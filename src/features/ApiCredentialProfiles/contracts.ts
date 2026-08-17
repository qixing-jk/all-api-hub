import type { AccountRuntimeKeyLocator } from "~/services/accounts/accountRuntimeKeys"
import type { ApiCredentialProfileLinkState } from "~/types/apiCredentialProfiles"

export const API_CREDENTIAL_PROFILE_EXPORT_ACTIONS = {
  CherryStudio: "cherryStudio",
  Kelivo: "kelivo",
  CCSwitch: "ccSwitch",
  CursorPlus: "cursorPlus",
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

/** Product-facing association state rendered by one credential profile row. */
export type ApiCredentialProfileAssociatedKeyItem = {
  associationId: string
  /** Locally resolved account label; omitted when the account is unavailable. */
  accountName?: string
  locator: AccountRuntimeKeyLocator
  state: ApiCredentialProfileLinkState
}

export const API_CREDENTIAL_PROFILE_ASSOCIATION_STATUSES = {
  Linked: "linked",
  NeedsConfirmation: "needs-confirmation",
} as const

export type ApiCredentialProfileAssociationStatus =
  (typeof API_CREDENTIAL_PROFILE_ASSOCIATION_STATUSES)[keyof typeof API_CREDENTIAL_PROFILE_ASSOCIATION_STATUSES]

export type ApiCredentialProfileAssociatedKeyState = {
  status: ApiCredentialProfileAssociationStatus
  items: readonly ApiCredentialProfileAssociatedKeyItem[]
}

/** Association presentation state indexed by local API credential profile id. */
export type ApiCredentialProfileAssociatedKeyStateByProfileId = Readonly<
  Record<string, ApiCredentialProfileAssociatedKeyState | undefined>
>

export const API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY_STATUSES = {
  Known: "known",
  Unknown: "unknown",
} as const

export const API_CREDENTIAL_PROFILE_ASSOCIATION_UNAVAILABLE_REASONS = {
  Loading: "loading",
  Error: "error",
} as const

/** Whether credential association data is known or temporarily unavailable. */
export type ApiCredentialProfileAssociationAvailability =
  | {
      status: typeof API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY_STATUSES.Known
    }
  | {
      status: typeof API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY_STATUSES.Unknown
      reason: (typeof API_CREDENTIAL_PROFILE_ASSOCIATION_UNAVAILABLE_REASONS)[keyof typeof API_CREDENTIAL_PROFILE_ASSOCIATION_UNAVAILABLE_REASONS]
    }

export const API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY = {
  Known: {
    status: API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY_STATUSES.Known,
  },
  Loading: {
    status: API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY_STATUSES.Unknown,
    reason: API_CREDENTIAL_PROFILE_ASSOCIATION_UNAVAILABLE_REASONS.Loading,
  },
  Error: {
    status: API_CREDENTIAL_PROFILE_ASSOCIATION_AVAILABILITY_STATUSES.Unknown,
    reason: API_CREDENTIAL_PROFILE_ASSOCIATION_UNAVAILABLE_REASONS.Error,
  },
} as const satisfies Record<
  "Known" | "Loading" | "Error",
  ApiCredentialProfileAssociationAvailability
>
