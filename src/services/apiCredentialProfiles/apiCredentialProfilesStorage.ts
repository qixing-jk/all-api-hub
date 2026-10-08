import { Storage } from "@plasmohq/storage"

import {
  getAccountRuntimeKeyLocatorIdentity,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import { API_CREDENTIAL_PROFILE_LINK_RESOLUTION_STATUSES } from "~/services/apiCredentialProfiles/apiCredentialProfileLinkContracts"
import {
  addProfileLinkTombstones,
  coerceAccountRuntimeKeyLocator,
} from "~/services/apiCredentialProfiles/apiCredentialProfileLinkStorage"
import {
  planApiCredentialProfileCapture,
  planApiCredentialProfileLink,
  planApiCredentialProfileRelink,
  planApiCredentialProfileUnlink,
} from "~/services/apiCredentialProfiles/profileAssociationPlan"
import {
  cloneConfig,
  clonePersistedValue,
  coerceApiCredentialProfilesConfigWithRemap,
  coerceApiCredentialTelemetryConfig,
  createDefaultConfig,
  createNextConfig,
  createNormalizedProfile,
  dedupeProfiles,
  getIdentityKey,
  isSameTelemetryConfig,
  mergeApiCredentialProfilesConfigsWithRemap,
} from "~/services/apiCredentialProfiles/profileConfigCodec"
import { readApiCredentialProfilesConfig } from "~/services/apiCredentialProfiles/profileConfigReader"
import { planApiCredentialProfileCreation } from "~/services/apiCredentialProfiles/profileCreationPlan"
import type {
  ApiCredentialProfileCaptureInput,
  ApiCredentialProfileCaptureResult,
  ApiCredentialProfileCreateInput,
  ApiCredentialProfileLinkInput,
  ApiCredentialProfileLinkResolution,
  ApiCredentialProfileRelinkInput,
  ApiCredentialProfileUpdateInput,
} from "~/services/apiCredentialProfiles/profileStorageContracts"
import { planApiCredentialProfileUpdate } from "~/services/apiCredentialProfiles/profileUpdatePlan"
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
  ApiCredentialProfilesConfig,
  ApiCredentialTelemetrySnapshot,
} from "~/types/apiCredentialProfiles"
import {
  API_CREDENTIAL_PROFILE_LINK_STATES,
  API_CREDENTIAL_PROFILES_CONFIG_VERSION,
} from "~/types/apiCredentialProfiles"
import { onStorageChanged } from "~/utils/browser/browserApi"
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
      const plan = planApiCredentialProfileCapture(
        config,
        candidateProfile,
        locator,
        input.linkedBy,
        now,
      )
      if (plan.config) await this.saveConfig(plan.config)
      return plan.result
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
      const plan = planApiCredentialProfileLink(config, input, now)
      if (plan.config) await this.saveConfig(plan.config)
      return plan.result
    })
  }

  async relinkProfile(
    input: ApiCredentialProfileRelinkInput,
  ): Promise<ApiCredentialProfileLink> {
    return this.withStorageWriteLock(async () => {
      const now = Date.now()
      const config = cloneConfig(await readApiCredentialProfilesConfig())
      const plan = planApiCredentialProfileRelink(config, input, now)
      if (plan.config) await this.saveConfig(plan.config)
      return plan.result
    })
  }

  async unlinkProfile(id: string): Promise<boolean> {
    return this.withStorageWriteLock(async () => {
      const config = cloneConfig(await readApiCredentialProfilesConfig())
      const plan = planApiCredentialProfileUnlink(config, id, Date.now())
      if (plan.config) await this.saveConfig(plan.config)
      return plan.result
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
    const plan = await this.withStorageWriteLock(async () => {
      const config = cloneConfig(await readApiCredentialProfilesConfig())
      const plan = planApiCredentialProfileCreation(config, nextProfile, now)
      if (plan.config) await this.saveConfig(plan.config)
      return plan
    })
    if (plan.profileIdRemap)
      await reconcileVerificationOwners({
        remapProfileIds: plan.profileIdRemap,
      })
    return plan.result
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
    const { profile, reconciliation } = await this.withStorageWriteLock(
      async () => {
        const config = cloneConfig(await readApiCredentialProfilesConfig())
        const plan = planApiCredentialProfileUpdate(config, id, updates)
        await this.saveConfig(plan.config)
        return plan
      },
    )

    // A credential edit invalidates this profile's own results, while any twin
    // merged into it was measured with the new credentials and must survive. Both
    // are handed over in one call so the verification store removes before it
    // remaps; doing it in two calls would lose the twin's results.
    await reconcileVerificationOwners(reconciliation)

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
