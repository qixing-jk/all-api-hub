import { type AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { resolveAccountSiteAddresses } from "~/services/accounts/accountSiteProfile/addresses"
import {
  formatOptionalSkPrefixSiteTokenAuthKey,
  hasUsableApiTokenKey,
} from "~/services/accountTokens/apiTokenKey"
import { toProtocolRoot } from "~/services/aiApi/protocolAddress"
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
 *
 * Exporters are configured with a protocol root: the consumer appends the
 * version segment it owns, so a trailing `/v1` here would be appended twice.
 *
 * An explicit gateway override — a per-key address or a linked profile — wins
 * over the account address.
 */
export const resolveAccountExternalApiBaseUrl = (
  account: Pick<DisplaySiteData, "siteType" | "baseUrl">,
  overrideUrl?: string,
): string => {
  if (overrideUrl)
    return (
      toProtocolRoot("openai-compatible", overrideUrl) ?? overrideUrl.trim()
    )

  return resolveAccountSiteAddresses({
    siteType: account.siteType,
    siteUrl: account.baseUrl,
  }).inferenceApi.openAiCompatible.root
}

/**
 * Prefer a key's own gateway address over the account's browser address.
 *
 * Only a provider-supplied per-key address counts: a key that merely inherits
 * its account snapshot's address must follow the account when it is edited,
 * otherwise a stale key would keep exporting the old endpoint.
 */
export const resolveAccountRuntimeKeyExternalApiBaseUrl = (
  account: Pick<DisplaySiteData, "siteType" | "baseUrl">,
  runtimeKey: Pick<AccountRuntimeKey, "baseUrl" | "account">,
): string =>
  resolveAccountExternalApiBaseUrl(
    account,
    runtimeKey.baseUrl !== runtimeKey.account.baseUrl
      ? runtimeKey.baseUrl
      : undefined,
  )

/** Keep runtime-key identity and source-specific secret recovery in accounts. */
export function createAccountRuntimeKeyExportSource(
  account: DisplaySiteData,
  runtimeKey: AccountRuntimeKey,
  { preferCurrentSecret = false }: { preferCurrentSecret?: boolean } = {},
): CredentialExportSource {
  // The key inherits the account endpoint unless it carries its own.
  const baseUrl = resolveAccountRuntimeKeyExternalApiBaseUrl(
    account,
    runtimeKey,
  )
  const addresses = resolveAccountSiteAddresses({
    siteType: account.siteType,
    siteUrl: account.baseUrl,
  })
  const declaredAnthropic = addresses.inferenceApi.anthropic?.root
  const anthropicBaseUrl =
    baseUrl === addresses.inferenceApi.openAiCompatible.root &&
    declaredAnthropic
      ? declaredAnthropic
      : undefined
  return {
    id: runtimeKey.id,
    providerId: account.id,
    providerName: account.name,
    credentialName: runtimeKey.label,
    baseUrl,
    ...(anthropicBaseUrl ? { anthropicBaseUrl } : {}),
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
