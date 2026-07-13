import { describe, expect, it, vi } from "vitest"

import { AXON_HUB_CHANNEL_STATUS } from "~/constants/axonHub"
import { SITE_TYPES } from "~/constants/siteType"
import type { AxonHubChannel } from "~/types/axonHub"
import { CHANNEL_STATUS } from "~/types/managedSite"

const axonHubProvider = vi.hoisted(() => ({
  checkValidAxonHubConfig: vi.fn(),
  listChannels: vi.fn(),
  searchChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchAvailableModels: vi.fn(),
  buildChannelName: vi.fn(),
  prepareChannelFormData: vi.fn(),
  buildChannelPayload: vi.fn(),
}))

const axonHubApi = vi.hoisted(() => ({
  axonHubChannelToManagedSite: vi.fn(),
  createAxonHubChannel: vi.fn(),
  updateAxonHubChannel: vi.fn(),
  updateAxonHubChannelStatus: vi.fn(),
  deleteAxonHubChannel: vi.fn(),
}))

const userPreferences = vi.hoisted(() => ({
  getPreferences: vi.fn(),
}))

vi.mock("~/services/managedSites/providers/axonHub", () => ({
  ...axonHubProvider,
}))

vi.mock("~/services/apiService/axonHub", () => ({
  ...axonHubApi,
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences,
}))

