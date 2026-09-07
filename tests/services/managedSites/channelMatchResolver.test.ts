import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getManagedSiteChannelExactMatch,
  MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS,
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
  MatchResolutionUnresolvedError,
} from "~/services/managedSites/channelMatch"
import {
  createManagedSiteChannelMatchRequestCache,
  resolveManagedSiteChannelMatch as resolveManagedSiteChannelMatchImpl,
} from "~/services/managedSites/channelMatchResolver"
import { getManagedResourceRefKey } from "~/services/managedSites/managedResourceIdentity"
import type { ManagedResourceMatchCandidate } from "~/types/managedResourceMatching"
import {
  buildManagedResourceMatchCandidate,
  matchingResourceRef,
} from "~~/tests/test-utils/managedResourceMatching"
import { createManagedSiteCapabilitiesStub } from "~~/tests/test-utils/managedSiteCapabilitiesFactory"

const managedConfig = {
  baseUrl: "https://managed.example",
  adminToken: "managed-token",
  userId: "1",
}

const sessionResyncExecution = {
  version: 2 as const,
  kind: "automatic" as const,
  feature: "managed_site_channels" as const,
  trigger: "background_recovery" as const,
  surface: "background" as const,
}
const sessionResyncOptions = {
  protectionBypassExecution: sessionResyncExecution,
}

const resolveManagedSiteChannelMatch = (
  params: Parameters<typeof resolveManagedSiteChannelMatchImpl>[0],
) =>
  resolveManagedSiteChannelMatchImpl({
    ...params,
    protectionBypassExecution:
      params.protectionBypassExecution ?? sessionResyncExecution,
  })

