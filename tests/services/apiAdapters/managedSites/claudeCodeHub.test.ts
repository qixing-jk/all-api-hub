import { beforeEach, describe, expect, it, vi } from "vitest"

import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"

const claudeCodeHubProvider = vi.hoisted(() => ({
  checkValidClaudeCodeHubConfig: vi.fn(),
  listChannels: vi.fn(),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchChannelSecretKey: vi.fn(),
  hydrateComparableChannelKeys: vi.fn(),
  buildClaudeCodeHubCreatePayloadFromFormData: vi.fn((draft) => ({
    name: draft.name.trim(),
    url: draft.base_url.trim(),
    key: draft.key.trim(),
    provider_type: draft.type,
    allowed_models: draft.models.map((model: string) => ({
      matchType: "exact",
      pattern: model,
    })),
    is_enabled: draft.status === 1,
    weight: draft.weight,
    priority: draft.priority,
    group_tag: draft.groups[0],
  })),
  providerToManagedSiteChannel: vi.fn((provider) => ({
    id: provider.id,
    type: provider.providerType,
    key: provider.maskedKey ?? provider.key ?? "",
    name: provider.name,
    base_url: provider.url,
    models:
      provider.allowedModels
        ?.map((item: any) =>
          typeof item === "string"
            ? item
            : item?.matchType === "exact"
              ? item.pattern
              : "",
        )
        .filter(Boolean)
        .join(",") ?? "",
    group: provider.groupTag ?? "default",
    status: provider.isEnabled === false ? 2 : 1,
    weight: provider.weight ?? 1,
    priority: provider.priority ?? 0,
  })),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
}))

const claudeCodeHubApi = vi.hoisted(() => ({
  listProviders: vi.fn(),
  searchProviders: vi.fn(),
  createProvider: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
  getUnmaskedProviderKey: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/claudeCodeHub", () => ({
  ...claudeCodeHubProvider,
}))

vi.mock("~/services/apiService/claudeCodeHub", () => ({
  ...claudeCodeHubApi,
}))

