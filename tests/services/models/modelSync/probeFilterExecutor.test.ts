import { describe, expect, it, vi } from "vitest"

import {
  filterModelsByProbeRules,
  runProbeForModel,
} from "~/services/models/modelSync/probeFilterExecutor"
import type { ChannelConfig } from "~/types/channelConfig"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import type { ManagedSiteChannel } from "~/types/managedSite"

vi.mock("~/services/verification/aiApiVerification", () => ({
  runApiVerificationProbe: vi.fn(),
}))

const { runApiVerificationProbe } = await import(
  "~/services/verification/aiApiVerification"
)

describe("runProbeForModel", () => {
  it("should return true when probe passes", async () => {
    vi.mocked(runApiVerificationProbe).mockResolvedValue({
      id: "text-generation",
      status: "pass",
      latencyMs: 100,
      summary: "Success",
    })

    const result = await runProbeForModel({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      apiType: "openai",
      modelId: "gpt-4",
      probeId: "text-generation",
      timeout: 5000,
    })

    expect(result).toBe(true)
  })

  it("should return false when probe fails", async () => {
    vi.mocked(runApiVerificationProbe).mockResolvedValue({
      id: "text-generation",
      status: "fail",
      latencyMs: 50,
      summary: "Model not found",
    })

    const result = await runProbeForModel({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      apiType: "openai",
      modelId: "invalid-model",
      probeId: "text-generation",
      timeout: 5000,
    })

    expect(result).toBe(false)
  })

  it("should return false on timeout", async () => {
    vi.mocked(runApiVerificationProbe).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                id: "text-generation",
                status: "pass",
                latencyMs: 10000,
                summary: "Success",
              }),
            10000,
          ),
        ),
    )

    const result = await runProbeForModel({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      apiType: "openai",
      modelId: "gpt-4",
      probeId: "text-generation",
      timeout: 100,
    })

    expect(result).toBe(false)
  })

  it("should return false on error", async () => {
    vi.mocked(runApiVerificationProbe).mockRejectedValue(
      new Error("Network error"),
    )

    const result = await runProbeForModel({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      apiType: "openai",
      modelId: "gpt-4",
      probeId: "text-generation",
      timeout: 5000,
    })

    expect(result).toBe(false)
  })
})

describe("filterModelsByProbeRules", () => {
  const mockChannel: ManagedSiteChannel = {
    id: 1,
    name: "Test Channel",
    type: 1,
    key: "channel-key",
    base_url: "https://api.example.com/v1",
    models: "gpt-4,gpt-3.5-turbo,claude-3",
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

  const mockChannelConfig: ChannelConfig = {
    channelId: 1,
    modelFilterSettings: { rules: [], updatedAt: Date.now() },
    verificationCredentials: {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      apiType: "openai",
      updatedAt: Date.now(),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  it("should return all models when no probe rules", async () => {
    const models = ["gpt-4", "gpt-3.5-turbo", "claude-3"]

    const result = await filterModelsByProbeRules({
      models,
      channel: mockChannel,
      probeRules: [],
      channelConfig: mockChannelConfig,
    })

    expect(result).toEqual(models)
  })

  it("should return all models when probe rules are disabled", async () => {
    const models = ["gpt-4", "gpt-3.5-turbo", "claude-3"]
    const disabledRule: ChannelModelFilterRule = {
      id: "rule-1",
      ruleType: "probe",
      name: "Disabled Rule",
      probeId: "text-generation",
      apiType: "openai",
      action: "include",
      enabled: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = await filterModelsByProbeRules({
      models,
      channel: mockChannel,
      probeRules: [disabledRule],
      channelConfig: mockChannelConfig,
    })

    expect(result).toEqual(models)
  })

  it("should filter models with include probe rules", async () => {
    vi.mocked(runApiVerificationProbe).mockImplementation(
      async ({ modelId }: any) => {
        if (modelId === "gpt-4") {
          return {
            id: "text-generation",
            status: "pass",
            latencyMs: 100,
            summary: "Success",
          }
        }
        return {
          id: "text-generation",
          status: "fail",
          latencyMs: 50,
          summary: "Failed",
        }
      },
    )

    const models = ["gpt-4", "gpt-3.5-turbo", "claude-3"]
    const includeRule: ChannelModelFilterRule = {
      id: "rule-1",
      ruleType: "probe",
      name: "Include GPT-4",
      probeId: "text-generation",
      apiType: "openai",
      action: "include",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = await filterModelsByProbeRules({
      models,
      channel: mockChannel,
      probeRules: [includeRule],
      channelConfig: mockChannelConfig,
    })

    expect(result).toEqual(["gpt-4"])
  })

  it("should filter models with exclude probe rules", async () => {
    vi.mocked(runApiVerificationProbe).mockImplementation(
      async ({ modelId }: any) => {
        if (modelId === "gpt-4") {
          return {
            id: "text-generation",
            status: "pass",
            latencyMs: 100,
            summary: "Success",
          }
        }
        return {
          id: "text-generation",
          status: "fail",
          latencyMs: 50,
          summary: "Failed",
        }
      },
    )

    const models = ["gpt-4", "gpt-3.5-turbo", "claude-3"]
    const excludeRule: ChannelModelFilterRule = {
      id: "rule-1",
      ruleType: "probe",
      name: "Exclude GPT-4",
      probeId: "text-generation",
      apiType: "openai",
      action: "exclude",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = await filterModelsByProbeRules({
      models,
      channel: mockChannel,
      probeRules: [excludeRule],
      channelConfig: mockChannelConfig,
    })

    expect(result).toEqual(["gpt-3.5-turbo", "claude-3"])
  })

  it("should skip probe rules with missing credentials", async () => {
    const models = ["gpt-4", "gpt-3.5-turbo"]
    const channelWithoutKey: ManagedSiteChannel = {
      ...mockChannel,
      key: "",
    }

    const probeRule: ChannelModelFilterRule = {
      id: "rule-1",
      ruleType: "probe",
      name: "Test Rule",
      probeId: "text-generation",
      apiType: "openai",
      action: "include",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = await filterModelsByProbeRules({
      models,
      channel: channelWithoutKey,
      probeRules: [probeRule],
    })

    expect(result).toEqual([])
  })

  it("should call onProgress callback", async () => {
    vi.mocked(runApiVerificationProbe).mockResolvedValue({
      id: "text-generation",
      status: "pass",
      latencyMs: 100,
      summary: "Success",
    })

    const models = ["gpt-4", "gpt-3.5-turbo"]
    const onProgress = vi.fn()

    const includeRule: ChannelModelFilterRule = {
      id: "rule-1",
      ruleType: "probe",
      name: "Include All",
      probeId: "text-generation",
      apiType: "openai",
      action: "include",
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    await filterModelsByProbeRules({
      models,
      channel: mockChannel,
      probeRules: [includeRule],
      channelConfig: mockChannelConfig,
      onProgress,
    })

    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenCalledWith("gpt-4", 1, 2)
    expect(onProgress).toHaveBeenCalledWith("gpt-3.5-turbo", 2, 2)
  })
})
