import { getAccountRuntimeKeyLocatorAccountId } from "~/services/accounts/accountRuntimeKeys"
import type { ApiCredentialProfileLink } from "~/types/apiCredentialProfiles"
import { API_CREDENTIAL_PROFILE_LINK_STATES } from "~/types/apiCredentialProfiles"

import type {
  ApiCredentialProfileAssociatedKeyItem,
  ApiCredentialProfileAssociatedKeyStateByProfileId,
} from "../contracts"
import { API_CREDENTIAL_PROFILE_ASSOCIATION_STATUSES } from "../contracts"

/** Adds optional local account context without weakening locator fallback. */
function buildAssociatedKeyItem(
  link: ApiCredentialProfileLink,
  accountNameById: ReadonlyMap<string, string>,
): ApiCredentialProfileAssociatedKeyItem {
  const accountName = accountNameById
    .get(getAccountRuntimeKeyLocatorAccountId(link.locator))
    ?.trim()

  return {
    associationId: link.id,
    ...(accountName ? { accountName } : {}),
    locator: link.locator,
    state: link.state,
  }
}

/** Maps durable links to the narrow, fail-closed state rendered by profile rows. */
export function buildApiCredentialProfileAssociatedKeyStates(
  links: readonly ApiCredentialProfileLink[],
  accountNameById: ReadonlyMap<string, string> = new Map(),
): ApiCredentialProfileAssociatedKeyStateByProfileId {
  const linksByProfileId = new Map<string, ApiCredentialProfileLink[]>()

  for (const link of links) {
    const profileLinks = linksByProfileId.get(link.profileId)
    if (profileLinks) {
      profileLinks.push(link)
    } else {
      linksByProfileId.set(link.profileId, [link])
    }
  }

  return Object.fromEntries(
    Array.from(linksByProfileId, ([profileId, profileLinks]) => {
      if (
        profileLinks.every(
          (link) => link.state === API_CREDENTIAL_PROFILE_LINK_STATES.Active,
        )
      ) {
        return [
          profileId,
          {
            status: API_CREDENTIAL_PROFILE_ASSOCIATION_STATUSES.Linked,
            items: profileLinks.map((link) =>
              buildAssociatedKeyItem(link, accountNameById),
            ),
          } as const,
        ]
      }

      return [
        profileId,
        {
          status: API_CREDENTIAL_PROFILE_ASSOCIATION_STATUSES.NeedsConfirmation,
          items: profileLinks.map((link) =>
            buildAssociatedKeyItem(link, accountNameById),
          ),
        } as const,
      ]
    }),
  )
}
