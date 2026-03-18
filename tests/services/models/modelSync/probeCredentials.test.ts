import { describe, expect, it } from "vitest"

import { resolveProbeCredentials } from "~/services/models/modelSync/probeCredentials"
import type { ChannelConfig } from "~/types/channelConfig"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { ManagedSiteChannel } from "~/types/managedSite"

describe("resolveProbeCredentials", () => {
  const mockChannel: ManagedSiteChannel = {
    id: 1,
    name: "Test Channel",
    type: 1,
    key: "channel-key-123",
    base_url: "https://channel.example.com/v1",
    models: "gpt-4,gpt-3.5-turbo",
    group: "default",
    status: 1,
    priority: 0,
    weight: 100,
    created_time: Date.now(),
    test_time: 0,
    response_time: 0,
    openai_organization: null,
    test_model: null,
    other: "",
    balance: 0,
    balance_updated_time: 0,
    used_quota: 0,
    model_mapping: "{}",
    status_code_mapping: "{}",
    auto_ban: 0,
    other_info: "{}",
    tag: null,
    param_override: null,
    header_override: null,
    remark: null,
    channel_info: {} as any,
    setting: "{}",
    settings: "{}",
  }

  const mockProbeRule: ChannelModelFilterRule = {
    id: "rule-1",
    ruleType: "probe",
    name: "Test Probe Rule",
    action: "include",
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    probeId: "text-generation",
    apiType: "openai-compatible",
  }

  it("should return null for non-probe rules", () => {
    const patternRule: ChannelModelFilterRule = {
      ...mockProbeRule,
      ruleType: "pattern",
      pattern: "gpt-4",
    }

    const result = resolveProbeCredentials({
      channel: mockChannel,
      rule: patternRule,
    })

    expect(result).toBeNull()
  })

  it("should prioritize rule-specific credentials", () => {
    const ruleWithCreds: ChannelModelFilterRule = {
      ...mockProbeRule,
      verificationBaseUrl: "https://rule.example.com/v1",
      verificationApiKey: "rule-key-456",
      apiType: "openai",
    }

    const channelConfig: ChannelConfig = {
      channelId: 1,
      modelFilterSettings: { rules: [], updatedAt: Date.now() },
      verificationCredentials: {
        baseUrl: "https://config.example.com/v1",
        apiKey: "config-key-789",
        apiType: "anthropic",
        updatedAt: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = resolveProbeCredentials({
      channel: mockChannel,
      rule: ruleWithCreds,
      channelConfig,
    })

    expect(result).toEqual({
      baseUrl: "https://rule.example.com/v1",
      apiKey: "rule-key-456",
      apiType: "openai",
    })
  })

  it("should fall back to channelConfig credentials", () => {
    const channelConfig: ChannelConfig = {
      channelId: 1,
      modelFilterSettings: { rules: [], updatedAt: Date.now() },
      verificationCredentials: {
        baseUrl: "https://config.example.com/v1",
        apiKey: "config-key-789",
        apiType: "anthropic",
        updatedAt: Date.now(),
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = resolveProbeCredentials({
      channel: mockChannel,
      rule: mockProbeRule,
      channelConfig,
    })

    expect(result).toEqual({
      baseUrl: "https://config.example.com/v1",
      apiKey: "config-key-789",
      apiType: "anthropic",
    })
  })

  it("should fall back to channel credentials", () => {
    const result = resolveProbeCredentials({
      channel: mockChannel,
      rule: mockProbeRule,
    })

    expect(result).toEqual({
      baseUrl: "https://channel.example.com/v1",
      apiKey: "channel-key-123",
      apiType: "openai-compatible",
    })
  })

  it("should return null if channel key is missing", () => {
    const channelWithoutKey: ManagedSiteChannel = {
      ...mockChannel,
      key: "",
    }

    const result = resolveProbeCredentials({
      channel: channelWithoutKey,
      rule: mockProbeRule,
    })

    expect(result).toBeNull()
  })

  it("should return null if any credential field is missing", () => {
    const ruleWithPartialCreds: ChannelModelFilterRule = {
      ...mockProbeRule,
      verificationBaseUrl: "https://rule.example.com/v1",
      verificationApiKey: "",
    }

    const channelWithoutKey: ManagedSiteChannel = {
      ...mockChannel,
      key: "",
    }

    const result = resolveProbeCredentials({
      channel: channelWithoutKey,
      rule: ruleWithPartialCreds,
    })

    expect(result).toBeNull()
  })

  it("should trim whitespace from credentials", () => {
    const ruleWithWhitespace: ChannelModelFilterRule = {
      ...mockProbeRule,
      verificationBaseUrl: "  https://rule.example.com/v1  ",
      verificationApiKey: "  rule-key-456  ",
      apiType: "  openai  ",
    }

    const result = resolveProbeCredentials({
      channel: mockChannel,
      rule: ruleWithWhitespace,
    })

    expect(result).toEqual({
      baseUrl: "https://rule.example.com/v1",
      apiKey: "rule-key-456",
      apiType: "openai",
    })
  })
})
