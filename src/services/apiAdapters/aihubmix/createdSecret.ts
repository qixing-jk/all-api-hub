import { AIHUBMIX_API_ORIGIN, SITE_TYPES } from "~/constants/siteType"
import { createLegacyCreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import {
  hasUsableApiTokenKey,
  isMaskedApiTokenKey,
} from "~/services/accountTokens/apiTokenKey"
import type { DisplaySiteData } from "~/types"

type AIHubMixCreatedToken = {
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

  return createLegacyCreatedRuntimeSecret({
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
  })
}
