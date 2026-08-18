import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { apiCredentialProfileLinks } from "~/services/apiCredentialProfiles/apiCredentialProfileLinks"
import {
  apiCredentialProfilesStorage,
  coerceApiCredentialProfilesConfig,
  mergeApiCredentialProfilesConfigs,
} from "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { SiteHealthStatus } from "~/types"
import type {
  ApiCredentialProfile,
  ApiCredentialProfilesConfig,
} from "~/types/apiCredentialProfiles"

const storageData = new Map<string, unknown>()

vi.mock("@plasmohq/storage", () => {
  class Storage {
    async set(key: string, value: unknown) {
      storageData.set(key, value)
    }

    async get(key: string) {
      return storageData.get(key)
    }

    async remove(key: string) {
      storageData.delete(key)
    }
  }

  return { Storage }
})

const createPersistedProfile = (
  overrides: Partial<ApiCredentialProfile> & Pick<ApiCredentialProfile, "id">,
): ApiCredentialProfile => {
  const { id, ...rest } = overrides
  return {
    id,
    name: "Example profile",
    apiType: API_TYPES.OPENAI_COMPATIBLE,
    baseUrl: "https://api.example.invalid",
    apiKey: "sk-example-secret",
    tagIds: [],
    notes: "",
    createdAt: 1,
    updatedAt: 1,
    ...rest,
  }
}