describe("resolveManagedSiteChannelMatch", () => {
  it("treats URL and key as the exact Sub2API identity without requiring models", () => {
    const channel = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(91),
      key: "sub2api-key",
      base_url: "https://api.example.invalid",
      models: "",
    })
    const inspection = {
      searchBaseUrl: "https://api.example.invalid",
      searchCompleted: true,
      url: { matched: true, channel, candidateCount: 1 },
      key: {
        comparable: true,
        matched: true,
        reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
        channel,
      },
      models: {
        comparable: false,
        matched: false,
        reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MODELS_PROVIDED,
        channel: null,
      },
    }

    expect(
      getManagedSiteChannelExactMatch(inspection, SITE_TYPES.SUB2API)?.ref,
    ).toEqual(matchingResourceRef(91))
    expect(
      getManagedSiteChannelExactMatch(inspection, SITE_TYPES.NEW_API),
    ).toBeNull()
  })

  it("does not report an exact Sub2API duplicate when URL and key match different accounts", () => {
    const urlChannel = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(91),
      key: "url-channel-key",
      base_url: "https://api.example.invalid",
      models: "",
    })
    const keyChannel = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(92),
      key: "sub2api-key",
      base_url: "https://other.example.invalid",
      models: "",
    })
    const inspection = {
      searchBaseUrl: "https://api.example.invalid",
      searchCompleted: true,
      url: { matched: true, channel: urlChannel, candidateCount: 1 },
      key: {
        comparable: true,
        matched: true,
        reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
        channel: keyChannel,
      },
      models: {
        comparable: false,
        matched: false,
        reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MODELS_PROVIDED,
        channel: null,
      },
    }

    expect(
      getManagedSiteChannelExactMatch(inspection, SITE_TYPES.SUB2API),
    ).toBeNull()
  })

  it("resolves exact duplicates through registered channel matching", async () => {
    const channel = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(65),
      key: "sk-matching",
      base_url: "https://api.example.com/v1",
      models: "gpt-4o",
      name: "Matching duplicate",
    })
    const searchChannel = vi.fn().mockResolvedValue({
      items: [channel],
      total: 1,
      type_counts: {},
    })
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: { search: searchChannel },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4o"],
      key: "sk-matching",
    })

    expect(searchChannel).toHaveBeenCalledWith(
      managedConfig,
      "https://api.example.com",
    )
    expect(getManagedSiteChannelExactMatch(result)?.ref).toEqual(
      matchingResourceRef(65),
    )
  })

  it("skips candidate key hydration when a local exact match is already available", async () => {
    const hydrateComparableChannelKeys = vi.fn().mockResolvedValue([])
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            buildManagedResourceMatchCandidate({
              ref: matchingResourceRef(6),
              key: "sk-match",
              base_url: "https://api.example.com/v1",
              models: "gpt-4o",
            }),
            buildManagedResourceMatchCandidate({
              ref: matchingResourceRef(7),
              key: "",
              base_url: "https://api.example.com/v1",
              models: "gpt-4o-mini",
            }),
          ],
        }),
        hydrateComparableKeys: hydrateComparableChannelKeys,
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4o"],
      key: "sk-match",
    })

    expect(hydrateComparableChannelKeys).not.toHaveBeenCalled()
    expect(result.key.matched).toBe(true)
    expect(result.models.reason).toBe(
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
    )
  })

  it("matches optional sk- prefixes for New API compatible managed sites", async () => {
    const channel = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(61),
      key: "stored-key",
      base_url: "https://api.example.com/v1",
      models: "gpt-4o",
    })
    const managedSite = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.NEW_API,
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [channel],
        }),
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4o"],
      key: "sk-stored-key",
    })

    expect(result.key).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel,
    })
  })

  it("matches optional sk- prefixes for DoneHub managed sites", async () => {
    const channel = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(63, { siteType: SITE_TYPES.DONE_HUB }),
      key: "stored-key",
      base_url: "https://api.example.com/v1",
      models: "gpt-4o",
    })
    const managedSite = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.DONE_HUB,
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [channel],
        }),
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4o"],
      key: "sk-stored-key",
    })

    expect(result.key).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel,
    })
  })

  it("keeps non-compatible managed-site key matching exact", async () => {
    const managedSite = createManagedSiteCapabilitiesStub({
      siteType: SITE_TYPES.OCTOPUS,
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            buildManagedResourceMatchCandidate({
              ref: matchingResourceRef(62, { siteType: SITE_TYPES.OCTOPUS }),
              key: "stored-key",
              base_url: "https://api.example.com/v1",
              models: "gpt-4o",
            }),
          ],
        }),
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4o"],
      key: "sk-stored-key",
    })

    expect(result.key).toEqual({
      comparable: true,
      matched: false,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_MATCH,
      channel: null,
    })
    expect(getManagedSiteChannelExactMatch(result)).toBeNull()
  })

  it("hydrates narrowed comparable candidates instead of calling provider duplicate search", async () => {
    const requestCache = createManagedSiteChannelMatchRequestCache()
    const searchChannel = vi.fn().mockResolvedValue({
      items: [
        buildManagedResourceMatchCandidate({
          ref: matchingResourceRef(7),
          key: "",
          base_url: "https://api.example.com/v1",
          models: "gpt-4o",
        }),
      ],
    })
    const hydrateComparableChannelKeys = vi.fn(async (_config, candidates) =>
      candidates.map((channel: ManagedResourceMatchCandidate) => ({
        ...channel,
        key: "sk-match",
      })),
    )
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: searchChannel,
        hydrateComparableKeys: hydrateComparableChannelKeys,
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4o"],
      key: "sk-match",
      requestCache,
    })

    expect(searchChannel).toHaveBeenCalledTimes(1)
    expect(hydrateComparableChannelKeys).toHaveBeenCalledWith(
      managedConfig,
      [expect.objectContaining({ ref: matchingResourceRef(7) })],
      sessionResyncOptions,
    )
    expect(result.key.matched).toBe(true)
    expect(result.models.matched).toBe(true)
    expect(requestCache.resolvedChannelKeysByResourceKey).toEqual({
      [getManagedResourceRefKey(matchingResourceRef(7))]: "sk-match",
    })
  })

  it("applies the hidden-key allow-list before hydrating multiple exact-model candidates", async () => {
    const hydrateComparableChannelKeys = vi.fn(async (_config, candidates) =>
      candidates.map((channel: ManagedResourceMatchCandidate) => ({
        ...channel,
        key:
          channel.ref.resourceId === "72" ? "sk-scoped-match" : "sk-unscoped",
      })),
    )
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            buildManagedResourceMatchCandidate({
              ref: matchingResourceRef(71),
              key: "",
              base_url: "https://api.example.com/v1",
              models: "gpt-4o",
            }),
            buildManagedResourceMatchCandidate({
              ref: matchingResourceRef(72),
              key: "",
              base_url: "https://api.example.com/v1",
              models: "gpt-4o",
            }),
          ],
        }),
        hydrateComparableKeys: hydrateComparableChannelKeys,
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4o"],
      key: "sk-scoped-match",
      hiddenKeyResourceRefs: [matchingResourceRef(72)],
      protectionBypassExecution: sessionResyncOptions.protectionBypassExecution,
    })

    expect(hydrateComparableChannelKeys).toHaveBeenCalledWith(
      managedConfig,
      [expect.objectContaining({ ref: matchingResourceRef(72) })],
      sessionResyncOptions,
    )
    expect(result.key).toMatchObject({
      comparable: true,
      matched: true,
      channel: { ref: matchingResourceRef(72) },
    })
  })

  it("marks key comparison unavailable when candidate key hydration requires verification", async () => {
    const hydrateComparableChannelKeys = vi.fn(async () => {
      throw new MatchResolutionUnresolvedError(
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
      )
    })
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            buildManagedResourceMatchCandidate({
              ref: matchingResourceRef(8),
              key: "",
              base_url: "https://api.example.com/v1",
              models: "gpt-4o",
            }),
          ],
        }),
        hydrateComparableKeys: hydrateComparableChannelKeys,
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4o"],
      key: "sk-match",
    })

    expect(result.url.matched).toBe(true)
    expect(result.key.comparable).toBe(false)
    expect(result.key.matched).toBe(false)
    expect(result.unresolvedReason).toBe(
      MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
    )
  })

  it("rethrows unexpected candidate key hydration failures", async () => {
    const hydrationError = new Error("hydration crashed")
    const hydrateComparableChannelKeys = vi.fn(async () => {
      throw hydrationError
    })
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            buildManagedResourceMatchCandidate({
              ref: matchingResourceRef(9),
              key: "",
              base_url: "https://api.example.com/v1",
              models: "gpt-4o",
            }),
          ],
        }),
        hydrateComparableKeys: hydrateComparableChannelKeys,
      },
    })

    await expect(
      resolveManagedSiteChannelMatch({
        managedSite,
        managedConfig,
        accountBaseUrl: "https://api.example.com/v1",
        models: ["gpt-4o"],
        key: "test-key",
      }),
    ).rejects.toBe(hydrationError)
  })

  it("does not hydrate hidden same-URL candidates with different models", async () => {
    const hydrateComparableChannelKeys = vi.fn(async () => {
      throw new MatchResolutionUnresolvedError(
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.KEY_RESOLUTION_FAILED,
      )
    })
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            buildManagedResourceMatchCandidate({
              ref: matchingResourceRef(40),
              key: "",
              base_url: "https://api.example.com/v1",
              models: "claude-3",
            }),
          ],
        }),
        hydrateComparableKeys: hydrateComparableChannelKeys,
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4o"],
      key: "sk-match",
    })

    expect(hydrateComparableChannelKeys).not.toHaveBeenCalled()
    expect(result.unresolvedReason).toBeUndefined()
    expect(result.key).toEqual({
      comparable: false,
      matched: false,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE,
      channel: null,
    })
    expect(result.models.reason).toBe(
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
    )
    expect(getManagedSiteChannelExactMatch(result)).toBeNull()
  })

  it("hydrates a ranked contained-model candidate when no exact model candidate exists", async () => {
    const containedModelCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(41),
      key: "",
      base_url: "https://api.example.com/v1",
      models: "gpt-4o,gpt-4o-mini",
    })
    const hydrateComparableChannelKeys = vi.fn(async (_config, candidates) =>
      candidates.map((channel: ManagedResourceMatchCandidate) => ({
        ...channel,
        key: "sk-match",
      })),
    )
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [containedModelCandidate],
        }),
        hydrateComparableKeys: hydrateComparableChannelKeys,
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4o"],
      key: "sk-match",
    })

    expect(hydrateComparableChannelKeys).toHaveBeenCalledWith(
      managedConfig,
      [expect.objectContaining({ ref: matchingResourceRef(41) })],
      sessionResyncOptions,
    )
    expect(result.key).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel: expect.objectContaining({ ref: matchingResourceRef(41) }),
    })
    expect(result.models.reason).toBe(
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.CONTAINED,
    )
  })

  it("returns a secondary exact-model match when key comparison is unavailable", async () => {
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            buildManagedResourceMatchCandidate({
              ref: matchingResourceRef(12),
              name: "Secondary Match",
              base_url: "https://api.example.com",
              models: "gpt-4,gpt-4o-mini",
            }),
          ],
          total: 1,
          type_counts: {},
        }),
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4", "gpt-4o-mini"],
    })

    expect(result.searchCompleted).toBe(true)
    expect(result.url.matched).toBe(true)
    expect(result.key).toEqual({
      comparable: false,
      matched: false,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.NO_KEY_PROVIDED,
      channel: null,
    })
    expect(result.models.reason).toBe(
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
    )
    expect(result.models.channel?.ref).toEqual(matchingResourceRef(12))
  })

  it("returns separate key and model assessments when only the key matches", async () => {
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            buildManagedResourceMatchCandidate({
              ref: matchingResourceRef(13),
              name: "Key Match",
              base_url: "https://api.example.com",
              models: "claude-3",
              key: "sk-other",
            }),
          ],
          total: 1,
          type_counts: {},
        }),
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-other",
    })

    expect(result.searchCompleted).toBe(true)
    expect(result.url.matched).toBe(true)
    expect(result.key.reason).toBe(
      MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
    )
    expect(result.key.channel?.ref).toEqual(matchingResourceRef(13))
    expect(result.models.reason).toBe(
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
    )
  })

  it("returns unresolved when the backend search fails", async () => {
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: { search: vi.fn().mockResolvedValue(null) },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-missing",
    })

    expect(result).toEqual({
      searchBaseUrl: "https://api.example.com",
      searchCompleted: false,
      url: {
        matched: false,
        channel: null,
        candidateCount: 0,
      },
      key: {
        comparable: false,
        matched: false,
        reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE,
        channel: null,
      },
      models: {
        comparable: false,
        matched: false,
        reason:
          MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.COMPARISON_UNAVAILABLE,
        channel: null,
      },
    })
  })

  it("reuses the recoverable unique-URL candidate when hidden-key resolution is requested", async () => {
    const hiddenUrlOnlyCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(21),
      name: "Hidden URL Candidate",
      base_url: "https://api.example.com",
      models: "claude-3",
      key: "",
    })
    const fetchChannelSecretKey = vi.fn().mockResolvedValue("sk-match")
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            hiddenUrlOnlyCandidate,
            buildManagedResourceMatchCandidate({
              ref: matchingResourceRef(22),
              name: "Competing Candidate",
              base_url: "https://other.example.com",
              models: "gpt-4",
              key: "sk-other",
            }),
          ],
          total: 2,
          type_counts: {},
        }),
        fetchSecretKey: fetchChannelSecretKey,
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
    })

    expect(fetchChannelSecretKey).toHaveBeenCalledWith(
      expect.objectContaining(managedConfig),
      matchingResourceRef(21),
      sessionResyncOptions,
    )
    expect(result.url).toEqual({
      matched: true,
      channel: expect.objectContaining({ ref: matchingResourceRef(21) }),
      candidateCount: 1,
    })
    expect(result.key).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel: expect.objectContaining({ ref: matchingResourceRef(21) }),
    })
    expect(result.models.reason).toBe(
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
    )
  })

  it("resolves masked key candidates before exact key matching", async () => {
    const maskedUrlCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(24),
      name: "Masked URL Candidate",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-***",
    })
    const fetchChannelSecretKey = vi.fn().mockResolvedValue("sk-match")
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [maskedUrlCandidate],
          total: 1,
          type_counts: {},
        }),
        fetchSecretKey: fetchChannelSecretKey,
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
    })

    expect(fetchChannelSecretKey).toHaveBeenCalledWith(
      expect.objectContaining(managedConfig),
      matchingResourceRef(24),
      sessionResyncOptions,
    )
    expect(result.key).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel: expect.objectContaining({ ref: matchingResourceRef(24) }),
    })
    expect(result.models.reason).toBe(
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
    )
  })

  it("resolves every recoverable URL candidate before exact key matching", async () => {
    const firstMaskedCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(25),
      name: "First Masked URL Candidate",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-***",
    })
    const secondMaskedCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(26),
      name: "Second Masked URL Candidate",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-***",
    })
    const fetchChannelSecretKey = vi
      .fn()
      .mockResolvedValueOnce("sk-other")
      .mockResolvedValueOnce("sk-match")
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [firstMaskedCandidate, secondMaskedCandidate],
          total: 2,
          type_counts: {},
        }),
        fetchSecretKey: fetchChannelSecretKey,
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
    })

    expect(fetchChannelSecretKey).toHaveBeenCalledTimes(2)
    expect(fetchChannelSecretKey).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining(managedConfig),
      matchingResourceRef(25),
      sessionResyncOptions,
    )
    expect(fetchChannelSecretKey).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining(managedConfig),
      matchingResourceRef(26),
      sessionResyncOptions,
    )
    expect(result.key).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel: expect.objectContaining({ ref: matchingResourceRef(26) }),
    })
    expect(result.models).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
      channel: expect.objectContaining({ ref: matchingResourceRef(26) }),
      similarityScore: 1,
    })
    expect(getManagedSiteChannelExactMatch(result)?.ref).toEqual(
      matchingResourceRef(26),
    )
  })

  it("omits unresolved reason when a visible exact match remains after hidden-key recovery fails", async () => {
    const exactVisibleCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(32),
      name: "Exact Visible Candidate",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-match",
    })
    const maskedSiblingCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(33),
      name: "Masked Sibling Candidate",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-***",
    })
    const fetchChannelSecretKey = vi
      .fn()
      .mockRejectedValue(
        new MatchResolutionUnresolvedError(
          MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
        ),
      )
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [exactVisibleCandidate, maskedSiblingCandidate],
          total: 2,
          type_counts: {},
        }),
        fetchSecretKey: fetchChannelSecretKey,
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
    })

    expect(fetchChannelSecretKey).toHaveBeenCalledWith(
      expect.objectContaining(managedConfig),
      matchingResourceRef(33),
      sessionResyncOptions,
    )
    expect(result.key.channel?.ref).toEqual(matchingResourceRef(32))
    expect(result.models.channel?.ref).toEqual(matchingResourceRef(32))
    expect(result.unresolvedReason).toBeUndefined()
    expect(getManagedSiteChannelExactMatch(result)?.ref).toEqual(
      matchingResourceRef(32),
    )
  })

  it("does not fetch usable out-of-bucket candidates when resolving hidden URL candidates", async () => {
    const hiddenUrlCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(29),
      name: "Hidden URL Candidate",
      base_url: "https://api.example.com",
      models: "claude-3",
      key: "sk-***",
    })
    const usableOutOfBucketCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(30),
      name: "Usable Out-of-Bucket Candidate",
      base_url: "https://other.example.com",
      models: "gpt-4",
      key: "sk-other",
    })
    const fetchChannelSecretKey = vi.fn().mockResolvedValue("sk-match")
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [hiddenUrlCandidate, usableOutOfBucketCandidate],
          total: 2,
          type_counts: {},
        }),
        fetchSecretKey: fetchChannelSecretKey,
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
    })

    expect(fetchChannelSecretKey).toHaveBeenCalledTimes(1)
    expect(fetchChannelSecretKey).toHaveBeenCalledWith(
      expect.objectContaining(managedConfig),
      matchingResourceRef(29),
      sessionResyncOptions,
    )
    expect(result.key.channel?.ref).toEqual(matchingResourceRef(29))
    expect(result.models.channel).toBeNull()
    expect(getManagedSiteChannelExactMatch(result)).toBeNull()
  })

  it("keeps cached resolved keys aligned with model matching", async () => {
    const firstMaskedCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(27),
      name: "First Cached URL Candidate",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-***",
    })
    const secondMaskedCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(28),
      name: "Second Cached URL Candidate",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-***",
    })
    const fetchChannelSecretKey = vi.fn()
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [firstMaskedCandidate, secondMaskedCandidate],
          total: 2,
          type_counts: {},
        }),
        fetchSecretKey: fetchChannelSecretKey,
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolvedChannelKeysByResourceKey: {
        [getManagedResourceRefKey(matchingResourceRef(27))]: "sk-other",
        [getManagedResourceRefKey(matchingResourceRef(28))]: "sk-match",
      },
      resolveHiddenKeys: true,
    })

    expect(fetchChannelSecretKey).not.toHaveBeenCalled()
    expect(result.key.channel?.ref).toEqual(matchingResourceRef(28))
    expect(result.models.channel?.ref).toEqual(matchingResourceRef(28))
    expect(getManagedSiteChannelExactMatch(result)?.ref).toEqual(
      matchingResourceRef(28),
    )
  })

  it("reuses cached channel searches and hidden-key resolutions across concurrent match checks", async () => {
    const maskedCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(72),
      name: "Shared Hidden Candidate",
      base_url: "https://api.example.com/v1",
      models: "gpt-4",
      key: "sk-***",
    })
    let resolveSearch: (value: {
      items: ManagedResourceMatchCandidate[]
      total: number
      type_counts: Record<string, number>
    }) => void = () => {}
    let resolveSecret: (value: string) => void = () => {}
    const searchChannel = vi.fn(
      () =>
        new Promise<Parameters<typeof resolveSearch>[0]>((resolve) => {
          resolveSearch = resolve
        }),
    )
    const fetchChannelSecretKey = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveSecret = resolve
        }),
    )
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: searchChannel,
        fetchSecretKey: fetchChannelSecretKey,
      },
    })
    const requestCache = {
      searchResultsByTargetKey: new Map(),
      resolvedChannelKeysByResourceKey: {},
      channelSecretKeysByResourceKey: new Map(),
    }

    const firstResultPromise = resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
      requestCache,
    })
    const secondResultPromise = resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
      requestCache,
    })

    expect(searchChannel).toHaveBeenCalledTimes(1)

    resolveSearch({
      items: [maskedCandidate],
      total: 1,
      type_counts: {},
    })
    await Promise.resolve()
    expect(fetchChannelSecretKey).toHaveBeenCalledTimes(1)

    resolveSecret("sk-match")
    const results = await Promise.all([firstResultPromise, secondResultPromise])

    expect(fetchChannelSecretKey).toHaveBeenCalledTimes(1)
    expect(requestCache.resolvedChannelKeysByResourceKey).toEqual({
      [getManagedResourceRefKey(matchingResourceRef(72))]: "sk-match",
    })
    expect(
      results.map((result) => getManagedSiteChannelExactMatch(result)?.ref),
    ).toEqual([matchingResourceRef(72), matchingResourceRef(72)])
  })

  it("keeps the advisory-match state when hidden-key recovery still needs verification", async () => {
    const hiddenUrlOnlyCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(31),
      name: "Verification Pending Candidate",
      base_url: "https://api.example.com",
      models: "claude-3",
      key: "",
    })
    const fetchChannelSecretKey = vi
      .fn()
      .mockRejectedValue(
        new MatchResolutionUnresolvedError(
          MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
        ),
      )
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [hiddenUrlOnlyCandidate],
          total: 1,
          type_counts: {},
        }),
        fetchSecretKey: fetchChannelSecretKey,
      },
    })

    const result = await resolveManagedSiteChannelMatch({
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
    })

    expect(fetchChannelSecretKey).toHaveBeenCalledWith(
      expect.objectContaining(managedConfig),
      matchingResourceRef(31),
      sessionResyncOptions,
    )
    expect(result.url).toEqual({
      matched: true,
      channel: expect.objectContaining({ ref: matchingResourceRef(31) }),
      candidateCount: 1,
    })
    expect(result.key).toEqual({
      comparable: false,
      matched: false,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.COMPARISON_UNAVAILABLE,
      channel: null,
    })
    expect(result.models.reason).toBe(
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
    )
    expect(result.unresolvedReason).toBe(
      MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
    )
  })

  it("evicts failed cached channel searches so later lookups can retry", async () => {
    const requestCache = createManagedSiteChannelMatchRequestCache()
    const searchChannel = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary search failure"))
      .mockResolvedValueOnce({
        items: [
          buildManagedResourceMatchCandidate({
            ref: matchingResourceRef(82),
            key: "sk-match",
            base_url: "https://api.example.com",
            models: "gpt-4o",
          }),
        ],
        total: 1,
        type_counts: {},
      })
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: { search: searchChannel },
    })
    const request = {
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4o"],
      key: "sk-match",
      requestCache,
    }

    await expect(resolveManagedSiteChannelMatch(request)).rejects.toThrow(
      "temporary search failure",
    )
    await expect(
      resolveManagedSiteChannelMatch(request),
    ).resolves.toMatchObject({
      key: {
        matched: true,
      },
    })
    expect(searchChannel).toHaveBeenCalledTimes(2)
  })

  it("evicts failed cached channel-key fetches so later hidden-key recovery can retry", async () => {
    const requestCache = createManagedSiteChannelMatchRequestCache()
    const hiddenCandidate = buildManagedResourceMatchCandidate({
      ref: matchingResourceRef(83),
      key: "",
      base_url: "https://api.example.com",
      models: "gpt-4o",
    })
    const fetchChannelSecretKey = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary key failure"))
      .mockResolvedValueOnce("sk-match")
    const managedSite = createManagedSiteCapabilitiesStub({
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [hiddenCandidate],
          total: 1,
          type_counts: {},
        }),
        fetchSecretKey: fetchChannelSecretKey,
      },
    })
    const request = {
      managedSite,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4o"],
      key: "sk-match",
      resolveHiddenKeys: true,
      requestCache,
    }

    const firstResult = await resolveManagedSiteChannelMatch(request)
    const secondResult = await resolveManagedSiteChannelMatch(request)

    expect(firstResult.unresolvedReason).toBe(
      MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
    )
    expect(getManagedSiteChannelExactMatch(secondResult)?.ref).toEqual(
      matchingResourceRef(83),
    )
    expect(fetchChannelSecretKey).toHaveBeenCalledTimes(2)
  })
})