describe("Claude Code Hub managed-site channel capability", () => {
  const config = {
    baseUrl: "https://claude-code-hub.example.invalid",
    adminToken: "admin-token",
  }
  const provider = {
    id: 7,
    name: "Claude Provider",
    url: "https://provider.example.invalid/v1",
    maskedKey: "sk-********",
    isEnabled: false,
    weight: 4,
    priority: 9,
    groupTag: "vip",
    providerType: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
    allowedModels: [
      { matchType: "prefix", pattern: "claude-" },
      { matchType: "exact", pattern: "claude-3-5-sonnet" },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    providerOnlyFlag: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("exposes secret-key and comparable-key hydration helpers", async () => {
    const listResponse = {
      items: [{ id: 1, name: "Claude Code Hub" }],
      total: 1,
      type_counts: { claude: 1 },
    }
    claudeCodeHubProvider.listChannels.mockResolvedValue(listResponse)
    claudeCodeHubProvider.fetchChannelSecretKey.mockResolvedValue("real-key")
    claudeCodeHubProvider.hydrateComparableChannelKeys.mockResolvedValue([
      { id: 1, key: "real-key" },
    ])

    const { claudeCodeHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )

    await expect(claudeCodeHubManagedSiteChannels.list?.(config)).resolves.toBe(
      listResponse,
    )
    await expect(
      claudeCodeHubManagedSiteChannels.fetchSecretKey?.(config, 1),
    ).resolves.toBe("real-key")
    await expect(
      claudeCodeHubManagedSiteChannels.hydrateComparableKeys?.(config, [
        { id: 1, key: "masked" } as never,
      ]),
    ).resolves.toEqual([{ id: 1, key: "real-key" }])
  })

  it("does not expose model-sync methods", async () => {
    const { claudeCodeHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )

    expect(claudeCodeHubManagedSiteChannels.fetchModels).toBeUndefined()
    expect(claudeCodeHubManagedSiteChannels.updateModels).toBeUndefined()
    expect(claudeCodeHubManagedSiteChannels.updateModelMapping).toBeUndefined()
  })

  it("exposes provider config and draft functions", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )

    expect(claudeCodeHubManagedSiteCapabilities.config.checkValid).toBe(
      claudeCodeHubProvider.checkValidClaudeCodeHubConfig,
    )
    expect(claudeCodeHubManagedSiteCapabilities.resources).toEqual({
      items: {
        list: expect.any(Function),
        search: expect.any(Function),
        getDetail: expect.any(Function),
        create: expect.any(Function),
        update: expect.any(Function),
        delete: expect.any(Function),
      },
      drafts: {
        prepareImportDraft: expect.any(Function),
        prepareEditDraft: expect.any(Function),
        describeFields: expect.any(Function),
        validateDraft: expect.any(Function),
      },
      secrets: {
        revealSecret: expect.any(Function),
      },
    })
    expect(claudeCodeHubManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels: claudeCodeHubProvider.fetchAvailableModels,
      buildName: claudeCodeHubProvider.buildChannelName,
      prepareFormData: claudeCodeHubProvider.prepareChannelFormData,
      buildPayload: claudeCodeHubProvider.buildChannelPayload,
    })
    expect(claudeCodeHubManagedSiteCapabilities).not.toHaveProperty("imports")
  })

  it("maps native Claude Code Hub providers to internal resource summaries", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.listProviders.mockResolvedValue([provider])
    claudeCodeHubApi.searchProviders.mockResolvedValue([
      {
        ...provider,
        id: 8,
        name: "Enabled Provider",
        maskedKey: undefined,
        key: "sk-live-provider-key",
        isEnabled: true,
      },
    ])

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.list(config),
    ).resolves.toEqual({
      total: 1,
      items: [
        expect.objectContaining({
          displayName: "Claude Provider",
          nativeKind: "provider",
          status: "disabled",
          typeLabel: "Claude (Anthropic Messages API)",
          endpointLabel: "https://provider.example.invalid/v1",
          modelCount: 1,
          modelPreview: ["claude-3-5-sonnet"],
          secretState: "masked",
          capabilities: {
            canCreate: true,
            canUpdate: true,
            canDelete: true,
            canRevealSecret: true,
          },
          ref: {
            managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
            scopeKey: "https://claude-code-hub.example.invalid",
            resourceId: "7",
          },
        }),
      ],
    })

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.search(
        config,
        "enabled",
      ),
    ).resolves.toEqual({
      total: 1,
      items: [
        expect.objectContaining({
          displayName: "Enabled Provider",
          status: "enabled",
          secretState: "available",
          ref: {
            managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
            scopeKey: "https://claude-code-hub.example.invalid",
            resourceId: "8",
          },
        }),
      ],
    })
  })

  it("reveals Claude Code Hub provider secrets through resource capabilities", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.getUnmaskedProviderKey.mockResolvedValue(
      "  sk-revealed-provider-key  ",
    )

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.secrets?.revealSecret(
        config,
        {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "7",
        },
      ),
    ).resolves.toEqual({
      status: "available",
      secret: "sk-revealed-provider-key",
    })
    expect(claudeCodeHubApi.getUnmaskedProviderKey).toHaveBeenCalledWith(
      config,
      7,
    )
  })

  it("uses channel wording when resource detail cannot find a provider", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.listProviders.mockResolvedValue([])

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.getDetail(config, {
        managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
        scopeKey: "https://claude-code-hub.example.invalid",
        resourceId: "404",
      }),
    ).rejects.toThrow("Channel was not found")
  })

  it("creates Claude Code Hub resources through the provider API payload", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    const createdProvider = {
      ...provider,
      id: 9,
      name: "Created Claude Provider",
      key: "sk-created-provider-key",
      maskedKey: undefined,
      isEnabled: true,
    }
    claudeCodeHubApi.createProvider.mockResolvedValue(createdProvider)

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.create(config, {
        name: "Created Claude Provider",
        type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
        key: "sk-created-provider-key",
        base_url: "https://created-provider.example.invalid/v1",
        models: ["claude-3-5-sonnet"],
        groups: ["vip"],
        priority: 2,
        weight: 5,
        status: 1,
      }),
    ).resolves.toEqual({
      success: true,
      message: "success",
      data: expect.objectContaining({
        displayName: "Created Claude Provider",
        nativeKind: "provider",
        status: "enabled",
        secretState: "available",
        ref: {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "9",
        },
      }),
    })
    expect(
      claudeCodeHubProvider.buildClaudeCodeHubCreatePayloadFromFormData,
    ).toHaveBeenCalledWith({
      name: "Created Claude Provider",
      type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      key: "sk-created-provider-key",
      base_url: "https://created-provider.example.invalid/v1",
      models: ["claude-3-5-sonnet"],
      groups: ["vip"],
      priority: 2,
      weight: 5,
      status: 1,
    })
    expect(claudeCodeHubApi.createProvider).toHaveBeenCalledWith(config, {
      name: "Created Claude Provider",
      url: "https://created-provider.example.invalid/v1",
      key: "sk-created-provider-key",
      provider_type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      allowed_models: [{ matchType: "exact", pattern: "claude-3-5-sonnet" }],
      is_enabled: true,
      weight: 5,
      priority: 2,
      group_tag: "vip",
    })
  })

  it("deletes Claude Code Hub resources by provider id with normalized responses", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.deleteProvider.mockResolvedValue(undefined)

    await expect(
      claudeCodeHubManagedSiteCapabilities.resources.items.delete(config, {
        managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
        scopeKey: "https://claude-code-hub.example.invalid",
        resourceId: "7",
      }),
    ).resolves.toEqual({
      success: true,
      message: "success",
      data: null,
    })
    expect(claudeCodeHubApi.deleteProvider).toHaveBeenCalledWith(config, 7)
  })

  it("preserves native provider fields through resource edits while omitting masked keys", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    claudeCodeHubApi.listProviders.mockResolvedValue([provider])
    claudeCodeHubApi.updateProvider.mockResolvedValue({
      ...provider,
      name: "Edited Claude Provider",
      url: "https://edited-provider.example.invalid/v1",
      weight: 5,
      priority: 2,
    })

    const detail =
      await claudeCodeHubManagedSiteCapabilities.resources.items.getDetail(
        config,
        {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "7",
        },
      )
    const draft =
      claudeCodeHubManagedSiteCapabilities.resources.drafts.prepareEditDraft(
        detail,
      )

    expect(detail.native).toEqual(provider)
    expect(draft).toEqual({
      name: "Claude Provider",
      type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      key: "sk-********",
      base_url: "https://provider.example.invalid/v1",
      models: ["claude-3-5-sonnet"],
      groups: ["vip"],
      priority: 9,
      weight: 4,
      status: 2,
      _claudeCodeHubNativeAllowedModels: provider.allowedModels,
    })

    await claudeCodeHubManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      {
        ...draft,
        name: "Edited Claude Provider",
        base_url: "https://edited-provider.example.invalid/v1",
        weight: 5,
        priority: 2,
      },
    )

    expect(claudeCodeHubApi.updateProvider).toHaveBeenCalledWith(config, {
      ...provider,
      providerId: 7,
      name: "Edited Claude Provider",
      url: "https://edited-provider.example.invalid/v1",
      provider_type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      allowed_models: provider.allowedModels,
      is_enabled: false,
      weight: 5,
      priority: 2,
      group_tag: "vip",
    })
    expect(
      claudeCodeHubApi.updateProvider.mock.calls.at(-1)?.[1],
    ).not.toHaveProperty("key")
  })

  it("allows ordinary edits for prefix-only model rules while preserving native allowed models", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    const prefixOnlyProvider = {
      ...provider,
      allowedModels: [{ matchType: "prefix", pattern: "claude-" }],
    }
    claudeCodeHubApi.listProviders.mockResolvedValue([prefixOnlyProvider])
    claudeCodeHubApi.updateProvider.mockResolvedValue(prefixOnlyProvider)

    const detail =
      await claudeCodeHubManagedSiteCapabilities.resources.items.getDetail(
        config,
        {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "7",
        },
      )
    const draft =
      claudeCodeHubManagedSiteCapabilities.resources.drafts.prepareEditDraft(
        detail,
      )

    expect(draft.models).toEqual([])
    expect(
      claudeCodeHubManagedSiteCapabilities.resources.drafts.validateDraft(
        draft,
      ),
    ).toEqual({ valid: true, errors: [] })

    await claudeCodeHubManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      {
        ...draft,
        name: "Edited Prefix Provider",
      },
    )

    expect(claudeCodeHubApi.updateProvider).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        providerId: 7,
        name: "Edited Prefix Provider",
        allowed_models: prefixOnlyProvider.allowedModels,
        providerOnlyFlag: true,
      }),
    )
    expect(
      claudeCodeHubApi.updateProvider.mock.calls.at(-1)?.[1],
    ).not.toHaveProperty("key")
  })

  it("preserves non-exact native model rules when exact models are edited", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    const mixedRuleProvider = {
      ...provider,
      allowedModels: [
        { matchType: "prefix", pattern: "claude-" },
        { matchType: "exact", pattern: "claude-3-5-sonnet" },
      ],
    }
    claudeCodeHubApi.listProviders.mockResolvedValue([mixedRuleProvider])
    claudeCodeHubApi.updateProvider.mockResolvedValue(mixedRuleProvider)

    const detail =
      await claudeCodeHubManagedSiteCapabilities.resources.items.getDetail(
        config,
        {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "7",
        },
      )
    const draft =
      claudeCodeHubManagedSiteCapabilities.resources.drafts.prepareEditDraft(
        detail,
      )

    await claudeCodeHubManagedSiteCapabilities.resources.items.update(
      config,
      detail,
      {
        ...draft,
        models: ["claude-3-7-sonnet"],
      },
    )

    expect(claudeCodeHubApi.updateProvider).toHaveBeenCalledWith(
      config,
      expect.objectContaining({
        allowed_models: [
          { matchType: "prefix", pattern: "claude-" },
          { matchType: "exact", pattern: "claude-3-7-sonnet" },
        ],
      }),
    )
  })

  it("blocks clearing exact model rules instead of silently preserving old allowed models", async () => {
    const { claudeCodeHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/claudeCodeHub"
    )
    const exactModelProvider = {
      ...provider,
      allowedModels: ["claude-3-5-sonnet"],
    }
    claudeCodeHubApi.listProviders.mockResolvedValue([exactModelProvider])

    const detail =
      await claudeCodeHubManagedSiteCapabilities.resources.items.getDetail(
        config,
        {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://claude-code-hub.example.invalid",
          resourceId: "7",
        },
      )
    const draft =
      claudeCodeHubManagedSiteCapabilities.resources.drafts.prepareEditDraft(
        detail,
      )

    expect(draft.models).toEqual(["claude-3-5-sonnet"])
    expect(
      claudeCodeHubManagedSiteCapabilities.resources.drafts.validateDraft({
        ...draft,
        models: [],
      }),
    ).toEqual({
      valid: false,
      errors: [
        {
          field: "models",
          message: "At least one model is required",
        },
      ],
    })
  })
})