describe("apiCredentialProfileLinks", () => {
  beforeEach(async () => {
    storageData.clear()
    await apiCredentialProfilesStorage.clearAllData()
  })

  it("captures a credential profile and its account runtime key locator atomically", async () => {
    const result = await apiCredentialProfileLinks.capture({
      profile: {
        name: "Example key",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://api.example.invalid/v1",
        apiKey: "sk-example-secret",
      },
      locator: {
        source: "account_key_resource",
        ref: {
          accountId: "account-example",
          siteType: SITE_TYPES.OPENROUTER,
          scopeKey: "workspace-example",
          resourceId: "resource-example",
        },
      },
      linkedBy: "creation-response",
    })

    expect(result.status).toBe("captured")
    const [link] = await apiCredentialProfileLinks.listForProfile(
      result.profile.id,
    )
    expect(link).toEqual(
      expect.objectContaining({
        profileId: result.profile.id,
        state: "active",
        linkedBy: "creation-response",
      }),
    )

    await expect(apiCredentialProfilesStorage.getConfig()).resolves.toEqual(
      expect.objectContaining({
        version: 5,
        profiles: [expect.objectContaining({ id: result.profile.id })],
        links: [expect.objectContaining({ id: link?.id })],
      }),
    )
  })

  it("resolves the credential only through one active locator association", async () => {
    const locator = {
      source: "account_token" as const,
      accountId: "account-example",
      siteType: SITE_TYPES.NEW_API,
      tokenId: 42,
    }
    const captured = await apiCredentialProfileLinks.capture({
      profile: {
        name: "Resolvable key",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://api.example.invalid",
        apiKey: "sk-resolvable-secret",
      },
      locator,
      linkedBy: "resolved-runtime-key",
    })

    await expect(apiCredentialProfileLinks.resolve(locator)).resolves.toEqual({
      status: "resolved",
      link: expect.objectContaining({ profileId: captured.profile.id }),
      profile: expect.objectContaining({
        id: captured.profile.id,
        apiKey: "sk-resolvable-secret",
      }),
    })
  })

  it("allows one credential profile to resolve from multiple remote resources", async () => {
    const profile = {
      name: "Shared credential",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://api.example.invalid",
      apiKey: "sk-shared-secret",
    }
    const firstLocator = {
      source: "account_token" as const,
      accountId: "account-example",
      siteType: SITE_TYPES.NEW_API,
      tokenId: 1,
    }
    const secondLocator = {
      source: "account_token" as const,
      accountId: "account-example",
      siteType: SITE_TYPES.NEW_API,
      tokenId: 2,
    }

    const first = await apiCredentialProfileLinks.capture({
      profile,
      locator: firstLocator,
      linkedBy: "resolved-runtime-key",
    })
    const second = await apiCredentialProfileLinks.capture({
      profile,
      locator: secondLocator,
      linkedBy: "resolved-runtime-key",
    })

    expect(first.status).toBe("captured")
    expect(second.status).toBe("captured")
    await expect(
      apiCredentialProfileLinks.listForProfile(first.profile.id),
    ).resolves.toEqual([
      expect.objectContaining({ state: "active", locator: firstLocator }),
      expect.objectContaining({ state: "active", locator: secondLocator }),
    ])
    await expect(
      apiCredentialProfileLinks.resolve(firstLocator),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "resolved",
        profile: expect.objectContaining({ id: first.profile.id }),
      }),
    )
    await expect(
      apiCredentialProfileLinks.resolve(secondLocator),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "resolved",
        profile: expect.objectContaining({ id: first.profile.id }),
      }),
    )
  })

  it("fails closed when one locator is captured for different credentials", async () => {
    const locator = {
      source: "service_credential" as const,
      accountId: "account-example",
      siteType: SITE_TYPES.NEW_API,
      service: "example-service",
    }
    const first = await apiCredentialProfileLinks.capture({
      profile: {
        name: "First key",
        apiType: API_TYPES.ANTHROPIC,
        baseUrl: "https://first.example.invalid",
        apiKey: "sk-first-secret",
      },
      locator,
      linkedBy: "resolved-runtime-key",
    })
    const second = await apiCredentialProfileLinks.capture({
      profile: {
        name: "Second key",
        apiType: API_TYPES.ANTHROPIC,
        baseUrl: "https://second.example.invalid",
        apiKey: "sk-second-secret",
      },
      locator,
      linkedBy: "resolved-runtime-key",
    })

    expect(first.status).toBe("captured")
    expect(second.status).toBe("association-conflict")
    await expect(
      apiCredentialProfileLinks.capture({
        profile: {
          name: "Second key",
          apiType: API_TYPES.ANTHROPIC,
          baseUrl: "https://second.example.invalid",
          apiKey: "sk-second-secret",
        },
        locator,
        linkedBy: "resolved-runtime-key",
      }),
    ).resolves.toEqual(
      expect.objectContaining({ status: "association-conflict" }),
    )
    await expect(
      apiCredentialProfileLinks.findForLocator(locator),
    ).resolves.toEqual([
      expect.objectContaining({ state: "needs-confirmation" }),
      expect.objectContaining({ state: "needs-confirmation" }),
    ])
    await expect(apiCredentialProfileLinks.resolve(locator)).resolves.toEqual(
      expect.objectContaining({ status: "ambiguous" }),
    )
  })

  it("lets an explicit relink replace a conflicting association and then unlink it", async () => {
    const firstProfile = await apiCredentialProfilesStorage.createProfile({
      name: "First profile",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://first.example.invalid",
      apiKey: "sk-first-profile",
    })
    const secondProfile = await apiCredentialProfilesStorage.createProfile({
      name: "Second profile",
      apiType: API_TYPES.OPENAI_COMPATIBLE,
      baseUrl: "https://second.example.invalid",
      apiKey: "sk-second-profile",
    })
    const locator = {
      source: "account_token" as const,
      accountId: "account-example",
      siteType: SITE_TYPES.NEW_API,
      tokenId: 7,
    }

    const firstLink = await apiCredentialProfileLinks.link({
      profileId: firstProfile.id,
      locator,
      linkedBy: "user",
    })
    const secondLink = await apiCredentialProfileLinks.link({
      profileId: secondProfile.id,
      locator,
      linkedBy: "user",
    })
    expect(firstLink.state).toBe("active")
    expect(secondLink.state).toBe("needs-confirmation")

    const relinked = await apiCredentialProfileLinks.relink({
      id: secondLink.id,
      profileId: secondProfile.id,
      locator,
      linkedBy: "user",
    })

    expect(relinked.state).toBe("active")
    await expect(
      apiCredentialProfileLinks.getById(firstLink.id),
    ).resolves.toBeNull()
    await expect(apiCredentialProfileLinks.resolve(locator)).resolves.toEqual(
      expect.objectContaining({
        status: "resolved",
        profile: expect.objectContaining({ id: secondProfile.id }),
      }),
    )
    await expect(apiCredentialProfileLinks.unlink(relinked.id)).resolves.toBe(
      true,
    )
    await expect(apiCredentialProfileLinks.list()).resolves.toEqual([])
    await expect(apiCredentialProfilesStorage.getConfig()).resolves.toEqual(
      expect.objectContaining({
        linkTombstones: expect.arrayContaining([
          expect.objectContaining({ id: firstLink.id }),
          expect.objectContaining({ id: relinked.id }),
        ]),
      }),
    )
  })

  it("preserves links for metadata edits, downgrades protocol or key edits, and cascades profile deletion", async () => {
    const locator = {
      source: "account_token" as const,
      accountId: "account-example",
      siteType: SITE_TYPES.NEW_API,
      tokenId: 9,
    }
    const captured = await apiCredentialProfileLinks.capture({
      profile: {
        name: "Lifecycle profile",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://api.example.invalid",
        apiKey: "sk-lifecycle-secret",
      },
      locator,
      linkedBy: "creation-response",
    })

    await apiCredentialProfilesStorage.updateProfile(captured.profile.id, {
      notes: "Keep the association",
    })
    await expect(
      apiCredentialProfileLinks.findForLocator(locator),
    ).resolves.toEqual([expect.objectContaining({ state: "active" })])

    await apiCredentialProfilesStorage.updateProfile(captured.profile.id, {
      apiType: API_TYPES.ANTHROPIC,
      baseUrl: "https://anthropic.example.invalid/v1",
    })
    await expect(
      apiCredentialProfileLinks.findForLocator(locator),
    ).resolves.toEqual([
      expect.objectContaining({ state: "needs-confirmation" }),
    ])

    await apiCredentialProfilesStorage.updateProfile(captured.profile.id, {
      apiKey: "sk-replaced-secret",
    })
    await expect(
      apiCredentialProfileLinks.findForLocator(locator),
    ).resolves.toEqual([
      expect.objectContaining({ state: "needs-confirmation" }),
    ])
    await expect(apiCredentialProfileLinks.resolve(locator)).resolves.toEqual(
      expect.objectContaining({ status: "needs-confirmation" }),
    )

    await apiCredentialProfilesStorage.deleteProfile(captured.profile.id)
    await expect(apiCredentialProfileLinks.list()).resolves.toEqual([])
  })

  it("preserves associations across telemetry and tag maintenance writes", async () => {
    const locator = {
      source: "account_token" as const,
      accountId: "account-example",
      siteType: SITE_TYPES.NEW_API,
      tokenId: 10,
    }
    const captured = await apiCredentialProfileLinks.capture({
      profile: {
        name: "Maintained profile",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://api.example.invalid",
        apiKey: "sk-maintained-secret",
        tagIds: ["tag-example"],
      },
      locator,
      linkedBy: "resolved-runtime-key",
    })

    await apiCredentialProfilesStorage.updateTelemetrySnapshot(
      captured.profile.id,
      {
        health: { status: SiteHealthStatus.Healthy },
        lastSyncTime: 1,
        attempts: [],
      },
    )
    await apiCredentialProfilesStorage.removeTagIdFromAllProfiles("tag-example")

    await expect(apiCredentialProfileLinks.resolve(locator)).resolves.toEqual(
      expect.objectContaining({ status: "resolved" }),
    )
  })

  it("returns detached link metadata without exposing the credential secret", async () => {
    const captured = await apiCredentialProfileLinks.capture({
      profile: {
        name: "Private profile",
        apiType: API_TYPES.OPENAI_COMPATIBLE,
        baseUrl: "https://api.example.invalid",
        apiKey: "sk-private-secret",
      },
      locator: {
        source: "account_token",
        accountId: "account-example",
        siteType: SITE_TYPES.NEW_API,
        tokenId: 12,
      },
      linkedBy: "creation-response",
    })

    const [listed] = await apiCredentialProfileLinks.list()
    expect(JSON.stringify(listed)).not.toContain("sk-private-secret")
    listed.profileId = "mutated-profile"

    await expect(apiCredentialProfileLinks.getById(listed.id)).resolves.toEqual(
      expect.objectContaining({ profileId: captured.profile.id }),
    )
  })

  it("upgrades a legacy v4 config without inventing associations", () => {
    const migrated = coerceApiCredentialProfilesConfig(
      {
        version: 4,
        profiles: [createPersistedProfile({ id: "profile-legacy" })],
        lastUpdated: 4,
      },
      { now: 5 },
    )

    expect(migrated).toEqual(
      expect.objectContaining({
        version: 5,
        profiles: [expect.objectContaining({ id: "profile-legacy" })],
        links: [],
        linkTombstones: [],
      }),
    )
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "normalizes invalid persisted link timestamps (%s)",
    (invalidTimestamp) => {
      const profile = createPersistedProfile({ id: "profile-example" })
      const createConfig = (createdAt: number, updatedAt: number) => ({
        version: 5,
        profiles: [profile],
        links: [
          {
            id: "link-example",
            profileId: profile.id,
            locator: {
              source: "account_token",
              accountId: "account-example",
              siteType: SITE_TYPES.NEW_API,
              tokenId: 1,
            },
            state: "active",
            linkedBy: "user",
            createdAt,
            updatedAt,
          },
        ],
        linkTombstones: [],
        lastUpdated: 1,
      })

      const invalidCreatedAt = coerceApiCredentialProfilesConfig(
        createConfig(invalidTimestamp, 7),
        { now: 10 },
      )
      const invalidUpdatedAt = mergeApiCredentialProfilesConfigs({
        local: createConfig(4, invalidTimestamp),
        incoming: { version: 5, profiles: [], links: [] },
        now: 10,
      })

      expect(invalidCreatedAt.links).toEqual([
        expect.objectContaining({ createdAt: 10, updatedAt: 7 }),
      ])
      expect(invalidUpdatedAt.links).toEqual([
        expect.objectContaining({ createdAt: 4, updatedAt: 4 }),
      ])
    },
  )

  it("preserves zero-valued persisted link timestamps", () => {
    const profile = createPersistedProfile({ id: "profile-example" })
    const coerced = coerceApiCredentialProfilesConfig(
      {
        version: 5,
        profiles: [profile],
        links: [
          {
            id: "link-example",
            profileId: profile.id,
            locator: {
              source: "account_token",
              accountId: "account-example",
              siteType: SITE_TYPES.NEW_API,
              tokenId: 1,
            },
            state: "active",
            linkedBy: "user",
            createdAt: 0,
            updatedAt: 0,
          },
        ],
        linkTombstones: [],
        lastUpdated: 1,
      },
      { now: 10 },
    )

    expect(coerced.links).toEqual([
      expect.objectContaining({ createdAt: 0, updatedAt: 0 }),
    ])
  })

  it("remaps links when merge de-duplicates credential profile ids", () => {
    const locator = {
      source: "account_token" as const,
      accountId: "account-example",
      siteType: SITE_TYPES.NEW_API,
      tokenId: 11,
    }
    const local: ApiCredentialProfilesConfig = {
      version: 5,
      profiles: [createPersistedProfile({ id: "profile-local" })],
      links: [
        {
          id: "link-local",
          profileId: "profile-local",
          locator,
          state: "active",
          linkedBy: "resolved-runtime-key",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      linkTombstones: [],
      lastUpdated: 1,
    }
    const incoming: ApiCredentialProfilesConfig = {
      version: 5,
      profiles: [
        createPersistedProfile({ id: "profile-incoming", updatedAt: 2 }),
      ],
      links: [
        {
          id: "link-incoming",
          profileId: "profile-incoming",
          locator,
          state: "active",
          linkedBy: "resolved-runtime-key",
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      linkTombstones: [],
      lastUpdated: 2,
    }

    const merged = mergeApiCredentialProfilesConfigs({
      local,
      incoming,
      now: 3,
    })

    expect(merged.profiles).toEqual([
      expect.objectContaining({ id: "profile-incoming" }),
    ])
    expect(merged.links).toEqual([
      expect.objectContaining({
        profileId: "profile-incoming",
        locator,
        state: "active",
      }),
    ])
  })

  it("preserves conflicting merge evidence but makes every association require confirmation", () => {
    const locator = {
      source: "service_credential" as const,
      accountId: "account-example",
      siteType: SITE_TYPES.NEW_API,
      service: "example-service",
    }
    const config = (
      profile: ApiCredentialProfile,
      linkId: string,
    ): ApiCredentialProfilesConfig => ({
      version: 5,
      profiles: [profile],
      links: [
        {
          id: linkId,
          profileId: profile.id,
          locator,
          state: "active",
          linkedBy: "user",
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        },
      ],
      linkTombstones: [],
      lastUpdated: profile.updatedAt,
    })

    const merged = mergeApiCredentialProfilesConfigs({
      local: config(
        createPersistedProfile({
          id: "profile-first",
          apiKey: "sk-first-secret",
        }),
        "link-first",
      ),
      incoming: config(
        createPersistedProfile({
          id: "profile-second",
          apiKey: "sk-second-secret",
        }),
        "link-second",
      ),
      now: 3,
    })

    expect(merged.links).toHaveLength(2)
    expect(merged.links).toEqual([
      expect.objectContaining({ state: "needs-confirmation" }),
      expect.objectContaining({ state: "needs-confirmation" }),
    ])
  })

  it("merges revisions of one association by its stable id", () => {
    const profile = createPersistedProfile({ id: "profile-example" })
    const previousLocator = {
      source: "account_token" as const,
      accountId: "account-example",
      siteType: SITE_TYPES.NEW_API,
      tokenId: 1,
    }
    const currentLocator = { ...previousLocator, tokenId: 2 }
    const config = (
      locator: typeof previousLocator,
      updatedAt: number,
    ): ApiCredentialProfilesConfig => ({
      version: 5,
      profiles: [profile],
      links: [
        {
          id: "link-example",
          profileId: profile.id,
          locator,
          state: "active",
          linkedBy: "user",
          createdAt: 1,
          updatedAt,
        },
      ],
      linkTombstones: [],
      lastUpdated: updatedAt,
    })

    const merged = mergeApiCredentialProfilesConfigs({
      local: config(currentLocator, 2),
      incoming: config(previousLocator, 1),
      now: 3,
    })

    expect(merged.links).toEqual([
      expect.objectContaining({
        id: "link-example",
        locator: currentLocator,
      }),
    ])
  })

  it("fails closed and merges equal-time divergent revisions deterministically", () => {
    const profile = createPersistedProfile({ id: "profile-example" })
    const firstLocator = {
      source: "account_token" as const,
      accountId: "account-example",
      siteType: SITE_TYPES.NEW_API,
      tokenId: 1,
    }
    const secondLocator = { ...firstLocator, tokenId: 2 }
    const config = (
      locator: typeof firstLocator,
    ): ApiCredentialProfilesConfig => ({
      version: 5,
      profiles: [profile],
      links: [
        {
          id: "link-example",
          profileId: profile.id,
          locator,
          state: "active",
          linkedBy: "user",
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      linkTombstones: [],
      lastUpdated: 2,
    })

    const localFirst = mergeApiCredentialProfilesConfigs({
      local: config(firstLocator),
      incoming: config(secondLocator),
      now: 3,
    })
    const incomingFirst = mergeApiCredentialProfilesConfigs({
      local: config(secondLocator),
      incoming: config(firstLocator),
      now: 3,
    })

    expect(localFirst.links).toEqual(incomingFirst.links)
    expect(localFirst.links).toEqual([
      expect.objectContaining({
        id: "link-example",
        state: "needs-confirmation",
      }),
    ])
  })

  it("does not resurrect an association deleted on another device", () => {
    const profile = createPersistedProfile({ id: "profile-example" })
    const staleConfig = {
      version: 5,
      profiles: [profile],
      links: [
        {
          id: "link-deleted",
          profileId: profile.id,
          locator: {
            source: "account_token",
            accountId: "account-example",
            siteType: SITE_TYPES.NEW_API,
            tokenId: 1,
          },
          state: "active",
          linkedBy: "user",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      lastUpdated: 1,
    }
    const deletedConfig = {
      version: 5,
      profiles: [profile],
      links: [],
      linkTombstones: [{ id: "link-deleted", deletedAt: 2 }],
      lastUpdated: 2,
    }

    const merged = mergeApiCredentialProfilesConfigs({
      local: deletedConfig,
      incoming: staleConfig,
      now: 3,
    })

    expect(merged.links).toEqual([])
    expect(merged.linkTombstones).toEqual([
      { id: "link-deleted", deletedAt: 2 },
    ])
  })
})
