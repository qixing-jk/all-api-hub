import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  ClaudeCodeHubProviderTypeOptions,
  DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS,
} from "~/constants/claudeCodeHub"
import {
  buildClaudeCodeHubCreatePayloadFromFormData,
  buildClaudeCodeHubUpdatePayloadFromChannelData,
  prepareChannelFormData,
  providerToManagedSiteChannel,
} from "~/services/managedSites/providers/claudeCodeHub"
import { CHANNEL_STATUS } from "~/types/managedSite"

const mockFetchTokenScopedModels = vi.fn()

vi.mock("~/services/managedSites/utils/fetchTokenScopedModels", () => ({
  fetchTokenScopedModels: (...args: unknown[]) =>
    mockFetchTokenScopedModels(...args),
}))

vi.mock("~/utils/i18n/core", () => ({
  t: (key: string) => key,
}))

describe("Claude Code Hub managed-site provider", () => {
  beforeEach(() => {
    mockFetchTokenScopedModels.mockReset()
  })

  it("normalizes provider display records into managed-site channels", () => {
    const channel = providerToManagedSiteChannel({
      id: 7,
      name: "OpenAI Provider",
      providerType: "openai-compatible",
      url: "https://api.example.com",
      maskedKey: "sk-***",
      isEnabled: false,
      weight: 3,
      priority: 9,
      groupTag: "paid",
      allowedModels: [
        { matchType: "exact", pattern: "gpt-4o" },
        { matchType: "regex", pattern: "gpt-.*" },
        "claude-sonnet",
      ],
      createdAt: "2026-04-27T00:00:00.000Z",
    })

    expect(channel).toMatchObject({
      id: 7,
      name: "OpenAI Provider",
      type: "openai-compatible",
      base_url: "https://api.example.com",
      key: "sk-***",
      status: CHANNEL_STATUS.ManuallyDisabled,
      weight: 3,
      priority: 9,
      group: "paid",
      models: "gpt-4o,claude-sonnet",
    })
    expect(channel._claudeCodeHubData.name).toBe("OpenAI Provider")
  })

  it("exposes only the supported provider types in add-flow options", () => {
    expect(ClaudeCodeHubProviderTypeOptions).toEqual([
      {
        value: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
        label: "OpenAI Compatible",
      },
      {
        value: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
        label: "Codex (Responses API)",
      },
      {
        value: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
        label: "Claude (Anthropic Messages API)",
      },
      {
        value: CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
        label: "Gemini (Google Gemini API)",
      },
    ])
  })

  it("preserves legacy provider types returned by Claude Code Hub", () => {
    const channel = providerToManagedSiteChannel({
      id: 8,
      name: "Legacy Gemini CLI Provider",
      providerType: "gemini-cli",
      url: "https://api.example.com",
      allowedModels: ["gemini-2.5-pro"],
    })

    expect(channel.type).toBe("gemini-cli")
  })

  it("maps create form data to CCH provider payloads and validates real keys", () => {
    expect(
      buildClaudeCodeHubCreatePayloadFromFormData({
        name: "Provider",
        type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
        key: "sk-real-key",
        base_url: "https://api.example.com",
        models: ["gpt-4o"],
        groups: ["paid"],
        priority: 2,
        weight: 0,
        status: CHANNEL_STATUS.Enable,
      }),
    ).toEqual({
      name: "Provider",
      url: "https://api.example.com",
      key: "sk-real-key",
      provider_type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
      allowed_models: [{ matchType: "exact", pattern: "gpt-4o" }],
      is_enabled: true,
      weight: 1,
      priority: 2,
      group_tag: "paid",
    })

    expect(() =>
      buildClaudeCodeHubCreatePayloadFromFormData({
        ...DEFAULT_CLAUDE_CODE_HUB_CHANNEL_FIELDS,
        name: "Provider",
        key: "sk-***",
        base_url: "https://api.example.com",
        models: ["gpt-4o"],
      }),
    ).toThrow("messages:claudeCodeHub.realProviderKeyRequired")

    expect(
      buildClaudeCodeHubCreatePayloadFromFormData({
        name: "Weighted Provider",
        type: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
        key: "sk-real-key",
        base_url: "https://api.example.com",
        models: ["gpt-4o"],
        groups: ["paid"],
        priority: 2,
        weight: Number.NaN,
        status: CHANNEL_STATUS.Enable,
      }),
    ).toMatchObject({
      weight: 1,
    })
  })

  it("omits masked keys on update and sends replacement keys only when usable", () => {
    expect(
      buildClaudeCodeHubUpdatePayloadFromChannelData({
        id: 7,
        name: "Provider",
        type: "gemini-cli",
        key: "sk-***",
        base_url: "https://api.example.com",
        models: "gemini-2.5-pro",
        groups: ["default"],
        priority: 3,
        weight: 4,
        status: CHANNEL_STATUS.ManuallyDisabled,
      }),
    ).toEqual({
      providerId: 7,
      name: "Provider",
      provider_type: "gemini-cli",
      url: "https://api.example.com",
      allowed_models: [{ matchType: "exact", pattern: "gemini-2.5-pro" }],
      is_enabled: false,
      weight: 4,
      priority: 3,
      group_tag: "default",
    })

    expect(
      buildClaudeCodeHubUpdatePayloadFromChannelData({
        id: 7,
        key: "sk-replacement",
      }),
    ).toMatchObject({ providerId: 7, key: "sk-replacement" })
  })

  it("prepares account-token import form data with default provider type and model fallback", async () => {
    mockFetchTokenScopedModels.mockResolvedValueOnce({
      models: ["gpt-4o"],
      fetchFailed: false,
    })

    await expect(
      prepareChannelFormData(
        {
          id: "account-1",
          name: "Account",
          baseUrl: "https://api.example.com",
        } as any,
        { id: 1, name: "Token", key: "sk-real-key" } as any,
      ),
    ).resolves.toMatchObject({
      name: "Account | Token (auto)",
      type: "openai-compatible",
      key: "sk-real-key",
      base_url: "https://api.example.com",
      models: ["gpt-4o"],
      groups: ["default"],
      weight: 1,
    })

    mockFetchTokenScopedModels.mockResolvedValueOnce({
      models: [],
      fetchFailed: true,
    })

    await expect(
      prepareChannelFormData(
        {
          id: "account-1",
          name: "Account",
          baseUrl: "https://api.example.com",
        } as any,
        { id: 1, name: "Token", key: "sk-real-key" } as any,
      ),
    ).resolves.toMatchObject({
      models: [],
      modelPrefillFetchFailed: true,
    })
  })
})
