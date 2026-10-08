import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/keys/accountRuntimeKeys"
import { resolveAccountExternalApiBaseUrl } from "~/services/accounts/utils/credentialExport"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
  type AccountKeyResourceRef,
  type AccountRuntimeKeyResolution,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  getInventorySecretAvailability,
  INVENTORY_SECRET_AVAILABILITIES,
} from "~/services/apiAdapters/contracts/inventorySecret"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import {
  ASSOCIATED_PROFILE_SECRET_RESOLUTION_STATUSES,
  resolveAssociatedProfileSecret,
} from "~/services/apiCredentialProfiles/accountImport/accountRuntimeKeyRecovery"
import type { DisplaySiteData } from "~/types"

/** Resolve both the plaintext and matching gateway before source deletion. */
export async function buildAccountKeyResourceLinkedCleanupInput({
  account,
  ref,
  runtimeKeyBaseUrl,
  resolveProvider,
}: {
  account: Pick<DisplaySiteData, "id" | "siteType" | "baseUrl">
  ref: AccountKeyResourceRef
  runtimeKeyBaseUrl?: string
  resolveProvider: () => Promise<AccountRuntimeKeyResolution | undefined>
}) {
  let secret = ""
  let keyBaseUrl = runtimeKeyBaseUrl
  const capability = getSiteTypeCapabilities(account.siteType).account
    ?.keyResourceManagement
  const provider =
    capability &&
    getInventorySecretAvailability(capability) ===
      INVENTORY_SECRET_AVAILABILITIES.Recoverable
      ? await resolveProvider()
      : undefined
  if (provider?.kind === "resolved") secret = provider.secret.trim()
  if (!secret) {
    const associated = await resolveAssociatedProfileSecret({
      source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
      ref,
    })
    if (
      associated.status ===
      ASSOCIATED_PROFILE_SECRET_RESOLUTION_STATUSES.Resolved
    ) {
      secret = associated.secret
      if (!keyBaseUrl || keyBaseUrl === account.baseUrl) {
        keyBaseUrl = associated.profile.baseUrl
      }
    }
  }
  if (!secret)
    throw new AccountKeyResourceError({
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable,
    })

  return {
    source: {
      accountId: account.id,
      accountBaseUrl: account.baseUrl,
      ref,
    },
    baseUrl: resolveAccountExternalApiBaseUrl(account, keyBaseUrl),
    key: secret,
  }
}
