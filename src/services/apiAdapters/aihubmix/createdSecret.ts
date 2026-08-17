import { AIHUBMIX_API_ORIGIN, SITE_TYPES } from "~/constants/siteType"
import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/accountRuntimeKeys"
import {
  createAccountRuntimeKeyCreatedRuntimeSecret,
  createLegacyCreatedRuntimeSecret,
} from "~/services/accounts/createdRuntimeSecret"
import {
  hasUsableApiTokenKey,
  isMaskedApiTokenKey,
} from "~/services/accountTokens/apiTokenKey"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import type { DisplaySiteData } from "~/types"

type AIHubMixCreatedToken = {
  id?: number
  name?: string
  full_key?: string
  key?: string
}

/**
 * AIHubMix exposes the full API-key plaintext only in the create response.
 * Later token list/detail responses can be masked and are deliberately rejected.
 */
export const createAIHubMixCreatedRuntimeSecret = ({
  account,
  token,
}: {
  account: Pick<DisplaySiteData, "id" | "name" | "siteType" | "tagIds">
  token: AIHubMixCreatedToken
}) => {
  const secret = token.full_key?.trim() ?? token.key?.trim() ?? ""
  if (account.siteType !== SITE_TYPES.AIHUBMIX) {
    throw new Error("AIHubMix created secrets require an AIHubMix account")
  }
  if (!hasUsableApiTokenKey(secret) || isMaskedApiTokenKey(secret)) {
    throw new Error(
      "AIHubMix create response did not include a usable full key",
    )
  }

  const createdSecretInput = {
    account: {
      id: account.id,
      name: account.name,
      baseUrl: AIHUBMIX_API_ORIGIN,
      siteType: SITE_TYPES.AIHUBMIX,
      tagIds: account.tagIds ?? [],
    },
    token: {
      name: token.name?.trim() ?? "",
      key: secret,
    },
  }

  const tokenId = token.id
  if (
    typeof tokenId !== "number" ||
    !Number.isSafeInteger(tokenId) ||
    tokenId <= 0
  ) {
    return createLegacyCreatedRuntimeSecret(createdSecretInput)
  }

  return createAccountRuntimeKeyCreatedRuntimeSecret({
    locator: {
      source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
      accountId: account.id,
      siteType: SITE_TYPES.AIHUBMIX,
      tokenId,
    },
    displayName: createdSecretInput.token.name,
    secret,
    credential: {
      accountName: account.name,
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: AIHUBMIX_API_ORIGIN,
      siteType: SITE_TYPES.AIHUBMIX,
      tagIds: account.tagIds ?? [],
    },
  })
}
