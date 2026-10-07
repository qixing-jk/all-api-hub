import { Storage } from "@plasmohq/storage"

import {
  getAccountRuntimeKeyLocatorIdentity,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import {
  API_CREDENTIAL_PROFILE_CAPTURE_STATUSES,
  API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES,
} from "~/services/apiCredentialProfiles/apiCredentialProfileLinkContracts"
import {
  addProfileLinkTombstones,
  coerceAccountRuntimeKeyLocator,
} from "~/services/apiCredentialProfiles/apiCredentialProfileLinkStorage"
import {
  assertDuplicateRequestHeaders,
  cloneConfig,
  clonePersistedValue,
  coerceApiCredentialProfilesConfigWithRemap,
  coerceApiCredentialTelemetryConfig,
  coerceOptionalTimestamp,
  createDefaultConfig,
  createNextConfig,
  createNormalizedProfile,
  dedupeProfiles,
  getIdentityKey,
  isSameTelemetryConfig,
  mergeApiCredentialProfilesConfigsWithRemap,
  normalizeProfileBaseUrl,
  normalizeSourceUrl,
  normalizeTagIdList,
} from "~/services/apiCredentialProfiles/profileConfigCodec"
import { readApiCredentialProfilesConfig } from "~/services/apiCredentialProfiles/profileConfigReader"
import type {
  ApiCredentialProfileCaptureInput,
  ApiCredentialProfileCaptureResult,
  ApiCredentialProfileCreateInput,
  ApiCredentialProfileLinkInput,
  ApiCredentialProfileLinkResolution,
  ApiCredentialProfileRelinkInput,
  ApiCredentialProfileUpdateInput,
} from "~/services/apiCredentialProfiles/profileStorageContracts"
import { coerceTelemetrySnapshot } from "~/services/apiCredentialProfiles/telemetrySnapshotCodec"
import { normalizeHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import {
  API_CREDENTIAL_PROFILES_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import type { VerificationOwnerReconcileInput } from "~/services/verification/verificationResultHistory/storage"
import { verificationResultHistoryStorage } from "~/services/verification/verificationResultHistory/storage"
import type {
  ApiCredentialProfile,
  ApiCredentialProfileLink,
  ApiCredentialProfileLinkSource,
  ApiCredentialProfilesConfig,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_PROFILE_LINK_STATES,
  API_CREDENTIAL_PROFILES_CONFIG_VERSION,
} from "~/types/apiCredentialProfiles"
import { onStorageChanged } from "~/utils/browser/browserApi"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to API credential profiles storage.
 */
const logger = createLogger("ApiCredentialProfilesStorage")

/**
 * Subscribe to local-storage writes affecting API credential profiles.
 */
export function subscribeToApiCredentialProfilesChanges(
  callback: () => void,
): () => void {
  const listener = (
    changes: Record<string, browser.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local") return
    if (
      !changes[API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES]
    ) {
      return
    }

    callback()
  }

  return onStorageChanged(listener)
}

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

/**
 * Propagates profile owner changes to persisted verification results.
 *
 * Called after the profile config is committed, never inside its lock: the
 * verification store takes its own write lock, and nesting the two would widen
 * the critical section (and deadlock if the order ever reversed).
 *
 * Removal and remapping are handed over in one call so the verification store
 * applies them in its own fixed order. Splitting them into two calls would leave
 * the order to whichever promise settled first.
 */
async function reconcileVerificationOwners(
  reconcile: VerificationOwnerReconcileInput,
): Promise<void> {
  const remapProfileIds = new Map<string, string>()
  for (const [from, to] of reconcile.remapProfileIds ?? []) {
    if (from !== to) remapProfileIds.set(from, to)
  }
  const removeProfileIds = Array.from(reconcile.removeProfileIds ?? [])

  if (removeProfileIds.length === 0 && remapProfileIds.size === 0) return

  try {
    await verificationResultHistoryStorage.reconcileOwners({
      removeProfileIds,
      remapProfileIds,
    })
  } catch (error) {
    logger.error(
      "Failed to reconcile verification results for profile change",
      {
        error,
      },
    )
  }
}

class ApiCredentialProfilesStorageService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({ area: "local" })
  }

  private async withStorageWriteLock<T>(work: () => Promise<T>): Promise<T> {
    return withExtensionStorageWriteLock(
      STORAGE_LOCKS.API_CREDENTIAL_PROFILES,
      work,
    )
  }

  private async saveConfig(next: ApiCredentialProfilesConfig): Promise<void> {
    await this.storage.set(
      API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
      next,
    )
  }

  /**
   * Export the persisted profiles config for backup/sync.
   */
  async exportConfig(): Promise<ApiCredentialProfilesConfig> {
    return this.getConfig()
  }

  /**
   * Get the current profiles config with a safe default.
   */
  async getConfig(): Promise<ApiCredentialProfilesConfig> {
    try {
      return await readApiCredentialProfilesConfig()
    } catch (error) {
      logger.error("Failed to load API credential profiles config", error)
      return createDefaultConfig()
    }
  }

  /**
   * Replace the stored config with an imported payload (used by restore flows).
   *
   * The payload is coerced, normalized, and de-duped before persisting.
   */
  async importConfig(raw: unknown): Promise<ApiCredentialProfilesConfig> {
    const { config, profileIdRemap } = await this.withStorageWriteLock(
      async () => {
        const now = Date.now()
        // A replace-import de-dupes the incoming payload, so ids dropped here are
        // merges rather than removals; the remap keeps their results reachable.
        const { config: coerced, profileIdRemap } =
          coerceApiCredentialProfilesConfigWithRemap(raw, { now })
        const next: ApiCredentialProfilesConfig = {
          version: API_CREDENTIAL_PROFILES_CONFIG_VERSION,
          profiles: coerced.profiles,
          links: coerced.links,
          linkTombstones: coerced.linkTombstones,
          lastUpdated: now,
        }
        await this.saveConfig(next)
        return { config: next, profileIdRemap }
      },
    )

    await reconcileVerificationOwners({ remapProfileIds: profileIdRemap })

    return config
  }

  /**
   * Merge an imported payload into the existing config using identity de-dupe.
   */
  async mergeConfig(raw: unknown): Promise<ApiCredentialProfilesConfig> {
    const { config, profileIdRemap } = await this.withStorageWriteLock(
      async () => {
        const now = Date.now()
        const { config: merged, profileIdRemap } =
          mergeApiCredentialProfilesConfigsWithRemap({
            local: await readApiCredentialProfilesConfig(),
            incoming: raw,
            now,
          })

        await this.saveConfig(merged)
        return { config: merged, profileIdRemap }
      },
    )

    await reconcileVerificationOwners({ remapProfileIds: profileIdRemap })

    return config
  }

  /**
   * List profiles in a stable UI-friendly order (updatedAt desc, then name).
   */
  async listProfiles(): Promise<ApiCredentialProfile[]> {
    const config = await this.getConfig()
    return [...config.profiles].sort((a, b) => {
      if (a.updatedAt !== b.updatedAt)
        return (b.updatedAt || 0) - (a.updatedAt || 0)
      return (a.name || "").localeCompare(b.name || "")
    })
  }

  async getProfileById(id: string): Promise<ApiCredentialProfile | null> {
    const config = await this.getConfig()
    return config.profiles.find((p) => p.id === id) ?? null
  }

  async captureProfile(
    input: ApiCredentialProfileCaptureInput,
  ): Promise<ApiCredentialProfileCaptureResult> {
    const now = Date.now()
    const candidateProfile = createNormalizedProfile(input.profile, now)
    const locator = input.locator
      ? coerceAccountRuntimeKeyLocator(input.locator)
      : null
    if (input.locator && !locator) {
      throw new Error("Account runtime key locator is invalid.")
    }

    return this.withStorageWriteLock(async () => {
      const config = cloneConfig(await readApiCredentialProfilesConfig())
      const identityKey = getIdentityKey(candidateProfile)
      const existing = config.profiles.find(
        (profile) => getIdentityKey(profile) === identityKey,
      )
      assertDuplicateRequestHeaders(existing, candidateProfile)
      const sourceUrlChanged =
        existing !== undefined &&
        candidateProfile.sourceUrl !== undefined &&
        candidateProfile.sourceUrl !== existing.sourceUrl
      const profile =
        existing && sourceUrlChanged
          ? {
              ...existing,
              sourceUrl: candidateProfile.sourceUrl,
              updatedAt: now,
            }
          : existing ?? candidateProfile

      const profiles = config.profiles.some(({ id }) => id === profile.id)
        ? config.profiles.map((storedProfile) =>
            storedProfile.id === profile.id ? profile : storedProfile,
          )
        : [...config.profiles, profile]
      if (!locator) {
        await this.saveConfig(
          createNextConfig({ current: config, profiles, now }),
        )
        return {
          status: API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.CapturedUnlinked,
          profile,
        }
      }

      const samePair = findProfileLinkForPair(config.links, profile.id, locator)
      if (samePair) {
        if (sourceUrlChanged) {
          await this.saveConfig(
            createNextConfig({ current: config, profiles, now }),
          )
        }
        return {
          status:
            samePair.state ===
            API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation
              ? API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.AssociationConflict
              : API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.Captured,
          profile,
        }
      }

      const { link, hasLocatorConflict } = createProfileLink({
        links: config.links,
        profileId: profile.id,
        locator,
        linkedBy: input.linkedBy,
        now,
      })
      await this.saveConfig(
        createNextConfig({
          current: config,
          profiles,
          links: [...config.links, link],
          now,
        }),
      )
      return {
        status: hasLocatorConflict
          ? API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.AssociationConflict
          : API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.Captured,
        profile,
      }
    })
  }

  async listLinks(): Promise<ApiCredentialProfileLink[]> {
    const config = await this.getConfig()
    return config.links.map((link) => clonePersistedValue(link))
  }

  async getLinkById(id: string): Promise<ApiCredentialProfileLink | null> {
    const links = await this.listLinks()
    return links.find((link) => link.id === id) ?? null
  }

  async listLinksForProfile(
    profileId: string,
  ): Promise<ApiCredentialProfileLink[]> {
    const links = await this.listLinks()
    return links.filter((link) => link.profileId === profileId)
  }

  async findLinksForLocator(
    locator: AccountRuntimeKeyLocator,
  ): Promise<ApiCredentialProfileLink[]> {
    const locatorIdentity = getAccountRuntimeKeyLocatorIdentity(locator)
    const links = await this.listLinks()
    return links.filter(
      (link) =>
        getAccountRuntimeKeyLocatorIdentity(link.locator) === locatorIdentity,
    )
  }

  async resolveLink(
    locator: AccountRuntimeKeyLocator,
  ): Promise<ApiCredentialProfileLinkResolution> {
    const links = await this.findLinksForLocator(locator)
    const [link] = links
    if (!link) {
      return {
        status: API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.NotFound,
      }
    }
    if (links.length > 1) {
      return {
        status: API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Ambiguous,
        links,
      }
    }

    if (link.state !== API_CREDENTIAL_PROFILE_LINK_STATES.Active) {
      return {
        status:
          API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.NeedsConfirmation,
        links,
      }
    }
    const profile = await this.getProfileById(link.profileId)
    return profile
      ? {
          status: API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Resolved,
          link,
          profile,
        }
      : { status: API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES.Stale }
  }

  async linkProfile(
    input: ApiCredentialProfileLinkInput,
  ): Promise<ApiCredentialProfileLink> {
    return this.withStorageWriteLock(async () => {
      const now = Date.now()
      const config = cloneConfig(await readApiCredentialProfilesConfig())
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
      if (existing) return existing

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
      await this.saveConfig(next)
      return next.links.find(({ id }) => id === link.id) ?? link
    })
  }

  async relinkProfile(
    input: ApiCredentialProfileRelinkInput,
  ): Promise<ApiCredentialProfileLink> {
    return this.withStorageWriteLock(async () => {
      const now = Date.now()
      const config = cloneConfig(await readApiCredentialProfilesConfig())
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
            getAccountRuntimeKeyLocatorIdentity(link.locator) !==
              locatorIdentity,
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
      await this.saveConfig(next)
      const relinked = next.links.find(({ id }) => id === input.id)
      if (!relinked) throw new Error("Credential profile relink failed.")
      return relinked
    })
  }

  async unlinkProfile(id: string): Promise<boolean> {
    return this.withStorageWriteLock(async () => {
      const config = cloneConfig(await readApiCredentialProfilesConfig())
      const removedLinks = config.links.filter((link) => link.id === id)
      const links = config.links.filter((link) => link.id !== id)
      if (links.length === config.links.length) return false
      const now = Date.now()
      await this.saveConfig(
        createNextConfig({
          current: config,
          links,
          linkTombstones: addProfileLinkTombstones(
            config.linkTombstones,
            removedLinks,
            now,
          ),
          now,
        }),
      )
      return true
    })
  }

  /**
   * Create a new profile. If an identical profile already exists (same apiType,
   * normalized baseUrl, and apiKey), it is returned instead.
   */
  async createProfile(
    input: ApiCredentialProfileCreateInput,
  ): Promise<ApiCredentialProfile> {
    return (await this.createProfileWithCreationStatus(input)).profile
  }

  /** Reports creation ownership under the identity lock for safe rollback. */
  async createProfileWithCreationStatus(
    input: ApiCredentialProfileCreateInput,
  ): Promise<{ profile: ApiCredentialProfile; isNew: boolean }> {
    const now = Date.now()
    const nextProfile = createNormalizedProfile(input, now)

    const { created, isNew, profileIdRemap } = await this.withStorageWriteLock(
      async () => {
        const config = cloneConfig(await readApiCredentialProfilesConfig())

        const identityKey = getIdentityKey(nextProfile)
        const existing = config.profiles.find(
          (p) => getIdentityKey(p) === identityKey,
        )
        if (existing) {
          assertDuplicateRequestHeaders(existing, nextProfile)
          const profile =
            nextProfile.sourceUrl !== undefined &&
            nextProfile.sourceUrl !== existing.sourceUrl
              ? {
                  ...existing,
                  sourceUrl: nextProfile.sourceUrl,
                  updatedAt: now,
                }
              : existing
          if (profile !== existing) {
            await this.saveConfig(
              createNextConfig({
                current: config,
                profiles: config.profiles.map((p) =>
                  p.id === existing.id ? profile : p,
                ),
                now,
              }),
            )
          }
          return { created: profile, isNew: false, profileIdRemap: null }
        }

        const { profiles: dedupedProfiles, profileIdRemap } = dedupeProfiles([
          ...(Array.isArray(config.profiles) ? config.profiles : []),
          nextProfile,
        ])

        const nextConfig = createNextConfig({
          current: config,
          profiles: dedupedProfiles,
          now,
        })

        await this.saveConfig(nextConfig)
        return { created: nextProfile, isNew: true, profileIdRemap }
      },
    )

    if (profileIdRemap) {
      await reconcileVerificationOwners({ remapProfileIds: profileIdRemap })
    }

    return { profile: created, isNew }
  }

  /**
   * Update an existing profile by id.
   *
   * If the updated profile conflicts by identity (apiType + baseUrl + apiKey),
   * profiles are de-duped by keeping the one with the newest updatedAt and
   * unioning tag ids.
   */
  async updateProfile(
    id: string,
    updates: ApiCredentialProfileUpdateInput,
  ): Promise<ApiCredentialProfile> {
    const { profile, hasRequestContextChanged, profileIdRemap } =
      await this.withStorageWriteLock(async () => {
        const config = cloneConfig(await readApiCredentialProfilesConfig())
        const profiles = Array.isArray(config.profiles) ? config.profiles : []
        const current = profiles.find((p) => p.id === id)
        if (!current) {
          throw new Error("Profile not found.")
        }

        const nextName =
          typeof updates.name === "string" ? updates.name.trim() : current.name
        if (!nextName) {
          throw new Error("Profile name cannot be empty.")
        }

        const nextApiKey =
          typeof updates.apiKey === "string"
            ? updates.apiKey.trim()
            : current.apiKey
        if (!nextApiKey) {
          throw new Error("API key cannot be empty.")
        }

        const nextApiType =
          typeof updates.apiType === "string"
            ? updates.apiType
            : current.apiType

        const rawBaseUrl =
          typeof updates.baseUrl === "string"
            ? updates.baseUrl
            : current.baseUrl
        const nextBaseUrl = normalizeProfileBaseUrl(nextApiType, rawBaseUrl)
        if (!nextBaseUrl) {
          throw new Error("Base URL is invalid.")
        }

        const shouldReCoerceTelemetryConfig =
          updates.telemetryConfig !== undefined ||
          nextApiType !== current.apiType ||
          nextBaseUrl !== current.baseUrl
        const currentTelemetryConfig = coerceApiCredentialTelemetryConfig(
          current.telemetryConfig,
          { baseUrl: current.baseUrl },
        )
        const nextTelemetryConfig = shouldReCoerceTelemetryConfig
          ? coerceApiCredentialTelemetryConfig(
              updates.telemetryConfig !== undefined
                ? updates.telemetryConfig
                : current.telemetryConfig,
              { baseUrl: nextBaseUrl },
            )
          : currentTelemetryConfig
        const hasTelemetryConfigChanged = !isSameTelemetryConfig(
          nextTelemetryConfig,
          currentTelemetryConfig,
        )
        const nextRequestHeaders = normalizeHeaderOverrides(
          updates.requestHeaders ?? current.requestHeaders,
        )
        const hasRequestHeadersChanged =
          JSON.stringify(nextRequestHeaders) !==
          JSON.stringify(normalizeHeaderOverrides(current.requestHeaders))
        const nextExpiresAt =
          updates.expiresAt !== undefined
            ? coerceOptionalTimestamp(updates.expiresAt)
            : current.expiresAt
        const { expiresAt: _currentExpiresAt, ...currentWithoutExpiresAt } =
          current

        const next: ApiCredentialProfile = {
          ...currentWithoutExpiresAt,
          name: nextName,
          apiType: nextApiType,
          baseUrl: nextBaseUrl,
          apiKey: nextApiKey,
          ...(updates.requestHeaders !== undefined || current.requestHeaders
            ? { requestHeaders: nextRequestHeaders }
            : {}),
          tagIds:
            updates.tagIds !== undefined
              ? normalizeTagIdList(updates.tagIds)
              : current.tagIds,
          notes:
            typeof updates.notes === "string"
              ? updates.notes.trim()
              : current.notes,
          ...(typeof updates.sourceUrl === "string"
            ? {
                sourceUrl:
                  updates.sourceUrl.trim() === ""
                    ? undefined
                    : normalizeSourceUrl(updates.sourceUrl) ??
                      current.sourceUrl,
              }
            : {}),
          ...(nextExpiresAt !== undefined ? { expiresAt: nextExpiresAt } : {}),
          telemetryConfig: nextTelemetryConfig,
          telemetrySnapshot:
            nextApiType !== current.apiType ||
            nextBaseUrl !== current.baseUrl ||
            nextApiKey !== current.apiKey ||
            hasTelemetryConfigChanged ||
            hasRequestHeadersChanged
              ? undefined
              : current.telemetrySnapshot,
          updatedAt: Date.now(),
        }

        const merged = profiles.map((p) => (p.id === id ? next : p))
        const { profiles: dedupedProfiles, profileIdRemap } =
          dedupeProfiles(merged)
        const hasCredentialIdentityChanged =
          nextApiType !== current.apiType ||
          nextBaseUrl !== current.baseUrl ||
          nextApiKey !== current.apiKey
        const links = config.links.map((link) => ({
          ...link,
          profileId: profileIdRemap.get(link.profileId) ?? link.profileId,
          state:
            hasCredentialIdentityChanged && link.profileId === id
              ? API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation
              : link.state,
        }))
        const nextConfig = createNextConfig({
          current: config,
          profiles: dedupedProfiles,
          links,
          now: Date.now(),
        })

        await this.saveConfig(nextConfig)

        const resolveSaved = (): ApiCredentialProfile => {
          const saved = dedupedProfiles.find((p) => p.id === id)
          if (saved) {
            return saved
          }

          // If dedupe merged this profile into another identity twin, return the
          // newest profile for that identity.
          const identityKey = getIdentityKey(next)
          const winner = dedupedProfiles.find(
            (p) => getIdentityKey(p) === identityKey,
          )
          if (winner) {
            return winner
          }

          return next
        }

        return {
          profile: resolveSaved(),
          hasRequestContextChanged:
            hasCredentialIdentityChanged || hasRequestHeadersChanged,
          profileIdRemap,
        }
      })

    // A credential edit invalidates this profile's own results, while any twin
    // merged into it was measured with the new credentials and must survive. Both
    // are handed over in one call so the verification store removes before it
    // remaps; doing it in two calls would lose the twin's results.
    await reconcileVerificationOwners({
      removeProfileIds: hasRequestContextChanged ? [id] : [],
      remapProfileIds: profileIdRemap,
    })

    return profile
  }

  /**
   * Persist the latest read-only telemetry query snapshot for a profile.
   */
  async updateTelemetrySnapshot(
    id: string,
    snapshot: ApiCredentialTelemetrySnapshot,
    expectedProfile?: ApiCredentialProfile,
  ): Promise<ApiCredentialProfile> {
    return this.withStorageWriteLock(async () => {
      const config = cloneConfig(await readApiCredentialProfilesConfig())
      const profiles = Array.isArray(config.profiles) ? config.profiles : []
      const current = profiles.find((profile) => profile.id === id)
      if (!current) {
        throw new Error("Profile not found.")
      }

      if (
        expectedProfile &&
        (getIdentityKey(current) !== getIdentityKey(expectedProfile) ||
          JSON.stringify(normalizeHeaderOverrides(current.requestHeaders)) !==
            JSON.stringify(
              normalizeHeaderOverrides(expectedProfile.requestHeaders),
            ) ||
          !isSameTelemetryConfig(
            coerceApiCredentialTelemetryConfig(current.telemetryConfig),
            coerceApiCredentialTelemetryConfig(expectedProfile.telemetryConfig),
          ))
      )
        return current

      const telemetrySnapshot = coerceTelemetrySnapshot(snapshot)
      if (!telemetrySnapshot) {
        throw new Error("Invalid telemetry snapshot.")
      }

      const nextProfile: ApiCredentialProfile = {
        ...current,
        telemetrySnapshot,
      }

      const nextProfiles = profiles.map((profile) =>
        profile.id === id ? nextProfile : profile,
      )

      await this.saveConfig(
        createNextConfig({
          current: config,
          profiles: nextProfiles,
          now: Date.now(),
        }),
      )

      return nextProfile
    })
  }

  /**
   * Remove a tag id from all profiles.
   *
   * This is primarily used by global tag deletion logic to maintain referential
   * integrity across taggable entities.
   */
  async removeTagIdFromAllProfiles(
    tagId: string,
  ): Promise<{ updatedProfiles: number }> {
    const normalizedTagId = String(tagId ?? "").trim()
    if (!normalizedTagId) {
      return { updatedProfiles: 0 }
    }

    const { result, profileIdRemap } = await this.withStorageWriteLock(
      async () => {
        const now = Date.now()
        const config = cloneConfig(await readApiCredentialProfilesConfig())
        const profiles = Array.isArray(config.profiles) ? config.profiles : []

        let updatedProfiles = 0
        const nextProfiles = profiles.map((profile) => {
          if (!Array.isArray(profile.tagIds) || profile.tagIds.length === 0) {
            return profile
          }
          if (!profile.tagIds.includes(normalizedTagId)) {
            return profile
          }

          updatedProfiles++
          return {
            ...profile,
            tagIds: profile.tagIds.filter((id) => id !== normalizedTagId),
            updatedAt: now,
          }
        })

        if (updatedProfiles === 0) {
          return { result: { updatedProfiles: 0 }, profileIdRemap: null }
        }

        const { profiles: dedupedProfiles, profileIdRemap } =
          dedupeProfiles(nextProfiles)
        const links = config.links.map((link) => ({
          ...link,
          profileId: profileIdRemap.get(link.profileId) ?? link.profileId,
        }))

        await this.saveConfig(
          createNextConfig({
            current: config,
            profiles: dedupedProfiles,
            links,
            now,
          }),
        )

        return { result: { updatedProfiles }, profileIdRemap }
      },
    )

    if (profileIdRemap) {
      await reconcileVerificationOwners({ remapProfileIds: profileIdRemap })
    }

    return result
  }

  /**
   * Delete a profile by id.
   */
  async deleteProfile(id: string): Promise<boolean> {
    const deleted = await this.withStorageWriteLock(async () => {
      const config = cloneConfig(await readApiCredentialProfilesConfig())
      const profiles = Array.isArray(config.profiles) ? config.profiles : []
      const filtered = profiles.filter((p) => p.id !== id)
      if (filtered.length === profiles.length) {
        return false
      }
      const now = Date.now()

      await this.saveConfig(
        createNextConfig({
          current: config,
          profiles: filtered,
          links: config.links.filter((link) => link.profileId !== id),
          linkTombstones: addProfileLinkTombstones(
            config.linkTombstones,
            config.links.filter((link) => link.profileId === id),
            now,
          ),
          now,
        }),
      )
      return true
    })

    if (deleted) {
      await reconcileVerificationOwners({ removeProfileIds: [id] })
    }

    return deleted
  }

  /**
   * Clear all stored profiles (test helper).
   */
  async clearAllData(): Promise<void> {
    await this.storage.remove(
      API_CREDENTIAL_PROFILES_STORAGE_KEYS.API_CREDENTIAL_PROFILES,
    )
  }
}

export const apiCredentialProfilesStorage =
  new ApiCredentialProfilesStorageService()
