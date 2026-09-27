import type { AccountStorageConfig, SiteAccount } from "~/types"

/**
 * Rejection raised by an account-write guard.
 *
 * Guards run inside the account storage transaction, so the mutation functions
 * must let this error escape instead of turning it into a silent failure: the
 * caller owns the user-facing reason, and the write was never applied.
 */
export class AccountWriteRejectedError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = "AccountWriteRejectedError"
  }
}

/**
 * Validates the config a mutation is about to commit.
 *
 * Receives the config as it would be written (the account already replaced for
 * updates, not yet appended for creations) so the rule is evaluated against the
 * same snapshot the write will persist. Throw to abort the write.
 */
export type AccountWriteGuard = (
  config: AccountStorageConfig,
  nextAccount: SiteAccount,
) => void
