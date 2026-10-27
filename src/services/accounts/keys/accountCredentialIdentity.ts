import type { SiteType } from "~/constants/siteType"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import {
  compareCredentialSecret,
  KEY_CREDENTIAL_SECRET_MATCHES,
} from "~/services/accountTokens/credentialSecretMatch"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"

export const ACCOUNT_CREDENTIAL_IDENTITY_STATUSES = {
  Confirmed: "confirmed",
  Possible: "possible",
  Mismatch: "mismatch",
  Unknown: "unknown",
} as const

const ACCOUNT_CREDENTIAL_EVIDENCE_SOURCES = {
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

/**
 * Provider self identity outranks local links; full linked keys outrank masks.
 * Callers supply only credentials eligible for the provider's authentication mode.
 * Unlinking naturally falls back to the original provider evidence.
 */
export function resolveAccountCredentialIdentity({
  provider,
  resourceIdentity,
  accountCredential,
  linkedSecret,
  maskedKey,
  siteType,
}: {
  provider?: AccountCredentialIdentity
  resourceIdentity?: { resourceId: string; credentialResourceId: string | null }
  accountCredential?: string
  /** Only a confirmed resource/profile association may supply this plaintext. */
  linkedSecret?: string
  maskedKey?: string
  siteType?: SiteType
}): AccountCredentialIdentity {
  const resolveKeyCredential = siteType
    ? getSiteTypeCapabilities(siteType).account?.persistence
        ?.getKeyAuthenticationSecret
    : undefined
  if (resolveKeyCredential)
    accountCredential = resolveKeyCredential(accountCredential)
  const statuses = ACCOUNT_CREDENTIAL_IDENTITY_STATUSES
  const sources = ACCOUNT_CREDENTIAL_EVIDENCE_SOURCES
  if (
    provider?.source === sources.Provider &&
    (provider.status === statuses.Confirmed ||
      provider.status === statuses.Mismatch)
  )
    return provider
  if (resourceIdentity?.resourceId && resourceIdentity.credentialResourceId)
    return {
      status:
        resourceIdentity.resourceId === resourceIdentity.credentialResourceId
          ? statuses.Confirmed
          : statuses.Mismatch,
      source: sources.Provider,
    }
  if (accountCredential && hasUsableApiTokenKey(accountCredential)) {
    if (linkedSecret && hasUsableApiTokenKey(linkedSecret))
      return {
        status:
          compareCredentialSecret(accountCredential, linkedSecret) ===
          KEY_CREDENTIAL_SECRET_MATCHES.Exact
            ? statuses.Confirmed
            : statuses.Mismatch,
        source: sources.LinkedSecret,
      }
    const match = compareCredentialSecret(maskedKey, accountCredential)
    if (match === KEY_CREDENTIAL_SECRET_MATCHES.Masked)
      return { status: statuses.Possible, source: sources.MaskedKey }
    if (match === KEY_CREDENTIAL_SECRET_MATCHES.Mismatch)
      return { status: statuses.Mismatch, source: sources.MaskedKey }
  }
  return provider ?? { status: statuses.Unknown, source: sources.None }
}

/** Stored account-secret recovery requires provider identity, not a local hint/link. */
export function isProviderConfirmedAccountCredential(
  identity?: AccountCredentialIdentity,
): boolean {
  return (
    identity?.status === ACCOUNT_CREDENTIAL_IDENTITY_STATUSES.Confirmed &&
    identity.source === ACCOUNT_CREDENTIAL_EVIDENCE_SOURCES.Provider
  )
}
