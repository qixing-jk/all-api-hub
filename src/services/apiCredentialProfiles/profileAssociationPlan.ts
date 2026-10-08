import {
  getAccountRuntimeKeyLocatorIdentity,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import { API_CREDENTIAL_PROFILE_CAPTURE_STATUSES } from "~/services/apiCredentialProfiles/apiCredentialProfileLinkContracts"
import {
  addProfileLinkTombstones,
  coerceAccountRuntimeKeyLocator,
} from "~/services/apiCredentialProfiles/apiCredentialProfileLinkStorage"
import { createNextConfig } from "~/services/apiCredentialProfiles/profileConfigCodec"
import { resolveProfileCreationCandidate } from "~/services/apiCredentialProfiles/profileCreationPlan"
import type {
  ApiCredentialProfileCaptureInput,
  ApiCredentialProfileCaptureResult,
  ApiCredentialProfileLinkInput,
  ApiCredentialProfileRelinkInput,
} from "~/services/apiCredentialProfiles/profileStorageContracts"
import type {
  ApiCredentialProfile,
  ApiCredentialProfileLink,
  ApiCredentialProfileLinkSource,
  ApiCredentialProfilesConfig,
} from "~/types/apiCredentialProfiles"
import { API_CREDENTIAL_PROFILE_LINK_STATES } from "~/types/apiCredentialProfiles"
import { safeRandomUUID } from "~/utils/core/identifier"

const findProfileLinkForPair = (
  links: readonly ApiCredentialProfileLink[],
  profileId: string,
  locator: AccountRuntimeKeyLocator,
): ApiCredentialProfileLink | undefined => {
  const locatorIdentity = getAccountRuntimeKeyLocatorIdentity(locator)
  return links.find(
    (link) =>
      link.profileId === profileId &&
      getAccountRuntimeKeyLocatorIdentity(link.locator) === locatorIdentity,
  )
}

const createProfileLink = (params: {
  links: readonly ApiCredentialProfileLink[]
  profileId: string
  locator: AccountRuntimeKeyLocator
  linkedBy: ApiCredentialProfileLinkSource
  now: number
}): {
  link: ApiCredentialProfileLink
  hasLocatorConflict: boolean
} => {
  const locatorIdentity = getAccountRuntimeKeyLocatorIdentity(params.locator)
  const hasLocatorConflict = params.links.some(
    (link) =>
      getAccountRuntimeKeyLocatorIdentity(link.locator) === locatorIdentity,
  )

  return {
    link: {
      id: safeRandomUUID("api-profile-link"),
      profileId: params.profileId,
      locator: params.locator,
      state: hasLocatorConflict
        ? API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation
        : API_CREDENTIAL_PROFILE_LINK_STATES.Active,
      linkedBy: params.linkedBy,
      createdAt: params.now,
      updatedAt: params.now,
    },
    hasLocatorConflict,
  }
}

/** Plan capture and association together so their identity and conflict rules share one atomic write. */
export function planApiCredentialProfileCapture(
  config: ApiCredentialProfilesConfig,
  candidate: ApiCredentialProfile,
  locator: AccountRuntimeKeyLocator | null,
  linkedBy: ApiCredentialProfileCaptureInput["linkedBy"],
  now: number,
): {
  config: ApiCredentialProfilesConfig | null
  result: ApiCredentialProfileCaptureResult
} {
  const { profile, sourceUrlChanged } = resolveProfileCreationCandidate(
    config,
    candidate,
    now,
  )
  const profiles = config.profiles.some(({ id }) => id === profile.id)
    ? config.profiles.map((p) => (p.id === profile.id ? profile : p))
    : [...config.profiles, profile]
  if (!locator)
    return {
      config: createNextConfig({ current: config, profiles, now }),
      result: {
        status: API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.CapturedUnlinked,
        profile,
      },
    }
  const samePair = findProfileLinkForPair(config.links, profile.id, locator)
  if (samePair)
    return {
      config: sourceUrlChanged
        ? createNextConfig({ current: config, profiles, now })
        : null,
      result: {
        status:
          samePair.state ===
          API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation
            ? API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.AssociationConflict
            : API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.Captured,
        profile,
      },
    }
  const { link, hasLocatorConflict } = createProfileLink({
    links: config.links,
    profileId: profile.id,
    locator,
    linkedBy,
    now,
  })
  return {
    config: createNextConfig({
      current: config,
      profiles,
      links: [...config.links, link],
      now,
    }),
    result: {
      status: hasLocatorConflict
        ? API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.AssociationConflict
        : API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.Captured,
      profile,
    },
  }
}

/** Plan linkProfile while keeping locator conflicts and tombstones inside the profile transaction. */
export function planApiCredentialProfileLink(
  config: ApiCredentialProfilesConfig,
  input: ApiCredentialProfileLinkInput,
  now: number,
) {
  if (!config.profiles.some(({ id }) => id === input.profileId)) {
    throw new Error("Profile not found.")
  }
  const locator = coerceAccountRuntimeKeyLocator(input.locator)
  if (!locator) throw new Error("Account runtime key locator is invalid.")

  const existing = findProfileLinkForPair(
    config.links,
    input.profileId,
    locator,
  )
  if (existing) return { config: null, result: existing }

  const { link } = createProfileLink({
    links: config.links,
    profileId: input.profileId,
    locator,
    linkedBy: input.linkedBy,
    now,
  })
  const next = createNextConfig({
    current: config,
    links: [...config.links, link],
    now,
  })
  return {
    config: next,
    result: next.links.find(({ id }) => id === link.id) ?? link,
  }
}

/** Plan relinkProfile while keeping locator conflicts and tombstones inside the profile transaction. */
export function planApiCredentialProfileRelink(
  config: ApiCredentialProfilesConfig,
  input: ApiCredentialProfileRelinkInput,
  now: number,
) {
  const current = config.links.find(({ id }) => id === input.id)
  if (!current) throw new Error("Credential profile link not found.")
  if (!config.profiles.some(({ id }) => id === input.profileId)) {
    throw new Error("Profile not found.")
  }
  const locator = coerceAccountRuntimeKeyLocator(input.locator)
  if (!locator) throw new Error("Account runtime key locator is invalid.")
  const locatorIdentity = getAccountRuntimeKeyLocatorIdentity(locator)
  const removedLinks = config.links.filter(
    (link) =>
      link.id !== input.id &&
      getAccountRuntimeKeyLocatorIdentity(link.locator) === locatorIdentity,
  )
  const links = config.links
    .filter(
      (link) =>
        link.id === input.id ||
        getAccountRuntimeKeyLocatorIdentity(link.locator) !== locatorIdentity,
    )
    .map((link) =>
      link.id === input.id
        ? {
            ...link,
            profileId: input.profileId,
            locator,
            state: API_CREDENTIAL_PROFILE_LINK_STATES.Active,
            linkedBy: input.linkedBy,
            updatedAt: now,
          }
        : link,
    )
  const next = createNextConfig({
    current: config,
    links,
    linkTombstones: addProfileLinkTombstones(
      config.linkTombstones,
      removedLinks,
      now,
    ),
    now,
  })
  const relinked = next.links.find(({ id }) => id === input.id)
  if (!relinked) throw new Error("Credential profile relink failed.")
  return { config: next, result: relinked }
}

/** Plan unlinkProfile while keeping locator conflicts and tombstones inside the profile transaction. */
export function planApiCredentialProfileUnlink(
  config: ApiCredentialProfilesConfig,
  id: string,
  now: number,
) {
  const removedLinks = config.links.filter((link) => link.id === id)
  const links = config.links.filter((link) => link.id !== id)
  if (links.length === config.links.length)
    return { config: null, result: false }

  const nextConfig = createNextConfig({
    current: config,
    links,
    linkTombstones: addProfileLinkTombstones(
      config.linkTombstones,
      removedLinks,
      now,
    ),
    now,
  })
  return { config: nextConfig, result: true }
}
