import {
  formatOptionalSkPrefixSiteToken,
  hasUsableApiTokenKey,
} from "~/services/accountTokens/apiTokenKey"
import type { ApiToken } from "~/types"

import {
  resolveDisplayAccountTokenForSecret,
  type DisplayAccountApiSnapshot,
  type ResolveDisplayAccountTokenForSecretOptions,
} from "./apiServiceRequest"

/**
 * Resolves an export token only when the selected token key is not already a usable secret.
 */
export async function resolveExportTokenForSecret<TToken extends ApiToken>(
  account: DisplayAccountApiSnapshot,
  token: TToken,
  options: ResolveDisplayAccountTokenForSecretOptions = {},
): Promise<TToken> {
  if (hasUsableApiTokenKey(token.key)) {
    return formatOptionalSkPrefixSiteToken(token, account.siteType)
  }

  return resolveDisplayAccountTokenForSecret(account, token, options)
}
