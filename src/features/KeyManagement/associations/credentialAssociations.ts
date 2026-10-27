import {
  isAccountRuntimeKeyLocatorEqual,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/keys/accountRuntimeKeys"
import {
  API_CREDENTIAL_PROFILE_LINK_STATES,
  type ApiCredentialProfile,
  type ApiCredentialProfileLink,
} from "~/types/apiCredentialProfiles"

export const KEY_CREDENTIAL_ASSOCIATION_STATES = {
  Unlinked: "unlinked",
  Linked: "linked",
  NeedsConfirmation: "needs-confirmation",
} as const

export type KeyCredentialAssociationStatus =
  (typeof KEY_CREDENTIAL_ASSOCIATION_STATES)[keyof typeof KEY_CREDENTIAL_ASSOCIATION_STATES]

type KeyCredentialAssociation =
  | { status: typeof KEY_CREDENTIAL_ASSOCIATION_STATES.Unlinked }
  | {
      status: typeof KEY_CREDENTIAL_ASSOCIATION_STATES.Linked
      associationId: string
      profileId: string
    }
  | { status: typeof KEY_CREDENTIAL_ASSOCIATION_STATES.NeedsConfirmation }

/** Reduces persisted links to the fail-closed state exposed by one key row. */
export const getCredentialAssociationForLocator = (
  links: readonly ApiCredentialProfileLink[],
  locator: AccountRuntimeKeyLocator,
): KeyCredentialAssociation => {
  const matching = links.filter((link) =>
    isAccountRuntimeKeyLocatorEqual(link.locator, locator),
  )
  if (matching.length === 0) {
    return { status: KEY_CREDENTIAL_ASSOCIATION_STATES.Unlinked }
  }
  const [match] = matching
  if (
    matching.length !== 1 ||
    match === undefined ||
    match.state !== API_CREDENTIAL_PROFILE_LINK_STATES.Active
  ) {
    return { status: KEY_CREDENTIAL_ASSOCIATION_STATES.NeedsConfirmation }
  }

  return {
    status: KEY_CREDENTIAL_ASSOCIATION_STATES.Linked,
    associationId: match.id,
    profileId: match.profileId,
  }
}

/** Returns a local profile only for one confirmed link to the exact key locator. */
export const getCredentialProfileForLocator = (
  links: readonly ApiCredentialProfileLink[],
  profiles: readonly ApiCredentialProfile[],
  locator: AccountRuntimeKeyLocator,
): ApiCredentialProfile | undefined => {
  const association = getCredentialAssociationForLocator(links, locator)
  return association.status === KEY_CREDENTIAL_ASSOCIATION_STATES.Linked
    ? profiles.find((profile) => profile.id === association.profileId)
    : undefined
}
