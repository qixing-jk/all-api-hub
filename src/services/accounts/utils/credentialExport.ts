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
export const resolveAccountExternalApiBaseUrl = (
  account: Pick<DisplaySiteData, "siteType" | "baseUrl">,
): string =>
  normalizeAccountSiteProfileUrlForManagedChannel({
    siteType: account.siteType,
    url: account.baseUrl,
  })

/** Keep runtime-key identity and source-specific secret recovery in accounts. */
export function createAccountRuntimeKeyExportSource(
  account: DisplaySiteData,
  runtimeKey: AccountRuntimeKey,
  { preferCurrentSecret = false }: { preferCurrentSecret?: boolean } = {},
): CredentialExportSource {
  // The key inherits the account endpoint unless it carries its own.
  const baseUrl =
    runtimeKey.baseUrl === runtimeKey.account.baseUrl
      ? resolveAccountExternalApiBaseUrl(account)
      : runtimeKey.baseUrl
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
