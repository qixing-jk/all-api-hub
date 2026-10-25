import { SITE_TYPES } from "~/constants/siteType"
import { buildAccountKeyResourceRuntimeKey } from "~/services/accounts/keys/accountRuntimeKeys"
import { createAccountRuntimeKeyExportSource } from "~/services/accounts/utils/credentialExport"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import type { CredentialExportSource } from "~/services/integrations/credentialExport"
import type { DisplaySiteData } from "~/types"

import { buildNewApiRuntimeKey } from "./accountKeyFixtures"
import { buildDisplaySiteData, buildNewApiToken } from "./factories"

/**
 * New API account-token export source that keeps the fixture valid while making
 * each test's credential inputs explicit.
 *
 * `preferCurrentSecret` defaults to the short circuit that reuses the creation
 * secret, so the mocked async account read never settles; pass `false` to
 * exercise that read.
 */
export function createAccountExportSource(
  accountOverrides: Partial<DisplaySiteData> = {},
  tokenOverrides: Partial<NewApiToken> = {},
  { preferCurrentSecret = true }: { preferCurrentSecret?: boolean } = {},
): CredentialExportSource {
  const account = buildDisplaySiteData({
    siteType: SITE_TYPES.NEW_API,
    ...accountOverrides,
  })
  return createAccountRuntimeKeyExportSource(
    account,
    buildNewApiRuntimeKey(account, buildNewApiToken(tokenOverrides)),
    { preferCurrentSecret },
  )
}

/**
 * Source whose Anthropic and OpenAI-compatible inference addresses differ
 * (Kimi Global), so the Claude export field is Anthropic-shaped while model
 * discovery must keep searching the OpenAI-compatible route.
 */
export function createKimiExportSource(): CredentialExportSource {
  const account = buildDisplaySiteData({
    id: "kimi-account",
    name: "Kimi",
    siteType: SITE_TYPES.KIMI_GLOBAL,
    baseUrl: "https://platform.kimi.ai",
  })
  const key = buildAccountKeyResourceRuntimeKey(account, {
    ref: {
      accountId: account.id,
      siteType: account.siteType,
      scopeKey: "organization:test",
      resourceId: "key:test",
    },
    label: "Kimi key",
    secret: "sk-test",
  })
  return createAccountRuntimeKeyExportSource(account, key, {
    preferCurrentSecret: true,
  })
}
