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
  resolveManagedSiteChannelMatch,
} from "~/services/managedSites/channelMatchResolver"
import type { ManagedSiteChannel } from "~/types/managedSite"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

const managedConfig = {
  baseUrl: "https://managed.example",
  adminToken: "managed-token",
  userId: "1",
}

const createManagedSiteServiceStub = (
  overrides: Record<string, unknown> = {},
) =>
  ({
    siteType: "new-api",
    messagesKey: "newapi",
    searchChannel: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
    }),
    createChannel: vi.fn(),
    updateChannel: vi.fn(),
    deleteChannel: vi.fn(),
    checkValidConfig: vi.fn().mockResolvedValue(true),
    getConfig: vi.fn().mockResolvedValue(managedConfig),
    fetchAvailableModels: vi.fn(),
    buildChannelName: vi.fn(),
    prepareChannelFormData: vi.fn(),
    buildChannelPayload: vi.fn(),
    hydrateComparableChannelKeys: vi.fn(
      async (_config, candidates) => candidates,
    ),
    ...overrides,
  }) as any

describe("resolveManagedSiteChannelMatch", () => {
  it("skips candidate key hydration when a local exact match is already available", async () => {
    const hydrateComparableChannelKeys = vi.fn().mockResolvedValue([])
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          buildManagedSiteChannel({
            id: 6,
            key: "sk-match",
            base_url: "https://api.example.com/v1",
            models: "gpt-4o",
          }),
          buildManagedSiteChannel({
            id: 7,
            key: "",
            base_url: "https://api.example.com/v1",
            models: "gpt-4o-mini",
          }),
        ],
      }),
      hydrateComparableChannelKeys,
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
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
    const channel = buildManagedSiteChannel({
      id: 61,
      key: "stored-key",
      base_url: "https://api.example.com/v1",
      models: "gpt-4o",
    })
    const service = createManagedSiteServiceStub({
      siteType: SITE_TYPES.NEW_API,
      searchChannel: vi.fn().mockResolvedValue({
        items: [channel],
      }),
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
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
    const channel = buildManagedSiteChannel({
      id: 63,
      key: "stored-key",
      base_url: "https://api.example.com/v1",
      models: "gpt-4o",
    })
    const service = createManagedSiteServiceStub({
      siteType: SITE_TYPES.DONE_HUB,
      searchChannel: vi.fn().mockResolvedValue({
        items: [channel],
      }),
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
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
    const service = createManagedSiteServiceStub({
      siteType: SITE_TYPES.OCTOPUS,
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          buildManagedSiteChannel({
            id: 62,
            key: "stored-key",
            base_url: "https://api.example.com/v1",
            models: "gpt-4o",
          }),
        ],
      }),
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
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
    const searchChannel = vi.fn().mockResolvedValue({
      items: [
        buildManagedSiteChannel({
          id: 7,
          key: "",
          base_url: "https://api.example.com/v1",
          models: "gpt-4o",
        }),
      ],
    })
    const hydrateComparableChannelKeys = vi.fn(async (_config, candidates) =>
      candidates.map((channel: ManagedSiteChannel) => ({
        ...channel,
        key: "sk-match",
      })),
    )
    const service = createManagedSiteServiceStub({
      searchChannel,
      hydrateComparableChannelKeys,
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4o"],
      key: "sk-match",
    })

    expect(searchChannel).toHaveBeenCalledTimes(1)
    expect(hydrateComparableChannelKeys).toHaveBeenCalledWith(managedConfig, [
      expect.objectContaining({ id: 7 }),
    ])
    expect(result.key.matched).toBe(true)
    expect(result.models.matched).toBe(true)
  })

  it("marks key comparison unavailable when candidate key hydration requires verification", async () => {
    const hydrateComparableChannelKeys = vi.fn(async () => {
      throw new MatchResolutionUnresolvedError(
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED,
      )
    })
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          buildManagedSiteChannel({
            id: 8,
            key: "",
            base_url: "https://api.example.com/v1",
            models: "gpt-4o",
          }),
        ],
      }),
      hydrateComparableChannelKeys,
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
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
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          buildManagedSiteChannel({
            id: 9,
            key: "",
            base_url: "https://api.example.com/v1",
            models: "gpt-4o",
          }),
        ],
      }),
      hydrateComparableChannelKeys,
    })

    await expect(
      resolveManagedSiteChannelMatch({
        service,
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
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          buildManagedSiteChannel({
            id: 40,
            key: "",
            base_url: "https://api.example.com/v1",
            models: "claude-3",
          }),
        ],
      }),
      hydrateComparableChannelKeys,
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
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
    const containedModelCandidate = buildManagedSiteChannel({
      id: 41,
      key: "",
      base_url: "https://api.example.com/v1",
      models: "gpt-4o,gpt-4o-mini",
    })
    const hydrateComparableChannelKeys = vi.fn(async (_config, candidates) =>
      candidates.map((channel: ManagedSiteChannel) => ({
        ...channel,
        key: "sk-match",
      })),
    )
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [containedModelCandidate],
      }),
      hydrateComparableChannelKeys,
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4o"],
      key: "sk-match",
    })

    expect(hydrateComparableChannelKeys).toHaveBeenCalledWith(managedConfig, [
      expect.objectContaining({ id: 41 }),
    ])
    expect(result.key).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel: expect.objectContaining({ id: 41 }),
    })
    expect(result.models.reason).toBe(
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.CONTAINED,
    )
  })

  it("returns a secondary exact-model match when key comparison is unavailable", async () => {
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          buildManagedSiteChannel({
            id: 12,
            name: "Secondary Match",
            base_url: "https://api.example.com",
            models: "gpt-4,gpt-4o-mini",
          }),
        ],
        total: 1,
        type_counts: {},
      }),
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
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
    expect(result.models.channel?.id).toBe(12)
  })

  it("returns separate key and model assessments when only the key matches", async () => {
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          buildManagedSiteChannel({
            id: 13,
            name: "Key Match",
            base_url: "https://api.example.com",
            models: "claude-3",
            key: "sk-other",
          }),
        ],
        total: 1,
        type_counts: {},
      }),
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
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
    expect(result.key.channel?.id).toBe(13)
    expect(result.models.reason).toBe(
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
    )
  })

  it("returns unresolved when the backend search fails", async () => {
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue(null),
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
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
    const hiddenUrlOnlyCandidate = buildManagedSiteChannel({
      id: 21,
      name: "Hidden URL Candidate",
      base_url: "https://api.example.com",
      models: "claude-3",
      key: "",
    })
    const fetchChannelSecretKey = vi.fn().mockResolvedValue("sk-match")
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          hiddenUrlOnlyCandidate,
          buildManagedSiteChannel({
            id: 22,
            name: "Competing Candidate",
            base_url: "https://other.example.com",
            models: "gpt-4",
            key: "sk-other",
          }),
        ],
        total: 2,
        type_counts: {},
      }),
      fetchChannelSecretKey,
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
    })

    expect(fetchChannelSecretKey).toHaveBeenCalledWith(
      expect.objectContaining(managedConfig),
      21,
    )
    expect(result.url).toEqual({
      matched: true,
      channel: expect.objectContaining({ id: 21 }),
      candidateCount: 1,
    })
    expect(result.key).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel: expect.objectContaining({ id: 21 }),
    })
    expect(result.models.reason).toBe(
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.NO_MATCH,
    )
  })

  it("resolves masked key candidates before exact key matching", async () => {
    const maskedUrlCandidate = buildManagedSiteChannel({
      id: 24,
      name: "Masked URL Candidate",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-***",
    })
    const fetchChannelSecretKey = vi.fn().mockResolvedValue("sk-match")
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [maskedUrlCandidate],
        total: 1,
        type_counts: {},
      }),
      fetchChannelSecretKey,
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
    })

    expect(fetchChannelSecretKey).toHaveBeenCalledWith(
      expect.objectContaining(managedConfig),
      24,
    )
    expect(result.key).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel: expect.objectContaining({ id: 24 }),
    })
    expect(result.models.reason).toBe(
      MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
    )
  })

  it("resolves every recoverable URL candidate before exact key matching", async () => {
    const firstMaskedCandidate = buildManagedSiteChannel({
      id: 25,
      name: "First Masked URL Candidate",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-***",
    })
    const secondMaskedCandidate = buildManagedSiteChannel({
      id: 26,
      name: "Second Masked URL Candidate",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-***",
    })
    const fetchChannelSecretKey = vi
      .fn()
      .mockResolvedValueOnce("sk-other")
      .mockResolvedValueOnce("sk-match")
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [firstMaskedCandidate, secondMaskedCandidate],
        total: 2,
        type_counts: {},
      }),
      fetchChannelSecretKey,
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
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
      25,
    )
    expect(fetchChannelSecretKey).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining(managedConfig),
      26,
    )
    expect(result.key).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
      channel: expect.objectContaining({ id: 26 }),
    })
    expect(result.models).toEqual({
      comparable: true,
      matched: true,
      reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
      channel: expect.objectContaining({ id: 26 }),
      similarityScore: 1,
    })
    expect(getManagedSiteChannelExactMatch(result)?.id).toBe(26)
  })

  it("omits unresolved reason when a visible exact match remains after hidden-key recovery fails", async () => {
    const exactVisibleCandidate = buildManagedSiteChannel({
      id: 32,
      name: "Exact Visible Candidate",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-match",
    })
    const maskedSiblingCandidate = buildManagedSiteChannel({
      id: 33,
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
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [exactVisibleCandidate, maskedSiblingCandidate],
        total: 2,
        type_counts: {},
      }),
      fetchChannelSecretKey,
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
    })

    expect(fetchChannelSecretKey).toHaveBeenCalledWith(
      expect.objectContaining(managedConfig),
      33,
    )
    expect(result.key.channel?.id).toBe(32)
    expect(result.models.channel?.id).toBe(32)
    expect(result.unresolvedReason).toBeUndefined()
    expect(getManagedSiteChannelExactMatch(result)?.id).toBe(32)
  })

  it("does not fetch usable out-of-bucket candidates when resolving hidden URL candidates", async () => {
    const hiddenUrlCandidate = buildManagedSiteChannel({
      id: 29,
      name: "Hidden URL Candidate",
      base_url: "https://api.example.com",
      models: "claude-3",
      key: "sk-***",
    })
    const usableOutOfBucketCandidate = buildManagedSiteChannel({
      id: 30,
      name: "Usable Out-of-Bucket Candidate",
      base_url: "https://other.example.com",
      models: "gpt-4",
      key: "sk-other",
    })
    const fetchChannelSecretKey = vi.fn().mockResolvedValue("sk-match")
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [hiddenUrlCandidate, usableOutOfBucketCandidate],
        total: 2,
        type_counts: {},
      }),
      fetchChannelSecretKey,
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
    })

    expect(fetchChannelSecretKey).toHaveBeenCalledTimes(1)
    expect(fetchChannelSecretKey).toHaveBeenCalledWith(
      expect.objectContaining(managedConfig),
      29,
    )
    expect(result.key.channel?.id).toBe(29)
    expect(result.models.channel).toBeNull()
    expect(getManagedSiteChannelExactMatch(result)).toBeNull()
  })

  it("keeps cached resolved keys aligned with model matching", async () => {
    const firstMaskedCandidate = buildManagedSiteChannel({
      id: 27,
      name: "First Cached URL Candidate",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-***",
    })
    const secondMaskedCandidate = buildManagedSiteChannel({
      id: 28,
      name: "Second Cached URL Candidate",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-***",
    })
    const fetchChannelSecretKey = vi.fn()
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [firstMaskedCandidate, secondMaskedCandidate],
        total: 2,
        type_counts: {},
      }),
      fetchChannelSecretKey,
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolvedChannelKeysById: {
        27: "sk-other",
        28: "sk-match",
      },
      resolveHiddenKeys: true,
    })

    expect(fetchChannelSecretKey).not.toHaveBeenCalled()
    expect(result.key.channel?.id).toBe(28)
    expect(result.models.channel?.id).toBe(28)
    expect(getManagedSiteChannelExactMatch(result)?.id).toBe(28)
  })

  it("reuses cached channel searches and hidden-key resolutions across concurrent match checks", async () => {
    const maskedCandidate = buildManagedSiteChannel({
      id: 72,
      name: "Shared Hidden Candidate",
      base_url: "https://api.example.com/v1",
      models: "gpt-4",
      key: "sk-***",
    })
    let resolveSearch: (value: {
      items: ManagedSiteChannel[]
      total: number
      type_counts: Record<string, number>
    }) => void = () => {}
    let resolveSecret: (value: string) => void = () => {}
    const searchChannel = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve
        }),
    )
    const fetchChannelSecretKey = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveSecret = resolve
        }),
    )
    const service = createManagedSiteServiceStub({
      searchChannel,
      fetchChannelSecretKey,
    })
    const requestCache = {
      searchResultsByBaseUrl: new Map(),
      resolvedChannelKeysById: {},
      channelSecretKeysById: new Map(),
    }

    const firstResultPromise = resolveManagedSiteChannelMatch({
      service,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
      requestCache,
    })
    const secondResultPromise = resolveManagedSiteChannelMatch({
      service,
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
    expect(requestCache.resolvedChannelKeysById).toEqual({
      72: "sk-match",
    })
    expect(
      results.map((result) => getManagedSiteChannelExactMatch(result)?.id),
    ).toEqual([72, 72])
  })

  it("keeps the advisory-match state when hidden-key recovery still needs verification", async () => {
    const hiddenUrlOnlyCandidate = buildManagedSiteChannel({
      id: 31,
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
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [hiddenUrlOnlyCandidate],
        total: 1,
        type_counts: {},
      }),
      fetchChannelSecretKey,
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
      managedConfig,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
      key: "sk-match",
      resolveHiddenKeys: true,
    })

    expect(fetchChannelSecretKey).toHaveBeenCalledWith(
      expect.objectContaining(managedConfig),
      31,
    )
    expect(result.url).toEqual({
      matched: true,
      channel: expect.objectContaining({ id: 31 }),
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
          buildManagedSiteChannel({
            id: 82,
            key: "sk-match",
            base_url: "https://api.example.com",
            models: "gpt-4o",
          }),
        ],
        total: 1,
        type_counts: {},
      })
    const service = createManagedSiteServiceStub({
      searchChannel,
    })
    const request = {
      service,
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
    const hiddenCandidate = buildManagedSiteChannel({
      id: 83,
      key: "",
      base_url: "https://api.example.com",
      models: "gpt-4o",
    })
    const fetchChannelSecretKey = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary key failure"))
      .mockResolvedValueOnce("sk-match")
    const service = createManagedSiteServiceStub({
      searchChannel: vi.fn().mockResolvedValue({
        items: [hiddenCandidate],
        total: 1,
        type_counts: {},
      }),
      fetchChannelSecretKey,
    })
    const request = {
      service,
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
    expect(getManagedSiteChannelExactMatch(secondResult)?.id).toBe(83)
    expect(fetchChannelSecretKey).toHaveBeenCalledTimes(2)
  })
})
