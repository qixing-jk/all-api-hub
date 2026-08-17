import { isAccountSiteType } from "~/constants/siteType"
import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  getAccountRuntimeKeyLocatorIdentity,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import type {
  ApiCredentialProfileLink,
  ApiCredentialProfileLinkSource,
  ApiCredentialProfileLinkState,
  ApiCredentialProfileLinkTombstone,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_PROFILE_LINK_SOURCES,
  API_CREDENTIAL_PROFILE_LINK_STATES,
} from "~/types/apiCredentialProfiles"
import { safeRandomUUID } from "~/utils/core/identifier"

const normalizeRequiredString = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized || null
}

const coerceNonNegativeTimestamp = (
  value: unknown,
  fallback: number,
): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback

const isProfileLinkState = (
  value: unknown,
): value is ApiCredentialProfileLinkState =>
  Object.values(API_CREDENTIAL_PROFILE_LINK_STATES).some(
    (state) => state === value,
  )

const isProfileLinkSource = (
  value: unknown,
): value is ApiCredentialProfileLinkSource =>
  Object.values(API_CREDENTIAL_PROFILE_LINK_SOURCES).some(
    (source) => source === value,
  )

const mergeProfileLinkState = (
  first: ApiCredentialProfileLinkState,
  second: ApiCredentialProfileLinkState,
  hasDivergentEvidence = false,
): ApiCredentialProfileLinkState =>
  hasDivergentEvidence ||
  first === API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation ||
  second === API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation
    ? API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation
    : API_CREDENTIAL_PROFILE_LINK_STATES.Active

/** Coerces persisted locator metadata without accepting secret-bearing fields. */
export function coerceAccountRuntimeKeyLocator(
  raw: unknown,
): AccountRuntimeKeyLocator | null {
  if (!raw || typeof raw !== "object") return null
  const candidate = raw as Record<string, unknown>

  if (candidate.source === ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken) {
    const accountId = normalizeRequiredString(candidate.accountId)
    const tokenId = candidate.tokenId
    if (
      !accountId ||
      !isAccountSiteType(candidate.siteType) ||
      typeof tokenId !== "number" ||
      !Number.isSafeInteger(tokenId) ||
      tokenId <= 0
    ) {
      return null
    }
    return {
      source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
      accountId,
      siteType: candidate.siteType,
      tokenId,
    }
  }

  if (candidate.source === ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource) {
    const rawRef = candidate.ref
    if (!rawRef || typeof rawRef !== "object") return null
    const ref = rawRef as Record<string, unknown>
    const accountId = normalizeRequiredString(ref.accountId)
    const scopeKey = normalizeRequiredString(ref.scopeKey)
    const resourceId = normalizeRequiredString(ref.resourceId)
    if (
      !accountId ||
      !isAccountSiteType(ref.siteType) ||
      !scopeKey ||
      !resourceId
    ) {
      return null
    }
    return {
      source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
      ref: {
        accountId,
        siteType: ref.siteType,
        scopeKey,
        resourceId,
      },
    }
  }

  if (candidate.source === ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential) {
    const accountId = normalizeRequiredString(candidate.accountId)
    const service = normalizeRequiredString(candidate.service)
    if (!accountId || !isAccountSiteType(candidate.siteType) || !service) {
      return null
    }
    return {
      source: ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential,
      accountId,
      siteType: candidate.siteType,
      service,
    }
  }

  return null
}

