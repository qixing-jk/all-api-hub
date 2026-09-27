import { vi } from "vitest"

import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { apiCredentialProfilesStorage } from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"

/**
 * Declares that a suite does not model the persisted account and profile stores.
 *
 * Persisted verification results are reaped when the account or profile that owns
 * them is absent from those stores, and an unreadable store means "liveness
 * unknown" rather than "no owners exist". Suites that build verification targets
 * from in-memory fixtures, without persisting the accounts or profiles they name,
 * must call this so the orphan sweep does not read the empty stores as "every
 * owner is gone" and delete the fixture's history.
 *
 * Pair with `vi.restoreAllMocks()` in `afterEach`.
 */
export function stubVerificationOwnerStoresUnavailable(): void {
  vi.spyOn(accountConfigStore, "readAccounts").mockRejectedValue(
    new Error("accounts unavailable"),
  )
  vi.spyOn(
    apiCredentialProfilesStorage,
    "listProfileIdsOrThrow",
  ).mockRejectedValue(new Error("profiles unavailable"))
}
