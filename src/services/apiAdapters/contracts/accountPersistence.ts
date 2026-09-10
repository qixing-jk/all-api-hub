import type { AccountIdentity, SiteAccount } from "~/types"

export interface AccountPersistenceIdentityInput {
  accessToken: string
  userId: string
  existingAccount?: Pick<SiteAccount, "site_type" | "account_info">
}

/** Provider-owned admission, identity and disclosure rules for account persistence. */
export interface AccountPersistenceCapability {
  /** Resolves the stored identity; local fallback identities do not replace request credentials. */
  prepareIdentity(
    input: AccountPersistenceIdentityInput,
  ): Promise<AccountIdentity>
  getValidationFailureMessage(error: unknown): string
  getHealthFailureReason(error: unknown): string
  getOperationLogDetails(
    ordinaryDetails: unknown,
    safeDetails: Record<string, unknown>,
  ): unknown
  /** Presence selects exact-credential ownership instead of origin/user identity. */
  getCredentialKey?(accessToken: string | undefined): string | undefined
}