export const normalizeProfileLinks = (
  links: ApiCredentialProfileLink[],
  validProfileIds: ReadonlySet<string>,
  tombstones: readonly ApiCredentialProfileLinkTombstone[] = [],
): ApiCredentialProfileLink[] => {
  const deletedAtById = new Map(
    tombstones.map(({ id, deletedAt }) => [id, deletedAt]),
  )
  const byId = new Map<string, ApiCredentialProfileLink>()
  for (const link of links) {
    if ((deletedAtById.get(link.id) ?? -Infinity) >= link.updatedAt) continue
    const existing = byId.get(link.id)
    if (!existing || link.updatedAt > existing.updatedAt) {
      byId.set(link.id, link)
      continue
    }
    if (link.updatedAt !== existing.updatedAt) continue

    const existingRevision = JSON.stringify([
      existing.profileId,
      getAccountRuntimeKeyLocatorIdentity(existing.locator),
      existing.linkedBy,
    ])
    const incomingRevision = JSON.stringify([
      link.profileId,
      getAccountRuntimeKeyLocatorIdentity(link.locator),
      link.linkedBy,
    ])
    const revisionsDiverged = existingRevision !== incomingRevision
    const selected = incomingRevision > existingRevision ? link : existing
    byId.set(link.id, {
      ...selected,
      state: mergeProfileLinkState(
        existing.state,
        link.state,
        revisionsDiverged,
      ),
      createdAt: Math.min(link.createdAt, existing.createdAt),
    })
  }

  const byPair = new Map<string, ApiCredentialProfileLink>()
  for (const link of byId.values()) {
    if (!validProfileIds.has(link.profileId)) continue
    const pairKey = JSON.stringify([
      getAccountRuntimeKeyLocatorIdentity(link.locator),
      link.profileId,
    ])
    const existing = byPair.get(pairKey)
    if (!existing) {
      byPair.set(pairKey, link)
      continue
    }

    const newer = link.updatedAt >= existing.updatedAt ? link : existing
    byPair.set(pairKey, {
      ...newer,
      state: mergeProfileLinkState(existing.state, link.state),
      createdAt: Math.min(link.createdAt, existing.createdAt),
    })
  }

  const deduped = Array.from(byPair.values())
  const locatorCounts = new Map<string, number>()
  for (const link of deduped) {
    const locatorIdentity = getAccountRuntimeKeyLocatorIdentity(link.locator)
    locatorCounts.set(
      locatorIdentity,
      (locatorCounts.get(locatorIdentity) ?? 0) + 1,
    )
  }

  return deduped.map((link) => {
    const locatorIdentity = getAccountRuntimeKeyLocatorIdentity(link.locator)
    const hasConflict = (locatorCounts.get(locatorIdentity) ?? 0) > 1
    return hasConflict &&
      link.state !== API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation
      ? {
          ...link,
          state: API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation,
        }
      : link
  })
}

export const coerceProfileLinkTombstones = (
  raw: unknown,
): ApiCredentialProfileLinkTombstone[] => {
  const byId = new Map<string, ApiCredentialProfileLinkTombstone>()
  if (!Array.isArray(raw)) return []

  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const candidate = item as Record<string, unknown>
    const id = normalizeRequiredString(candidate.id)
    if (
      !id ||
      typeof candidate.deletedAt !== "number" ||
      !Number.isFinite(candidate.deletedAt) ||
      candidate.deletedAt < 0
    ) {
      continue
    }
    const existing = byId.get(id)
    if (!existing || candidate.deletedAt > existing.deletedAt) {
      byId.set(id, { id, deletedAt: candidate.deletedAt })
    }
  }
  return Array.from(byId.values())
}

export const addProfileLinkTombstones = (
  current: readonly ApiCredentialProfileLinkTombstone[],
  removedLinks: readonly ApiCredentialProfileLink[],
  deletedAt: number,
): ApiCredentialProfileLinkTombstone[] =>
  coerceProfileLinkTombstones([
    ...current,
    ...removedLinks.map(({ id, updatedAt }) => ({
      id,
      deletedAt: Math.max(deletedAt, updatedAt),
    })),
  ])

export const coerceProfileLinks = (params: {
  raw: unknown
  profileIdRemap: ReadonlyMap<string, string>
  now: number
}): ApiCredentialProfileLink[] => {
  const links: ApiCredentialProfileLink[] = []
  const rawLinks = Array.isArray(params.raw) ? params.raw : []

  for (const item of rawLinks) {
    if (!item || typeof item !== "object") continue
    const candidate = item as Record<string, unknown>
    const rawProfileId = normalizeRequiredString(candidate.profileId)
    const profileId = rawProfileId
      ? params.profileIdRemap.get(rawProfileId)
      : undefined
    const locator = coerceAccountRuntimeKeyLocator(candidate.locator)
    if (!profileId || !locator) continue

    const id =
      normalizeRequiredString(candidate.id) ??
      safeRandomUUID("api-profile-link")
    const state = isProfileLinkState(candidate.state)
      ? candidate.state
      : API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation
    const linkedBy = isProfileLinkSource(candidate.linkedBy)
      ? candidate.linkedBy
      : API_CREDENTIAL_PROFILE_LINK_SOURCES.User
    const createdAt = coerceNonNegativeTimestamp(
      candidate.createdAt,
      params.now,
    )
    const updatedAt = coerceNonNegativeTimestamp(candidate.updatedAt, createdAt)

    links.push({
      id,
      profileId,
      locator,
      state,
      linkedBy,
      createdAt,
      updatedAt,
    })
  }

  return links
}