describe("AxonHub managed-site channel capability", () => {
  const config = {
    baseUrl: "https://axonhub.example.invalid",
    email: "admin@example.invalid",
    password: "password",
  }

  it("returns null on search failure via the provider protocol helper", async () => {
    axonHubProvider.searchChannel.mockResolvedValue(null)

    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteChannels.search(config, "missing"),
    ).resolves.toBeNull()
  })

  it("exposes direct channel listing without model-sync write methods", async () => {
    const listResponse = {
      items: [{ id: 1, name: "Axon" }],
      total: 1,
      type_counts: { openai: 1 },
    }
    axonHubProvider.listChannels.mockResolvedValue(listResponse)

    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(axonHubManagedSiteChannels.list?.(config)).resolves.toBe(
      listResponse,
    )
    expect(axonHubProvider.listChannels).toHaveBeenCalledWith(config)
    expect(axonHubManagedSiteChannels.fetchModels).toBeUndefined()
    expect(axonHubManagedSiteChannels.updateModels).toBeUndefined()
    expect(axonHubManagedSiteChannels.updateModelMapping).toBeUndefined()
  })

  it("returns ApiResponse objects for create, update, and delete", async () => {
    axonHubProvider.createChannel.mockResolvedValue({
      success: true,
      data: { id: 1 },
      message: "success",
    })
    axonHubProvider.updateChannel.mockResolvedValue({
      success: true,
      data: { id: 1 },
      message: "success",
    })
    axonHubProvider.deleteChannel.mockResolvedValue({
      success: true,
      data: true,
      message: "success",
    })

    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteChannels.create(config, {
        mode: "single",
        channel: { name: "channel", status: 1 },
      }),
    ).resolves.toEqual({
      success: true,
      data: { id: 1 },
      message: "success",
    })
    await expect(
      axonHubManagedSiteChannels.update(config, { id: 1 }),
    ).resolves.toEqual({
      success: true,
      data: { id: 1 },
      message: "success",
    })
    await expect(axonHubManagedSiteChannels.delete(config, 1)).resolves.toEqual(
      {
        success: true,
        data: true,
        message: "success",
      },
    )
  })

  it("does not expose model-sync methods", async () => {
    const { axonHubManagedSiteChannels } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    expect(axonHubManagedSiteChannels.fetchModels).toBeUndefined()
    expect(axonHubManagedSiteChannels.updateModels).toBeUndefined()
    expect(axonHubManagedSiteChannels.updateModelMapping).toBeUndefined()
  })

  it("exposes provider config and draft functions", async () => {
    userPreferences.getPreferences.mockResolvedValue({
      axonHub: config,
    })
    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(axonHubManagedSiteCapabilities.config.get()).resolves.toBe(
      config,
    )
    expect(axonHubManagedSiteCapabilities.config.checkValid).toBe(
      axonHubProvider.checkValidAxonHubConfig,
    )
    expect(axonHubManagedSiteCapabilities.channelDrafts).toEqual({
      fetchAvailableModels: axonHubProvider.fetchAvailableModels,
      buildName: axonHubProvider.buildChannelName,
      prepareFormData: axonHubProvider.prepareChannelFormData,
      buildPayload: axonHubProvider.buildChannelPayload,
    })
    expect(axonHubManagedSiteCapabilities).not.toHaveProperty("imports")
  })

  it("returns null when AxonHub runtime config is incomplete", async () => {
    userPreferences.getPreferences.mockResolvedValue({
      axonHub: {
        baseUrl: "",
        email: "",
        password: "",
      },
    })
    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteCapabilities.config.get(),
    ).resolves.toBeNull()
  })

  it("maps AxonHub GraphQL channels into string-id resource summaries", async () => {
    const native = buildAxonHubChannel({
      id: "gid://axonhub/Channel/native-string-id",
      type: "custom_native",
      supportedModels: ["gpt-4o"],
      manualModels: ["claude-3-5-sonnet"],
      orderingWeight: 7,
    })
    axonHubProvider.listChannels.mockResolvedValue({
      items: [buildAxonHubChannelRow(native)],
      total: 1,
      type_counts: { custom_native: 1 },
    })

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteCapabilities.resources?.items.list(config),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          ref: {
            managedSiteType: SITE_TYPES.AXON_HUB,
            scopeKey: "https://axonhub.example.invalid",
            resourceId: "gid://axonhub/Channel/native-string-id",
          },
          displayName: "Axon Native",
          nativeKind: "channel",
          status: "enabled",
          typeLabel: "custom_native",
          endpointLabel: "https://upstream.example.invalid/v1",
          modelCount: 2,
          modelPreview: ["gpt-4o", "claude-3-5-sonnet"],
          secretState: "available",
          capabilities: {
            canCreate: true,
            canUpdate: true,
            canDelete: true,
            canRevealSecret: false,
          },
        }),
      ],
      total: 1,
    })
  })

  it("maps AxonHub resource search results into string-id resource summaries", async () => {
    const native = buildAxonHubChannel({
      id: "gid://axonhub/Channel/search-string-id",
      name: "Search Result",
      type: "openrouter",
      supportedModels: ["openrouter/auto"],
      manualModels: [],
    })
    axonHubProvider.searchChannel.mockResolvedValue({
      items: [buildAxonHubChannelRow(native)],
      total: 1,
      type_counts: { openrouter: 1 },
    })

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteCapabilities.resources?.items.search(config, "search"),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          ref: expect.objectContaining({
            managedSiteType: SITE_TYPES.AXON_HUB,
            resourceId: "gid://axonhub/Channel/search-string-id",
          }),
          displayName: "Search Result",
          typeLabel: "OpenRouter",
          modelCount: 1,
          modelPreview: ["openrouter/auto"],
        }),
      ],
      total: 1,
    })
  })

  it("returns null when AxonHub resource search misses", async () => {
    axonHubProvider.searchChannel.mockResolvedValue(null)

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteCapabilities.resources?.items.search(config, "missing"),
    ).resolves.toBeNull()
  })

  it("maps AxonHub single-key and unavailable credential states", async () => {
    const singleKeyNative = buildAxonHubChannel({
      id: "gid://axonhub/Channel/single-key",
      credentials: {
        apiKey: "sk-single-key",
      },
    })
    const noKeyNative = buildAxonHubChannel({
      id: "gid://axonhub/Channel/no-key",
      credentials: {},
    })
    axonHubProvider.listChannels.mockResolvedValue({
      items: [
        buildAxonHubChannelRow(singleKeyNative),
        buildAxonHubChannelRow(noKeyNative),
      ],
      total: 2,
      type_counts: { openai: 2 },
    })

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteCapabilities.resources?.items.list(config),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          ref: expect.objectContaining({ resourceId: singleKeyNative.id }),
          secretState: "available",
        }),
        expect.objectContaining({
          ref: expect.objectContaining({ resourceId: noKeyNative.id }),
          secretState: "unavailable",
        }),
      ],
      total: 2,
    })
  })

  it("fetches native detail before edit and preserves AxonHub-only fields on update", async () => {
    const native = buildAxonHubChannel({
      id: "gid://axonhub/Channel/native-string-id",
      type: "anthropic_gcp",
      credentials: {
        apiKeys: ["sk-live-native"],
        gcp: {
          region: "us-central1",
          projectID: "example-project",
          jsonData: '{"client_email":"svc@example.invalid"}',
        },
      },
      supportedModels: ["claude-3-5-sonnet"],
      manualModels: ["claude-3-opus"],
      defaultTestModel: "claude-3-opus",
      settings: {
        hideMappedModels: true,
        modelMappings: [{ from: "claude-3", to: "claude-3-5-sonnet" }],
      },
      orderingWeight: 12,
      remark: "native remark",
    })
    const updated = { ...native, name: "Axon Updated" }
    axonHubProvider.listChannels.mockResolvedValue({
      items: [buildAxonHubChannelRow(native)],
      total: 1,
      type_counts: { anthropic_gcp: 1 },
    })
    axonHubApi.updateAxonHubChannel.mockResolvedValue(updated)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(updated),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const ref = {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    }

    const detail = await resources.items.getDetail(config, ref)
    const draft = resources.drafts.prepareEditDraft(detail)
    await resources.items.update(config, detail, {
      ...draft,
      name: "Axon Updated",
    })

    expect(detail.native).toBe(native)
    expect(draft).toEqual({
      name: "Axon Native",
      type: "anthropic_gcp",
      key: "sk-live-native",
      base_url: "https://upstream.example.invalid/v1",
      models: ["claude-3-5-sonnet", "claude-3-opus"],
      groups: [],
      priority: 0,
      weight: 12,
      status: CHANNEL_STATUS.Enable,
    })
    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      "gid://axonhub/Channel/native-string-id",
      {
        type: "anthropic_gcp",
        name: "Axon Updated",
        baseURL: "https://upstream.example.invalid/v1",
        credentials: native.credentials,
        supportedModels: ["claude-3-5-sonnet"],
        manualModels: ["claude-3-opus"],
        defaultTestModel: "claude-3-opus",
        settings: native.settings,
        orderingWeight: 12,
        remark: "native remark",
      },
    )
    expect(axonHubApi.updateAxonHubChannelStatus).not.toHaveBeenCalled()
  })

  it("rejects stale AxonHub resource refs from a different site or scope before native access", async () => {
    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!

    await expect(
      resources.items.getDetail(config, {
        managedSiteType: SITE_TYPES.NEW_API,
        scopeKey: "https://axonhub.example.invalid",
        resourceId: "gid://axonhub/Channel/native-string-id",
      }),
    ).rejects.toThrow("Resource reference does not match this managed site")
    await expect(
      resources.items.delete(config, {
        managedSiteType: SITE_TYPES.AXON_HUB,
        scopeKey: "https://other.example.invalid",
        resourceId: "gid://axonhub/Channel/native-string-id",
      }),
    ).rejects.toThrow("Resource reference does not match this managed site")

    expect(axonHubProvider.listChannels).not.toHaveBeenCalled()
    expect(axonHubApi.deleteAxonHubChannel).not.toHaveBeenCalled()
  })

  it("preserves null AxonHub settings when building resource update payloads", async () => {
    const native = buildAxonHubChannel({
      settings: null,
    })
    axonHubProvider.listChannels.mockResolvedValue({
      items: [buildAxonHubChannelRow(native)],
      total: 1,
      type_counts: { openai: 1 },
    })
    axonHubApi.updateAxonHubChannel.mockResolvedValue(native)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(native),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })

    await resources.items.update(
      config,
      detail,
      resources.drafts.prepareEditDraft(detail),
    )

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      native.id,
      expect.objectContaining({
        settings: null,
      }),
    )
  })

  it("preserves multi-key AxonHub credentials when the draft key is unchanged", async () => {
    const native = buildAxonHubChannel({
      credentials: {
        apiKeys: ["sk-primary", "sk-secondary"],
      },
    })
    axonHubProvider.listChannels.mockResolvedValue({
      items: [buildAxonHubChannelRow(native)],
      total: 1,
      type_counts: { openai: 1 },
    })
    axonHubApi.updateAxonHubChannel.mockResolvedValue({
      ...native,
      name: "Renamed Axon",
    })
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow({ ...native, name: "Renamed Axon" }),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })
    const draft = resources.drafts.prepareEditDraft(detail)

    expect(draft.key).toBe("sk-primary")

    await resources.items.update(config, detail, {
      ...draft,
      name: "Renamed Axon",
    })

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenLastCalledWith(
      config,
      native.id,
      expect.objectContaining({
        credentials: native.credentials,
      }),
    )
  })

  it("preserves native AxonHub model arrays even when the generic model draft changes", async () => {
    const native = buildAxonHubChannel({
      supportedModels: ["native-supported"],
      manualModels: ["native-manual"],
      defaultTestModel: "native-manual",
    })
    axonHubProvider.listChannels.mockResolvedValue({
      items: [buildAxonHubChannelRow(native)],
      total: 1,
      type_counts: { openai: 1 },
    })
    axonHubApi.updateAxonHubChannel.mockResolvedValue(native)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(native),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })

    await resources.items.update(config, detail, {
      ...resources.drafts.prepareEditDraft(detail),
      models: ["draft-edited-model"],
    })

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      native.id,
      expect.objectContaining({
        supportedModels: ["native-supported"],
        manualModels: ["native-manual"],
        defaultTestModel: "native-manual",
      }),
    )
  })

  it("preserves nullable AxonHub default model and ordering weight on no-op edits", async () => {
    const native = buildAxonHubChannel({
      supportedModels: ["native-supported"],
      manualModels: ["native-manual"],
      defaultTestModel: null,
      orderingWeight: null,
    })
    axonHubProvider.listChannels.mockResolvedValue({
      items: [buildAxonHubChannelRow(native)],
      total: 1,
      type_counts: { openai: 1 },
    })
    axonHubApi.updateAxonHubChannel.mockResolvedValue(native)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(native),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })

    await resources.items.update(
      config,
      detail,
      resources.drafts.prepareEditDraft(detail),
    )

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      native.id,
      expect.objectContaining({
        defaultTestModel: null,
        orderingWeight: null,
      }),
    )
  })

  it("does not expose an editable generic models field for AxonHub resource edits", async () => {
    const native = buildAxonHubChannel({
      supportedModels: ["native-supported"],
      manualModels: ["native-manual"],
    })

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const descriptors =
      axonHubManagedSiteCapabilities.resources!.drafts.describeFields({
        mode: "edit",
        detail: {
          summary: {
            ref: {
              managedSiteType: SITE_TYPES.AXON_HUB,
              scopeKey: "https://axonhub.example.invalid",
              resourceId: native.id,
            },
            displayName: native.name,
            nativeKind: "channel",
            status: "enabled",
            secretState: "available",
            capabilities: { canUpdate: true },
          },
          native,
        },
      })

    expect(descriptors.map((descriptor) => descriptor.name)).not.toContain(
      "models",
    )
  })

  it("prepares and validates AxonHub resource import drafts", async () => {
    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const sourceDraft = {
      name: "Source Axon",
      type: "openai",
      key: "sk-source",
      base_url: "https://source.example.invalid/v1",
      models: ["gpt-4o"],
      groups: [],
      priority: 0,
      weight: 3,
      status: CHANNEL_STATUS.Enable,
    }

    await expect(
      resources.drafts.prepareImportDraft({ source: sourceDraft }),
    ).resolves.toBe(sourceDraft)
    await expect(
      resources.drafts.prepareImportDraft({
        resource: {
          ref: {
            managedSiteType: SITE_TYPES.AXON_HUB,
            scopeKey: "https://axonhub.example.invalid",
            resourceId: "gid://axonhub/Channel/imported",
          },
          displayName: "Imported Axon",
          nativeKind: "channel",
          status: "enabled",
          endpointLabel: "https://imported.example.invalid/v1",
          modelPreview: ["gpt-4o"],
          secretState: "masked",
          capabilities: {},
        },
      }),
    ).resolves.toEqual({
      name: "Imported Axon",
      type: "openai",
      key: "",
      base_url: "https://imported.example.invalid/v1",
      models: ["gpt-4o"],
      groups: [],
      priority: 0,
      weight: 0,
      status: CHANNEL_STATUS.Enable,
    })

    expect(
      resources.drafts.validateDraft({
        ...sourceDraft,
        name: " ",
        base_url: "",
      }),
    ).toEqual({
      valid: false,
      errors: [
        { field: "name", message: "Channel name is required" },
        { field: "base_url", message: "Base URL is required" },
      ],
    })
  })

  it("allows AxonHub resource edits when native model arrays are empty or nullable", async () => {
    const native = buildAxonHubChannel({
      supportedModels: null,
      manualModels: [],
      defaultTestModel: null,
    })
    axonHubProvider.listChannels.mockResolvedValue({
      items: [buildAxonHubChannelRow(native)],
      total: 1,
      type_counts: { openai: 1 },
    })
    axonHubApi.updateAxonHubChannel.mockResolvedValue({
      ...native,
      name: "Renamed Axon",
    })
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow({ ...native, name: "Renamed Axon" }),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })
    const draft = {
      ...resources.drafts.prepareEditDraft(detail),
      name: "Renamed Axon",
    }

    expect(resources.drafts.validateDraft(draft)).toEqual({
      valid: true,
      errors: [],
    })

    await resources.items.update(config, detail, draft)

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      native.id,
      expect.objectContaining({
        name: "Renamed Axon",
        supportedModels: null,
        manualModels: [],
        defaultTestModel: null,
      }),
    )
  })

  it("preserves archived AxonHub status on resource edits", async () => {
    const native = buildAxonHubChannel({
      status: AXON_HUB_CHANNEL_STATUS.ARCHIVED,
    })
    axonHubProvider.listChannels.mockResolvedValue({
      items: [buildAxonHubChannelRow(native)],
      total: 1,
      type_counts: { openai: 1 },
    })
    axonHubApi.updateAxonHubChannel.mockResolvedValue(native)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(native),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })

    await resources.items.update(
      config,
      detail,
      resources.drafts.prepareEditDraft(detail),
    )

    expect(axonHubApi.updateAxonHubChannelStatus).not.toHaveBeenCalled()
  })

  it("updates AxonHub native status when a resource edit changes it", async () => {
    const native = buildAxonHubChannel({
      status: AXON_HUB_CHANNEL_STATUS.ENABLED,
    })
    axonHubProvider.listChannels.mockResolvedValue({
      items: [buildAxonHubChannelRow(native)],
      total: 1,
      type_counts: { openai: 1 },
    })
    axonHubApi.updateAxonHubChannel.mockResolvedValue(native)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow({
        ...native,
        status: AXON_HUB_CHANNEL_STATUS.DISABLED,
      }),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })

    await resources.items.update(config, detail, {
      ...resources.drafts.prepareEditDraft(detail),
      status: CHANNEL_STATUS.ManuallyDisabled,
    })

    expect(axonHubApi.updateAxonHubChannelStatus).toHaveBeenCalledWith(
      config,
      native.id,
      AXON_HUB_CHANNEL_STATUS.DISABLED,
    )
  })

  it("fails closed when an AxonHub resource row is missing native channel detail", async () => {
    axonHubProvider.listChannels.mockResolvedValue({
      items: [
        {
          ...buildAxonHubChannelRow(buildAxonHubChannel()),
          _axonHubData: undefined,
        },
      ],
      total: 1,
      type_counts: { openai: 1 },
    })

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )

    await expect(
      axonHubManagedSiteCapabilities.resources?.items.list(config),
    ).rejects.toThrow("AxonHub channel row is missing native channel detail")
  })

  it("does not write masked AxonHub credentials back as real secrets", async () => {
    const native = buildAxonHubChannel({
      credentials: {
        apiKeys: ["sk-********"],
      },
    })
    axonHubProvider.listChannels.mockResolvedValue({
      items: [buildAxonHubChannelRow(native)],
      total: 1,
      type_counts: { openai: 1 },
    })
    axonHubApi.updateAxonHubChannel.mockResolvedValue(native)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(native),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!
    const detail = await resources.items.getDetail(config, {
      managedSiteType: SITE_TYPES.AXON_HUB,
      scopeKey: "https://axonhub.example.invalid",
      resourceId: native.id,
    })

    await resources.items.update(
      config,
      detail,
      resources.drafts.prepareEditDraft(detail),
    )

    expect(axonHubApi.updateAxonHubChannel).toHaveBeenCalledWith(
      config,
      native.id,
      expect.not.objectContaining({
        credentials: expect.anything(),
      }),
    )
  })

  it("creates and deletes resources through AxonHub GraphQL-native ids", async () => {
    const created = buildAxonHubChannel({
      id: "gid://axonhub/Channel/created-string-id",
      name: "Created Axon",
    })
    axonHubApi.createAxonHubChannel.mockResolvedValue(created)
    axonHubApi.deleteAxonHubChannel.mockResolvedValue(true)
    axonHubApi.axonHubChannelToManagedSite.mockReturnValue(
      buildAxonHubChannelRow(created),
    )

    const { axonHubManagedSiteCapabilities } = await import(
      "~/services/apiAdapters/managedSites/axonHub"
    )
    const resources = axonHubManagedSiteCapabilities.resources!

    await expect(
      resources.items.create(config, {
        name: "Created Axon",
        type: "openai",
        key: "sk-created",
        base_url: "https://created.example.invalid/v1",
        models: ["gpt-4o"],
        groups: [],
        priority: 0,
        weight: 5,
        status: CHANNEL_STATUS.Enable,
      }),
    ).resolves.toEqual({
      success: true,
      message: "success",
      data: expect.objectContaining({
        ref: expect.objectContaining({
          resourceId: "gid://axonhub/Channel/created-string-id",
        }),
      }),
    })
    expect(axonHubApi.createAxonHubChannel).toHaveBeenCalledWith(config, {
      type: "openai",
      name: "Created Axon",
      baseURL: "https://created.example.invalid/v1",
      credentials: { apiKeys: ["sk-created"] },
      supportedModels: ["gpt-4o"],
      manualModels: ["gpt-4o"],
      defaultTestModel: "gpt-4o",
      settings: {},
      orderingWeight: 5,
    })

    await expect(
      resources.items.delete(config, {
        managedSiteType: SITE_TYPES.AXON_HUB,
        scopeKey: "https://axonhub.example.invalid",
        resourceId: "gid://axonhub/Channel/created-string-id",
      }),
    ).resolves.toEqual({
      success: true,
      message: "success",
      data: true,
    })
    expect(axonHubApi.deleteAxonHubChannel).toHaveBeenCalledWith(
      config,
      "gid://axonhub/Channel/created-string-id",
    )
  })
})

