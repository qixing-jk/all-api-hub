export const ACCOUNT_CREDENTIAL_IDENTITY_STATUSES = {
  Confirmed: "confirmed",
  Possible: "possible",
  Mismatch: "mismatch",
  Unknown: "unknown",
} as const

export const ACCOUNT_CREDENTIAL_EVIDENCE_SOURCES = {
  Provider: "provider",
  LinkedSecret: "linked-secret",
  MaskedKey: "masked-key",
  None: "none",
} as const

/** Transient correlation evidence. It never retains credential bytes. */
export type AccountCredentialIdentity = Readonly<{
  status: (typeof ACCOUNT_CREDENTIAL_IDENTITY_STATUSES)[keyof typeof ACCOUNT_CREDENTIAL_IDENTITY_STATUSES]
  source: (typeof ACCOUNT_CREDENTIAL_EVIDENCE_SOURCES)[keyof typeof ACCOUNT_CREDENTIAL_EVIDENCE_SOURCES]
}>

/** Stored account-secret recovery requires provider identity, not a local hint/link. */
export function isProviderConfirmedAccountCredential(
  identity?: AccountCredentialIdentity,
): boolean {
  return (
    identity?.status === ACCOUNT_CREDENTIAL_IDENTITY_STATUSES.Confirmed &&
    identity.source === ACCOUNT_CREDENTIAL_EVIDENCE_SOURCES.Provider
  )
}
