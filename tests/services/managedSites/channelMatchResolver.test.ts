import { describe, expect, it, vi } from "vitest"

import {
  MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS,
  MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS,
} from "~/services/managedSites/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

const managedConfig = {
  baseUrl: "https://managed.example",
  token: "managed-token",
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
    findMatchingChannel: vi.fn().mockResolvedValue(null),
    autoConfigToManagedSite: vi.fn(),
    ...overrides,
  }) as any

describe("resolveManagedSiteChannelMatch", () => {
  it("prefers provider-aware exact key matching before local ranking", async () => {
    const exactMatch = buildManagedSiteChannel({
      id: 11,
      name: "Exact Match",
      base_url: "https://api.example.com",
      models: "gpt-4",
      key: "sk-match",
    })
    const service = createManagedSiteServiceStub({
      findMatchingChannel: vi.fn().mockResolvedValue(exactMatch),
      searchChannel: vi.fn().mockResolvedValue({
        items: [],
        total: 0,
        type_counts: {},
      }),
    })

    const result = await resolveManagedSiteChannelMatch({
      service,
      managedConfig,
      accountBaseUrl: "https://api.example.com/v1",
      models: ["gpt-4"],
      key: "sk-match",
    })

    expect(result).toEqual({
      searchBaseUrl: "https://api.example.com",
      searchCompleted: true,
      url: {
        matched: true,
        channel: exactMatch,
        candidateCount: 1,
      },
      key: {
        comparable: true,
        matched: true,
        reason: MANAGED_SITE_CHANNEL_KEY_MATCH_REASONS.MATCHED,
        channel: exactMatch,
      },
      models: {
        comparable: true,
        matched: true,
        reason: MANAGED_SITE_CHANNEL_MODELS_MATCH_REASONS.EXACT,
        channel: exactMatch,
        similarityScore: 1,
      },
    })
    expect(service.searchChannel).toHaveBeenCalledTimes(1)
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
})
