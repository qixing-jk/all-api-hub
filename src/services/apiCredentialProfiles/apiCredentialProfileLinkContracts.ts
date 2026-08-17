export const API_CREDENTIAL_PROFILE_CAPTURE_STATUSES = {
  Captured: "captured",
  CapturedUnlinked: "captured-unlinked",
  AssociationConflict: "association-conflict",
} as const

export type ApiCredentialProfileCaptureStatus =
  (typeof API_CREDENTIAL_PROFILE_CAPTURE_STATUSES)[keyof typeof API_CREDENTIAL_PROFILE_CAPTURE_STATUSES]

export const API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES = {
  Resolved: "resolved",
  NotFound: "not-found",
  Stale: "stale",
  NeedsConfirmation: "needs-confirmation",
  Ambiguous: "ambiguous",
} as const
