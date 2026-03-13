import { describe, expect, it } from "vitest"

import {
  MANAGED_SITE_CHANNEL_MATCH_LEVELS,
  MANAGED_SITE_CHANNEL_MATCH_REASONS,
  MANAGED_SITE_CHANNEL_MODEL_SIMILARITY_THRESHOLD,
} from "~/services/managedSites/channelMatch"
import {
  findBestManagedSiteChannelMatch,
  findManagedSiteChannelsByBaseUrlAndModels,
} from "~/services/managedSites/utils/channelMatching"
import { buildManagedSiteChannel } from "~~/tests/test-utils/factories"

describe("channelMatching", () => {
  it("dedupes stored channel models before comparing comparable inputs", () => {
    const channels = [
      buildManagedSiteChannel({
        id: 1,
        base_url: "https://api.example.com",
        models: "gpt-4,gpt-4",
      }),
    ]

    const result = findManagedSiteChannelsByBaseUrlAndModels({
      channels,
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
    })

    expect(result).toEqual(channels)
  })

  it("ranks an exact model-set match as secondary when the URL bucket matches", () => {
    const channel = buildManagedSiteChannel({
      id: 2,
      base_url: "https://api.example.com",
      models: "gpt-4,gpt-4o-mini",
    })

    const result = findBestManagedSiteChannelMatch({
      channels: [channel],
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4", "gpt-4o-mini"],
    })

    expect(result).toEqual({
      level: MANAGED_SITE_CHANNEL_MATCH_LEVELS.SECONDARY,
      reason: MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_EXACT,
      channel,
      similarityScore: 1,
    })
  })

  it("prefers model containment over weaker similarity within the same URL bucket", () => {
    const containedChannel = buildManagedSiteChannel({
      id: 3,
      base_url: "https://api.example.com",
      models: "gpt-4,gpt-4o-mini,gpt-4.1",
    })
    const similarChannel = buildManagedSiteChannel({
      id: 4,
      base_url: "https://api.example.com",
      models: "gpt-4,gpt-4.1",
    })

    const result = findBestManagedSiteChannelMatch({
      channels: [similarChannel, containedChannel],
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4", "gpt-4o-mini"],
    })

    expect(result.level).toBe(MANAGED_SITE_CHANNEL_MATCH_LEVELS.SECONDARY)
    expect(result.reason).toBe(
      MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_CONTAINED,
    )
    expect(result.channel?.id).toBe(containedChannel.id)
  })

  it("falls back to a similarity-based secondary match when equality and containment fail", () => {
    const similarChannel = buildManagedSiteChannel({
      id: 5,
      base_url: "https://api.example.com",
      models: "gpt-4,gpt-4o,claude-3",
    })

    const result = findBestManagedSiteChannelMatch({
      channels: [similarChannel],
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4", "gpt-4o", "gemini-2.0"],
    })

    expect(result.level).toBe(MANAGED_SITE_CHANNEL_MATCH_LEVELS.SECONDARY)
    expect(result.reason).toBe(
      MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_SIMILAR,
    )
    expect(result.channel?.id).toBe(similarChannel.id)
    expect(result.similarityScore).toBeCloseTo(0.5)
  })

  it("keeps a similarity score exactly at the configured threshold as a secondary match", () => {
    const thresholdChannel = buildManagedSiteChannel({
      id: 5_1,
      base_url: "https://api.example.com",
      models: "gpt-4,gpt-4o,claude-3",
    })

    const result = findBestManagedSiteChannelMatch({
      channels: [thresholdChannel],
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4", "gpt-4o", "gemini-2.0"],
    })

    expect(result.level).toBe(MANAGED_SITE_CHANNEL_MATCH_LEVELS.SECONDARY)
    expect(result.reason).toBe(
      MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_MODELS_SIMILAR,
    )
    expect(result.channel?.id).toBe(thresholdChannel.id)
    expect(result.similarityScore).toBe(
      MANAGED_SITE_CHANNEL_MODEL_SIMILARITY_THRESHOLD,
    )
  })

  it("keeps similarity scores below the configured threshold in fuzzy URL-only fallback", () => {
    const belowThresholdChannel = buildManagedSiteChannel({
      id: 5_2,
      base_url: "https://api.example.com",
      models: "gpt-4,gpt-4o,claude-3,deepseek-r1",
    })

    const result = findBestManagedSiteChannelMatch({
      channels: [belowThresholdChannel],
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4", "gpt-4o", "gemini-2.0"],
    })

    expect(result.level).toBe(MANAGED_SITE_CHANNEL_MATCH_LEVELS.FUZZY)
    expect(result.reason).toBe(MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_ONLY)
    expect(result.channel?.id).toBe(belowThresholdChannel.id)
  })

  it("falls back to a fuzzy URL-only match when no ranked model match exists", () => {
    const fuzzyChannel = buildManagedSiteChannel({
      id: 6,
      base_url: "https://api.example.com",
      models: "claude-3",
    })

    const result = findBestManagedSiteChannelMatch({
      channels: [fuzzyChannel],
      accountBaseUrl: "https://api.example.com",
      models: ["gpt-4"],
    })

    expect(result).toEqual({
      level: MANAGED_SITE_CHANNEL_MATCH_LEVELS.FUZZY,
      reason: MANAGED_SITE_CHANNEL_MATCH_REASONS.URL_ONLY,
      channel: fuzzyChannel,
    })
  })

  it("returns unresolved when no normalized URL bucket exists", () => {
    const result = findBestManagedSiteChannelMatch({
      channels: [
        buildManagedSiteChannel({
          id: 7,
          base_url: "https://different.example.com",
          models: "gpt-4",
        }),
      ],
      accountBaseUrl: "https://api.example.com/v1/openai",
      models: ["gpt-4"],
    })

    expect(result).toEqual({
      level: MANAGED_SITE_CHANNEL_MATCH_LEVELS.NONE,
      reason: MANAGED_SITE_CHANNEL_MATCH_REASONS.UNRESOLVED,
      channel: null,
    })
  })
})
