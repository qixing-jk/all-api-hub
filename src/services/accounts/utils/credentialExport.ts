import { type AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { normalizeAccountSiteProfileUrlForManagedChannel } from "~/services/accounts/accountSiteProfile/urls"
import {
  formatOptionalSkPrefixSiteTokenAuthKey,
  hasUsableApiTokenKey,
} from "~/services/accountTokens/apiTokenKey"
import type { CredentialExportSource } from "~/services/integrations/credentialExport"
import { hashProviderCatalogValue } from "~/services/integrations/providerCatalogExport"
import type { DisplaySiteData } from "~/types"

import { resolveDisplayAccountRuntimeKeySecret } from "./apiServiceRequest"

const getCredentialCacheKey = (
  account: DisplaySiteData,
  id: string,
  baseUrl: string,
  secret: string,
  preferCurrentSecret: boolean,
) =>
  hashProviderCatalogValue(
    JSON.stringify([
      id,
      baseUrl,
      secret,
      account.baseUrl,
      account.siteType,
      account.authType,
      account.token,
      account.userId,
      account.cookieAuthSessionCookie,
      preferCurrentSecret,
    ]),
  )

/**
 * Endpoint an external caller must use for this account. The account keeps its
 * own browser origin; an integration, managed site, or verification profile
 * needs the deployment's API origin instead.
 */
const resolveAccountExternalApiBaseUrl = (
  account: Pick<DisplaySiteData, "siteType" | "baseUrl">,
): string =>
  normalizeAccountSiteProfileUrlForManagedChannel({
    siteType: account.siteType,
    url: account.baseUrl,
  })

/**
 * Prefer a key's own gateway address over the account's browser address.
 * `accountBaseUrl` is the address the key was created against; pass the key's
 * account snapshot (not the live account) when the key inherits the account
 * endpoint, so an account address change is still followed by the export.
 */
export const resolveAccountRuntimeKeyExternalApiBaseUrl = (
  account: Pick<DisplaySiteData, "siteType" | "baseUrl">,
  runtimeKeyBaseUrl?: string,
  accountBaseUrl?: string,
): string =>
  runtimeKeyBaseUrl && runtimeKeyBaseUrl !== (accountBaseUrl ?? account.baseUrl)
    ? runtimeKeyBaseUrl
    : resolveAccountExternalApiBaseUrl(account)

/** Keep runtime-key identity and source-specific secret recovery in accounts. */
export function createAccountRuntimeKeyExportSource(
  account: DisplaySiteData,
  runtimeKey: AccountRuntimeKey,
  { preferCurrentSecret = false }: { preferCurrentSecret?: boolean } = {},
): CredentialExportSource {
  // The key inherits the account endpoint unless it carries its own. Compare
  // against the key's account snapshot so a live account address change is still
  // followed rather than pinned to the creation-time key URL.
  const baseUrl = resolveAccountRuntimeKeyExternalApiBaseUrl(
    account,
    runtimeKey.baseUrl,
    runtimeKey.account.baseUrl,
  )
  return {
    id: runtimeKey.id,
    providerId: account.id,
    providerName: account.name,
    credentialName: runtimeKey.label,
    baseUrl,
    notes: runtimeKey.notes,
    cacheKey: getCredentialCacheKey(
      account,
      runtimeKey.id,
      baseUrl,
      runtimeKey.secret,
      preferCurrentSecret,
    ),
    resolveApiKey: async () => {
      // Some exporters already hold a creation-only secret; re-reading it could
      // discard that usable value when the provider cannot reveal it again.
      if (preferCurrentSecret && hasUsableApiTokenKey(runtimeKey.secret)) {
        return formatOptionalSkPrefixSiteTokenAuthKey(
          runtimeKey.secret,
          runtimeKey.siteType,
        )
      }
      return (await resolveDisplayAccountRuntimeKeySecret(account, runtimeKey))
        .secret
    },
  }
}