const buildAxonHubChannel = (
  overrides: Partial<AxonHubChannel> = {},
): AxonHubChannel => ({
  id: "gid://axonhub/Channel/native-string-id",
  name: "Axon Native",
  type: "openai",
  status: AXON_HUB_CHANNEL_STATUS.ENABLED,
  baseURL: "https://upstream.example.invalid/v1",
  credentials: {
    apiKeys: ["sk-live"],
  },
  supportedModels: ["gpt-4o"],
  manualModels: ["gpt-4o"],
  defaultTestModel: "gpt-4o",
  settings: {},
  orderingWeight: 0,
  remark: null,
  ...overrides,
})

const buildAxonHubChannelRow = (native: AxonHubChannel) => ({
  id: 408,
  name: native.name,
  type: native.type,
  key:
    native.credentials?.apiKeys?.find((key) => key.trim()) ??
    native.credentials?.apiKey ??
    "",
  base_url: native.baseURL,
  models: [...(native.supportedModels ?? []), ...(native.manualModels ?? [])]
    .filter(Boolean)
    .join(","),
  status:
    native.status === AXON_HUB_CHANNEL_STATUS.ENABLED
      ? CHANNEL_STATUS.Enable
      : CHANNEL_STATUS.ManuallyDisabled,
  priority: 0,
  weight: native.orderingWeight ?? 0,
  group: "",
  _axonHubData: native,
})
