import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelType } from "~/constants/newApi"
import { SITE_TYPES } from "~/constants/siteType"
import type { ManagedSiteRuntimeConfig } from "~/services/managedSites/runtimeConfig"
import { matchesProbeFilterRule } from "~/services/models/modelSync/channelModelFilterEvaluator"
import { ModelSyncService } from "~/services/models/modelSync/modelSyncService"
import type { ChannelConfigMap } from "~/types/channelConfig"
import type {
  ChannelModelFilterRule,
  ChannelModelPatternFilterRule,
  ChannelModelProbeFilterRule,
} from "~/types/channelModelFilters"
import type { ChannelFormData, ManagedSiteChannel } from "~/types/managedSite"
import type { ExecutionItemResult } from "~/types/managedSiteModelSync"
import {
  createManagedUpstreamResourceRef,
  MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS,
  MANAGED_UPSTREAM_RESOURCE_SECRET_STATES,
  MANAGED_UPSTREAM_RESOURCE_STATUSES,
  type ManagedUpstreamResourceDetail,
  type ManagedUpstreamResourceSummary,
} from "~/types/managedUpstreamResource"

const {
  getSiteTypeCapabilitiesMock,
  listAllChannelsMock,
  fetchChannelModelsMock,
  updateChannelModelsMock,
  updateChannelModelMappingMock,
  fetchChannelSecretKeyMock,
  getManagedSiteServiceForTypeMock,
  runApiVerificationProbeMock,
  resourceListMock,
  resourceGetDetailMock,
  resourceUpdateMock,
  resourcePrepareEditDraftMock,
} = vi.hoisted(() => ({
  getSiteTypeCapabilitiesMock: vi.fn(),
  listAllChannelsMock: vi.fn(),
  fetchChannelModelsMock: vi.fn(),
  updateChannelModelsMock: vi.fn(),
  updateChannelModelMappingMock: vi.fn(),
  fetchChannelSecretKeyMock: vi.fn(),
  getManagedSiteServiceForTypeMock: vi.fn(),
  runApiVerificationProbeMock: vi.fn(),
  resourceListMock: vi.fn(),
  resourceGetDetailMock: vi.fn(),
  resourceUpdateMock: vi.fn(),
  resourcePrepareEditDraftMock: vi.fn(),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: getSiteTypeCapabilitiesMock,
}))

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteServiceForType: getManagedSiteServiceForTypeMock,
}))

vi.mock("~/services/verification/aiApiVerification", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/verification/aiApiVerification")
    >()
  return {
    ...actual,
    runApiVerificationProbe: runApiVerificationProbeMock,
  }
})

const makeFilterRule = (
  partial: Partial<ChannelModelPatternFilterRule>,
): ChannelModelFilterRule => ({
  id: partial.id ?? "id",
  kind: "pattern",
  name: partial.name ?? "rule",
  pattern: partial.pattern ?? "",
  isRegex: partial.isRegex ?? false,
  action: partial.action ?? "include",
  enabled: partial.enabled ?? true,
  createdAt: partial.createdAt ?? Date.now(),
  updatedAt: partial.updatedAt ?? Date.now(),
  description: partial.description,
})

const makeProbeRule = (
  partial: Partial<ChannelModelProbeFilterRule> = {},
): ChannelModelProbeFilterRule => ({
  id: partial.id ?? "probe-rule",
  kind: "probe",
  name: partial.name ?? "probe rule",
  probeIds: partial.probeIds ?? ["text-generation"],
  match: partial.match ?? "all",
  action: partial.action ?? "include",
  enabled: partial.enabled ?? true,
  createdAt: partial.createdAt ?? Date.now(),
  updatedAt: partial.updatedAt ?? Date.now(),
  description: partial.description,
})

function makeRuntimeConfig(
  partial: Partial<
    Extract<ManagedSiteRuntimeConfig, { siteType: typeof SITE_TYPES.NEW_API }>
  >,
): Extract<ManagedSiteRuntimeConfig, { siteType: typeof SITE_TYPES.NEW_API }>
function makeRuntimeConfig(
  partial: Partial<
    Extract<ManagedSiteRuntimeConfig, { siteType: typeof SITE_TYPES.OCTOPUS }>
  >,
): Extract<ManagedSiteRuntimeConfig, { siteType: typeof SITE_TYPES.OCTOPUS }>
function makeRuntimeConfig(
  partial: Partial<
    Extract<ManagedSiteRuntimeConfig, { siteType: typeof SITE_TYPES.AXON_HUB }>
  >,
): Extract<ManagedSiteRuntimeConfig, { siteType: typeof SITE_TYPES.AXON_HUB }>
function makeRuntimeConfig(
  partial: Partial<
    Extract<
      ManagedSiteRuntimeConfig,
      { siteType: typeof SITE_TYPES.CLAUDE_CODE_HUB }
    >
  >,
): Extract<
  ManagedSiteRuntimeConfig,
  { siteType: typeof SITE_TYPES.CLAUDE_CODE_HUB }
>
function makeRuntimeConfig(
  partial: Partial<
    Extract<ManagedSiteRuntimeConfig, { siteType: typeof SITE_TYPES.DONE_HUB }>
  >,
): Extract<ManagedSiteRuntimeConfig, { siteType: typeof SITE_TYPES.DONE_HUB }>
function makeRuntimeConfig(
  partial: Partial<
    Extract<ManagedSiteRuntimeConfig, { siteType: typeof SITE_TYPES.VELOERA }>
  >,
): Extract<ManagedSiteRuntimeConfig, { siteType: typeof SITE_TYPES.VELOERA }>
function makeRuntimeConfig(
  partial: Partial<ManagedSiteRuntimeConfig> = {},
): ManagedSiteRuntimeConfig {
  if (partial.siteType === SITE_TYPES.OCTOPUS) {
    return {
      siteType: SITE_TYPES.OCTOPUS,
      config: {
        baseUrl: "https://managed.example.com",
        username: "admin",
        password: "secret",
        ...partial.config,
      },
    }
  }

  if (partial.siteType === SITE_TYPES.AXON_HUB) {
    return {
      siteType: SITE_TYPES.AXON_HUB,
      config: {
        baseUrl: "https://managed.example.com",
        email: "admin@example.com",
        password: "secret",
        ...partial.config,
      },
    }
  }

  if (partial.siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
    return {
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      config: {
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
        ...partial.config,
      },
    }
  }

  if (partial.siteType === SITE_TYPES.DONE_HUB) {
    return {
      siteType: SITE_TYPES.DONE_HUB,
      config: {
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
        userId: "1",
        ...partial.config,
      },
    }
  }

  if (partial.siteType === SITE_TYPES.VELOERA) {
    return {
      siteType: SITE_TYPES.VELOERA,
      config: {
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
        userId: "1",
        ...partial.config,
      },
    }
  }

  return {
    siteType: SITE_TYPES.NEW_API,
    config: {
      baseUrl: "https://managed.example.com",
      adminToken: "admin-token",
      userId: "1",
      ...(partial.config as
        | Partial<
            Extract<
              ManagedSiteRuntimeConfig,
              { siteType: typeof SITE_TYPES.NEW_API }
            >["config"]
          >
        | undefined),
    },
  }
}

const makeNewApiRuntimeConfig = (
  config: Partial<{
    baseUrl: string
    adminToken: string
    userId: string
  }> = {},
): ManagedSiteRuntimeConfig =>
  makeRuntimeConfig({
    siteType: SITE_TYPES.NEW_API,
    config: {
      baseUrl: config.baseUrl ?? "https://managed.example.com",
      adminToken: config.adminToken ?? "admin-token",
      userId: config.userId ?? "1",
    },
  })

const makeExampleRuntimeConfig = (): ManagedSiteRuntimeConfig =>
  makeNewApiRuntimeConfig({
    baseUrl: "https://example.com",
    adminToken: "token",
    userId: "1",
  })

const makeChannel = (
  partial: Partial<ManagedSiteChannel> & Pick<ManagedSiteChannel, "id">,
): ManagedSiteChannel => ({
  id: partial.id,
  type: partial.type ?? ChannelType.OpenAI,
  key: partial.key ?? "",
  name: partial.name ?? `Channel ${partial.id}`,
  base_url: partial.base_url ?? "https://channel.example.com",
  models: partial.models ?? "",
  status: partial.status ?? 1,
  weight: partial.weight ?? 1,
  priority: partial.priority ?? 0,
  openai_organization: partial.openai_organization ?? null,
  test_model: partial.test_model ?? null,
  created_time: partial.created_time ?? 0,
  test_time: partial.test_time ?? 0,
  response_time: partial.response_time ?? 0,
  other: partial.other ?? "",
  balance: partial.balance ?? 0,
  balance_updated_time: partial.balance_updated_time ?? 0,
  group: partial.group ?? "",
  used_quota: partial.used_quota ?? 0,
  model_mapping: partial.model_mapping ?? "",
  status_code_mapping: partial.status_code_mapping ?? "",
  auto_ban: partial.auto_ban ?? 0,
  other_info: partial.other_info ?? "",
  tag: partial.tag ?? null,
  param_override: partial.param_override ?? null,
  header_override: partial.header_override ?? null,
  remark: partial.remark ?? null,
  channel_info: partial.channel_info ?? {
    is_multi_key: false,
    multi_key_size: 0,
    multi_key_status_list: null,
    multi_key_polling_index: 0,
    multi_key_mode: "",
  },
  setting: partial.setting ?? "",
  settings: partial.settings ?? "",
})

const makeResourceSummary = (
  partial: Partial<ManagedUpstreamResourceSummary> & {
    id: number
    name?: string
  },
): ManagedUpstreamResourceSummary => ({
  ref: createManagedUpstreamResourceRef({
    managedSiteType: SITE_TYPES.NEW_API,
    scopeKey: "https://managed.example.com",
    resourceId: partial.id,
  }),
  displayName: partial.name ?? `Channel ${partial.id}`,
  nativeKind: MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS.Channel,
  status: MANAGED_UPSTREAM_RESOURCE_STATUSES.Enabled,
  typeLabel: "1",
  endpointLabel: "https://channel.example.com",
  modelCount: 0,
  modelPreview: [],
  secretState: MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Available,
  capabilities: {
    canUpdate: true,
  },
  ...partial,
})

const makeChannelFormData = (channel: ManagedSiteChannel): ChannelFormData => ({
  name: channel.name,
  type: channel.type,
  key: channel.key,
  base_url: channel.base_url,
  models: channel.models
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean),
  groups: channel.group
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean),
  priority: channel.priority,
  weight: channel.weight,
  status: channel.status,
})

const makeResourceCapabilities = () => ({
  items: {
    list: resourceListMock,
    search: vi.fn(),
    getDetail: resourceGetDetailMock,
    create: vi.fn(),
    update: resourceUpdateMock,
    delete: vi.fn(),
  },
  drafts: {
    prepareImportDraft: vi.fn(),
    prepareEditDraft: resourcePrepareEditDraftMock,
    describeFields: vi.fn(),
    validateDraft: vi.fn(),
  },
})

const makeChannelConfigs = (
  rulesByChannelId: Record<number, ChannelModelFilterRule[]>,
): ChannelConfigMap =>
  Object.fromEntries(
    Object.entries(rulesByChannelId).map(([channelId, rules]) => {
      const numericChannelId = Number(channelId)
      return [
        numericChannelId,
        {
          channelId: numericChannelId,
          modelFilterSettings: {
            rules,
            updatedAt: 0,
          },
          createdAt: 0,
          updatedAt: 0,
        },
      ]
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  getSiteTypeCapabilitiesMock.mockImplementation((siteType) => ({
    siteType,
    managedSites: {
      channels: {
        list: listAllChannelsMock,
        fetchModels: fetchChannelModelsMock,
        updateModels: updateChannelModelsMock,
        updateModelMapping: updateChannelModelMappingMock,
      },
    },
  }))
  getManagedSiteServiceForTypeMock.mockReturnValue({
    fetchChannelSecretKey: fetchChannelSecretKeyMock,
  })
  fetchChannelSecretKeyMock.mockResolvedValue("sk-resolved-channel-key")
  resourceUpdateMock.mockResolvedValue({ success: true, message: "success" })
  resourcePrepareEditDraftMock.mockImplementation(
    (detail: ManagedUpstreamResourceDetail<ManagedSiteChannel>) =>
      makeChannelFormData(detail.native),
  )
  runApiVerificationProbeMock.mockResolvedValue({
    id: "text-generation",
    status: "pass",
    latencyMs: 1,
    summary: "ok",
  })
})

describe("ModelSyncService - allowed model filtering", () => {
  const createService = (allowed?: string[]) =>
    new ModelSyncService(
      makeNewApiRuntimeConfig({
        baseUrl: "https://example.com",
        adminToken: "dummy-token",
        userId: "1",
      }),
      undefined,
      allowed,
    )

  const callFilter = (service: ModelSyncService, models: string[]) =>
    (service as any).filterAllowedModels(models) as string[]

  it("returns trimmed unique models when no allow-list exists", () => {
    const service = createService()

    const result = callFilter(service, [
      "  gpt-4o  ",
      "gpt-4o",
      "claude-3",
      "  ",
    ])

    expect(result).toEqual(["gpt-4o", "claude-3"])
  })

  it("filters models using the configured allow-list", () => {
    const service = createService(["gpt-4o", "claude-3"])

    const result = callFilter(service, [
      " gpt-4o  ",
      "gpt-4o-mini",
      "claude-3",
      "unknown-model",
    ])

    expect(result).toEqual(["gpt-4o", "claude-3"])
  })

  it("deduplicates after filtering", () => {
    const service = createService(["gpt-4o"])

    const result = callFilter(service, ["gpt-4o", " gpt-4o  ", "gpt-4o"])

    expect(result).toEqual(["gpt-4o"])
  })
})

describe("ModelSyncService - siteType routing", () => {
  it("forwards runtime config site type to managed-site channel capabilities", async () => {
    listAllChannelsMock.mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
    })

    const service = new ModelSyncService(
      makeRuntimeConfig({
        siteType: SITE_TYPES.VELOERA,
        config: {
          baseUrl: "https://example.com",
          adminToken: "token",
          userId: "1",
        },
      }),
    )

    await service.listChannels()

    expect(getSiteTypeCapabilitiesMock).toHaveBeenCalledWith(SITE_TYPES.VELOERA)
    expect(listAllChannelsMock).toHaveBeenCalledWith(
      {
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      },
      expect.objectContaining({
        beforeRequest: expect.any(Function),
      }),
    )
  })

  it("uses runtime config object inputs at the channel capability boundary", async () => {
    const runtimeConfig = makeRuntimeConfig({
      siteType: SITE_TYPES.DONE_HUB,
      config: {
        baseUrl: "https://done.example.com",
        adminToken: "admin-token",
        userId: "2",
      },
    })
    listAllChannelsMock.mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
    })

    const service = new ModelSyncService(runtimeConfig)

    await service.listChannels()

    expect(getSiteTypeCapabilitiesMock).toHaveBeenCalledWith(
      SITE_TYPES.DONE_HUB,
    )
    expect(listAllChannelsMock).toHaveBeenCalledWith(
      runtimeConfig.config,
      expect.anything(),
    )
  })

  it("lists channels when model-sync write methods are not implemented", async () => {
    const axonHubConfig = makeRuntimeConfig({
      siteType: SITE_TYPES.AXON_HUB,
    })
    const listResponse = {
      items: [makeChannel({ id: 1, name: "Axon" })],
      total: 1,
      type_counts: { openai: 1 },
    }
    listAllChannelsMock.mockResolvedValue(listResponse)
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
      siteType: SITE_TYPES.AXON_HUB,
      managedSites: {
        channels: {
          list: listAllChannelsMock,
          search: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      },
    })

    await expect(
      new ModelSyncService(axonHubConfig).listChannels(),
    ).resolves.toBe(listResponse)
    expect(listAllChannelsMock).toHaveBeenCalledWith(
      axonHubConfig.config,
      expect.objectContaining({
        beforeRequest: expect.any(Function),
      }),
    )
  })

  it("throws a clear error when channel listing is missing", async () => {
    const cchConfig = makeRuntimeConfig({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
    })
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      managedSites: {
        channels: {
          search: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      },
    })

    await expect(
      new ModelSyncService(cchConfig).listChannels(),
    ).rejects.toThrow(
      "managed-site channel listing is not implemented for claude-code-hub",
    )
  })

  it("throws a clear error when channel model-sync methods are missing", async () => {
    const axonHubConfig = makeRuntimeConfig({
      siteType: SITE_TYPES.AXON_HUB,
    })
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
      siteType: SITE_TYPES.AXON_HUB,
      managedSites: {
        channels: {
          list: listAllChannelsMock,
          search: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
      },
    })

    await expect(
      new ModelSyncService(axonHubConfig).fetchChannelModels(1),
    ).rejects.toThrow("managed-site model sync is not implemented for axonhub")
  })

  it("keeps shared channel listing on the legacy path unless resource-backed candidates are requested", async () => {
    const legacyList = {
      items: [
        makeChannel({
          id: 1,
          name: "Legacy Channel",
          models: "gpt-4o",
          model_mapping: JSON.stringify({ "gpt-4": "gpt-4o" }),
        }),
      ],
      total: 1,
      type_counts: {
        "1": 1,
      },
    }
    listAllChannelsMock.mockResolvedValueOnce(legacyList)
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      managedSites: {
        channels: {
          list: listAllChannelsMock,
          fetchModels: fetchChannelModelsMock,
          updateModels: updateChannelModelsMock,
          updateModelMapping: updateChannelModelMappingMock,
        },
        resources: makeResourceCapabilities(),
      },
    })

    await expect(
      new ModelSyncService(
        makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API }),
      ).listChannels(),
    ).resolves.toBe(legacyList)

    expect(resourceListMock).not.toHaveBeenCalled()
    expect(listAllChannelsMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        beforeRequest: expect.any(Function),
      }),
    )
  })

  it("lists model-sync channels through feature-gated resource details when explicitly requested", async () => {
    const alphaSummary = makeResourceSummary({
      id: 1,
      name: "Alpha",
      modelCount: 2,
      modelPreview: ["gpt-4o", "claude-3"],
    })
    const betaSummary = makeResourceSummary({
      id: 2,
      name: "Beta",
      typeLabel: "2",
      modelCount: 0,
      modelPreview: [],
    })
    resourceListMock.mockResolvedValueOnce({
      items: [alphaSummary, betaSummary],
      total: 2,
    })
    getSiteTypeCapabilitiesMock.mockReturnValueOnce({
      siteType: SITE_TYPES.NEW_API,
      managedSites: {
        channels: {
          list: listAllChannelsMock,
          fetchModels: fetchChannelModelsMock,
          updateModels: updateChannelModelsMock,
          updateModelMapping: updateChannelModelMappingMock,
        },
        resources: makeResourceCapabilities(),
      },
    })

    const result = await new ModelSyncService(
      makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API }),
    ).listChannels({ preferResourceBacked: true })

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 1,
          name: "Alpha",
          models: "gpt-4o,claude-3",
        }),
        expect.objectContaining({
          id: 2,
          name: "Beta",
          type: 2,
        }),
      ],
      total: 2,
      type_counts: {
        "1": 1,
        "2": 1,
      },
    })
    expect(resourceListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
        userId: "1",
      }),
      undefined,
    )
    expect(resourceGetDetailMock).not.toHaveBeenCalled()
    expect(listAllChannelsMock).not.toHaveBeenCalled()
  })

  it("falls back to legacy channel listing when resource summaries do not contain complete model candidates", async () => {
    const summary = makeResourceSummary({
      id: 3,
      name: "Large Model Set",
      modelCount: 4,
      modelPreview: ["a", "b", "c"],
    })
    const legacyList = {
      items: [
        makeChannel({
          id: 3,
          name: "Large Model Set",
          models: "a,b,c,d",
        }),
      ],
      total: 1,
      type_counts: {
        "1": 1,
      },
    }
    resourceListMock.mockResolvedValueOnce({
      items: [summary],
      total: 1,
    })
    listAllChannelsMock.mockResolvedValueOnce(legacyList)
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      managedSites: {
        channels: {
          list: listAllChannelsMock,
          fetchModels: fetchChannelModelsMock,
          updateModels: updateChannelModelsMock,
          updateModelMapping: updateChannelModelMappingMock,
        },
        resources: makeResourceCapabilities(),
      },
    })

    await expect(
      new ModelSyncService(
        makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API }),
      ).listChannels({ preferResourceBacked: true }),
    ).resolves.toBe(legacyList)

    expect(resourceGetDetailMock).not.toHaveBeenCalled()
    expect(listAllChannelsMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        beforeRequest: expect.any(Function),
      }),
    )
  })

  it("falls back to legacy channel listing when resource summaries omit model counts", async () => {
    const summary = makeResourceSummary({
      id: 4,
      name: "Unknown Model Count",
      modelCount: undefined,
      modelPreview: ["a"],
    })
    const legacyList = {
      items: [
        makeChannel({
          id: 4,
          name: "Unknown Model Count",
          models: "a,b",
        }),
      ],
      total: 1,
      type_counts: {
        "1": 1,
      },
    }
    resourceListMock.mockResolvedValueOnce({
      items: [summary],
      total: 1,
    })
    listAllChannelsMock.mockResolvedValueOnce(legacyList)
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      managedSites: {
        channels: {
          list: listAllChannelsMock,
          fetchModels: fetchChannelModelsMock,
          updateModels: updateChannelModelsMock,
          updateModelMapping: updateChannelModelMappingMock,
        },
        resources: makeResourceCapabilities(),
      },
    })

    await expect(
      new ModelSyncService(
        makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API }),
      ).listChannels({ preferResourceBacked: true }),
    ).resolves.toBe(legacyList)

    expect(resourceGetDetailMock).not.toHaveBeenCalled()
    expect(listAllChannelsMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        beforeRequest: expect.any(Function),
      }),
    )
  })
})

describe("ModelSyncService - global and channel filters", () => {
  const baseModels = ["gpt-4o", "gpt-4o-mini", "claude-3", "local-debug-model"]

  const callApplyFilters = (
    rules: ChannelModelFilterRule[] | null | undefined,
    models: string[],
  ): Promise<string[]> => {
    const service = new ModelSyncService(
      makeNewApiRuntimeConfig({
        baseUrl: "https://example.com",
        adminToken: "token",
      }),
    )
    return (service as any).applyFilters(rules, models)
  }

  it("returns normalized models when no filters are provided", async () => {
    const result = await callApplyFilters(undefined, [" gpt-4o ", "gpt-4o", ""])
    expect(result).toEqual(["gpt-4o"])
  })

  it("applies include-then-exclude logic correctly", async () => {
    const rules: ChannelModelFilterRule[] = [
      makeFilterRule({
        id: "include-openai",
        name: "Include GPT-4 family",
        pattern: "gpt-4o",
        isRegex: false,
        action: "include",
      }),
      makeFilterRule({
        id: "exclude-mini",
        name: "Exclude mini",
        pattern: "mini",
        isRegex: false,
        action: "exclude",
      }),
    ]

    const result = await callApplyFilters(rules, baseModels)
    expect(result).toEqual(["gpt-4o"])
  })

  it("supports regex patterns in filters", async () => {
    const rules: ChannelModelFilterRule[] = [
      makeFilterRule({
        id: "include-gpt",
        name: "Include GPT*",
        pattern: "^gpt-",
        isRegex: true,
        action: "include",
      }),
    ]

    const result = await callApplyFilters(rules, baseModels)
    expect(result.sort()).toEqual(["gpt-4o", "gpt-4o-mini"].sort())
  })

  it("returns an empty result when regex filters are invalid", async () => {
    const rules: ChannelModelFilterRule[] = [
      makeFilterRule({
        id: "broken",
        pattern: "[",
        isRegex: true,
        action: "include",
      }),
    ]

    const result = await callApplyFilters(rules, baseModels)
    expect(result).toEqual([])
  })
})

describe("ModelSyncService - channel execution", () => {
  it("invokes the configured rate limiter before channel listing callbacks run", async () => {
    const acquire = vi.fn().mockResolvedValue(undefined)
    listAllChannelsMock.mockImplementation(async (_config, options) => {
      await options.beforeRequest?.()
      return {
        items: [],
        total: 0,
        type_counts: {},
      }
    })

    const service = new ModelSyncService(makeExampleRuntimeConfig())
    ;(service as any).rateLimiter = { acquire }

    await service.listChannels()

    expect(acquire).toHaveBeenCalledTimes(1)
    expect(listAllChannelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      }),
      expect.objectContaining({
        beforeRequest: expect.any(Function),
        bypassSiteRequestLimit: true,
      }),
    )
  })

  it("skips channel updates when the normalized model set is unchanged", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce([" model-b ", "model-a"])

    const service = new ModelSyncService(makeExampleRuntimeConfig())
    const channel = makeChannel({
      id: 1,
      name: "Alpha",
      models: "model-a,model-b",
    })

    const result = await service.runForChannel(channel, 0)

    expect(result).toMatchObject({
      channelId: 1,
      channelName: "Alpha",
      ok: true,
      oldModels: ["model-a", "model-b"],
      newModels: ["model-b", "model-a"],
      message: "Success",
    })
    expect(updateChannelModelsMock).not.toHaveBeenCalled()
  })

  it("composes global and channel filters before updating changed models", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce([
      "gpt-4o",
      "gpt-4o-mini",
      "claude-3",
    ])

    const service = new ModelSyncService(
      makeExampleRuntimeConfig(),
      undefined,
      undefined,
      undefined,
      [
        makeFilterRule({
          id: "exclude-mini",
          action: "exclude",
          pattern: "mini",
        }),
      ],
    )
    service.setChannelConfigs(
      makeChannelConfigs({
        7: [
          makeFilterRule({
            id: "include-claude",
            action: "include",
            pattern: "claude",
          }),
        ],
      }),
    )

    const channel = makeChannel({
      id: 7,
      name: "Scoped",
      models: "gpt-4o",
    })

    const result = await service.runForChannel(channel, 0)

    expect(updateChannelModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      }),
      7,
      ["claude-3"],
      undefined,
    )
    expect(channel.models).toBe("claude-3")
    expect(result).toMatchObject({
      channelId: 7,
      ok: true,
      oldModels: ["gpt-4o"],
      newModels: ["claude-3"],
    })
  })

  it("updates changed models through the cached feature-gated resource draft", async () => {
    const channel = makeChannel({
      id: 7,
      name: "Resource Backed",
      models: "old-model",
    })
    const summary = makeResourceSummary({
      id: 7,
      name: "Resource Backed",
      modelCount: 1,
      modelPreview: ["old-model"],
    })
    const resourceCapabilities = makeResourceCapabilities()

    resourceListMock.mockResolvedValueOnce({
      items: [summary],
      total: 1,
    })
    resourceGetDetailMock.mockResolvedValueOnce({
      summary,
      native: channel,
    })
    fetchChannelModelsMock.mockResolvedValueOnce(["new-model"])
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      managedSites: {
        channels: {
          list: listAllChannelsMock,
          fetchModels: fetchChannelModelsMock,
          updateModels: updateChannelModelsMock,
          updateModelMapping: updateChannelModelMappingMock,
        },
        resources: resourceCapabilities,
      },
    })

    const service = new ModelSyncService(
      makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API }),
    )
    const [resourceBackedChannel] = (
      await service.listChannels({ preferResourceBacked: true })
    ).items

    const result = await service.runForChannel(resourceBackedChannel, 0)

    expect(result).toMatchObject({
      channelId: 7,
      ok: true,
      oldModels: ["old-model"],
      newModels: ["new-model"],
    })
    expect(resourceUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
        userId: "1",
      }),
      expect.objectContaining({ summary }),
      expect.objectContaining({
        name: "Resource Backed",
        models: ["new-model"],
      }),
    )
    expect(resourceGetDetailMock).toHaveBeenCalledWith(
      expect.any(Object),
      summary.ref,
    )
    expect(updateChannelModelsMock).not.toHaveBeenCalled()
  })

  it("clears cached resource drafts when a later legacy channel list is requested", async () => {
    const summary = makeResourceSummary({
      id: 9,
      name: "Resource Then Legacy",
      modelCount: 1,
      modelPreview: ["old-model"],
    })
    const legacyChannel = makeChannel({
      id: 9,
      name: "Resource Then Legacy",
      models: "old-model",
    })
    const resourceCapabilities = makeResourceCapabilities()

    resourceListMock.mockResolvedValueOnce({
      items: [summary],
      total: 1,
    })
    listAllChannelsMock.mockResolvedValueOnce({
      items: [legacyChannel],
      total: 1,
      type_counts: { "1": 1 },
    })
    fetchChannelModelsMock.mockResolvedValueOnce(["new-model"])
    getSiteTypeCapabilitiesMock.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      managedSites: {
        channels: {
          list: listAllChannelsMock,
          fetchModels: fetchChannelModelsMock,
          updateModels: updateChannelModelsMock,
          updateModelMapping: updateChannelModelMappingMock,
        },
        resources: resourceCapabilities,
      },
    })

    const service = new ModelSyncService(
      makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API }),
    )
    await service.listChannels({ preferResourceBacked: true })
    const [channelFromLegacyList] = (await service.listChannels()).items

    await service.runForChannel(channelFromLegacyList, 0)

    expect(resourceUpdateMock).not.toHaveBeenCalled()
    expect(updateChannelModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
        userId: "1",
      }),
      9,
      ["new-model"],
      undefined,
    )
  })

  it("clears stored models when the upstream response only contains blank entries", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce([" ", "", "   "])

    const service = new ModelSyncService(makeExampleRuntimeConfig())
    const channel = makeChannel({
      id: 8,
      name: "Blank Upstream",
      models: "gpt-4o",
    })

    const result = await service.runForChannel(channel, 0)

    expect(updateChannelModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      }),
      8,
      [],
      undefined,
    )
    expect(channel.models).toBe("")
    expect(result).toMatchObject({
      channelId: 8,
      ok: true,
      oldModels: ["gpt-4o"],
      newModels: [],
    })
  })

  it("retries failed channel fetches and returns a terminal failure after max retries", async () => {
    vi.useFakeTimers()
    fetchChannelModelsMock.mockRejectedValue(new Error("upstream failed"))

    const service = new ModelSyncService(makeExampleRuntimeConfig())
    const channel = makeChannel({
      id: 2,
      name: "Beta",
      models: "gpt-4o",
    })

    try {
      const resultPromise = service.runForChannel(channel, 1)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(fetchChannelModelsMock).toHaveBeenCalledTimes(2)
      expect(result).toMatchObject({
        channelId: 2,
        channelName: "Beta",
        ok: false,
        attempts: 2,
        message: "upstream failed",
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("falls back to an unknown error message when terminal failures have no message", async () => {
    fetchChannelModelsMock.mockRejectedValue({
      httpStatus: 503,
    })

    const service = new ModelSyncService(makeExampleRuntimeConfig())
    const channel = makeChannel({
      id: 9,
      name: "Status Only",
      models: "gpt-4o",
    })

    const result = await service.runForChannel(channel, 0)

    expect(result).toMatchObject({
      channelId: 9,
      ok: false,
      httpStatus: 503,
      attempts: 1,
      message: "Unknown error",
      oldModels: ["gpt-4o"],
    })
  })
})

describe("ModelSyncService - probe-backed filters", () => {
  it("passes channel credentials and model ids to selected probes", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce(["model-a", "model-b"])
    runApiVerificationProbeMock.mockImplementation(async ({ modelId }) => ({
      id: "text-generation",
      status: modelId === "model-a" ? "pass" : "fail",
      latencyMs: 1,
      summary: "ok",
    }))

    const service = new ModelSyncService(
      makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API }),
      undefined,
      undefined,
      undefined,
      [makeProbeRule()],
    )
    const channel = makeChannel({
      id: 77,
      name: "Probe Channel",
      type: ChannelType.OpenAI,
      base_url: "https://channel.example.com",
      key: "sk-channel-key",
      models: "model-a,model-b",
    })

    const result = await service.runForChannel(channel, 0)

    expect(runApiVerificationProbeMock).toHaveBeenCalledWith({
      baseUrl: "https://channel.example.com",
      apiKey: "sk-channel-key",
      apiType: "openai-compatible",
      modelId: "model-a",
      probeId: "text-generation",
      abortSignal: expect.any(AbortSignal),
    })
    expect(runApiVerificationProbeMock).toHaveBeenCalledWith({
      baseUrl: "https://channel.example.com",
      apiKey: "sk-channel-key",
      apiType: "openai-compatible",
      modelId: "model-b",
      probeId: "text-generation",
      abortSignal: expect.any(AbortSignal),
    })
    expect(updateChannelModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
        userId: "1",
      }),
      77,
      ["model-a"],
      undefined,
    )
    expect(result).toMatchObject({
      ok: true,
      newModels: ["model-a"],
    })
  })

  it("resolves hidden channel keys through the managed-site provider", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce(["model-a"])
    const runtimeConfig = makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API })

    const service = new ModelSyncService(
      runtimeConfig,
      undefined,
      undefined,
      undefined,
      [makeProbeRule()],
    )
    const channel = makeChannel({
      id: 78,
      name: "Hidden Key",
      type: ChannelType.OpenAI,
      base_url: "https://channel.example.com",
      key: "",
      models: "",
    })

    await service.runForChannel(channel, 0)

    expect(fetchChannelSecretKeyMock).toHaveBeenCalledWith(
      runtimeConfig.config,
      78,
    )
    expect(runApiVerificationProbeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-resolved-channel-key",
        modelId: "model-a",
        abortSignal: expect.any(AbortSignal),
      }),
    )
  })

  it("caches duplicate probe checks across global and channel rules", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce(["model-a", "model-b"])

    const duplicateRule = makeProbeRule({ id: "duplicate" })
    const service = new ModelSyncService(
      makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API }),
      undefined,
      undefined,
      undefined,
      [duplicateRule],
    )
    service.setChannelConfigs(
      makeChannelConfigs({
        79: [makeProbeRule({ id: "channel-duplicate" })],
      }),
    )

    const channel = makeChannel({
      id: 79,
      name: "Cached",
      type: ChannelType.OpenAI,
      base_url: "https://channel.example.com",
      key: "sk-channel-key",
      models: "",
    })

    await service.runForChannel(channel, 0)

    expect(runApiVerificationProbeMock).toHaveBeenCalledTimes(2)
  })

  it("includes a model when any selected probe passes under match:any", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce(["model-a"])
    runApiVerificationProbeMock.mockImplementation(
      async ({ probeId }: { probeId: string }) => ({
        id: probeId,
        status: probeId === "text-generation" ? "pass" : "fail",
        latencyMs: 1,
        summary: "ok",
      }),
    )

    const service = new ModelSyncService(
      makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API }),
      undefined,
      undefined,
      undefined,
      [
        makeProbeRule({
          probeIds: ["text-generation", "tool-calling"],
          match: "any",
        }),
      ],
    )
    const channel = makeChannel({
      id: 99,
      name: "Any Mode",
      type: ChannelType.OpenAI,
      base_url: "https://channel.example.com",
      key: "sk-key",
      models: "",
    })

    const result = await service.runForChannel(channel, 0)

    expect(result).toMatchObject({
      ok: true,
      newModels: ["model-a"],
    })
    expect(updateChannelModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://managed.example.com",
        adminToken: "admin-token",
        userId: "1",
      }),
      99,
      ["model-a"],
      undefined,
    )
  })

  it("marks a model as unmatched when probe execution throws", async () => {
    const context = {
      channel: makeChannel({
        id: 92,
        type: ChannelType.OpenAI,
        base_url: "https://channel.example.com",
        key: "sk-channel-key",
      }),
      managedConfig: makeRuntimeConfig({ siteType: SITE_TYPES.VELOERA }),
      cache: new Map<string, boolean>(),
    }
    runApiVerificationProbeMock.mockRejectedValueOnce(
      new Error("probe failed with sk-channel-key"),
    )

    await expect(
      matchesProbeFilterRule(makeProbeRule(), "model-a", context),
    ).resolves.toBe(false)

    expect(context.cache.size).toBe(1)
  })

  it("rejects probe filtering when the channel base URL is missing", async () => {
    const context = {
      channel: makeChannel({
        id: 93,
        type: ChannelType.OpenAI,
        base_url: "   ",
        key: "sk-channel-key",
      }),
      managedConfig: makeRuntimeConfig({ siteType: SITE_TYPES.VELOERA }),
      cache: new Map<string, boolean>(),
    }

    await expect(
      matchesProbeFilterRule(makeProbeRule(), "model-a", context),
    ).rejects.toMatchObject({
      reason: "base-url-missing",
      message:
        "Probe filtering could not run because the channel base URL is missing.",
    })
  })

  it("maps supported string and numeric channel types to verification api types", async () => {
    const { resolveApiVerificationTypeForChannelType } = await import(
      "~/services/models/modelSync/channelModelFilterEvaluator"
    )

    expect(
      resolveApiVerificationTypeForChannelType(String(ChannelType.Anthropic)),
    ).toBe("anthropic")
    expect(resolveApiVerificationTypeForChannelType(ChannelType.PaLM)).toBe(
      "google",
    )
    expect(resolveApiVerificationTypeForChannelType("anthropic")).toBe(
      "anthropic",
    )
    expect(resolveApiVerificationTypeForChannelType("gemini")).toBe("google")
  })

  it("does not update models when probe filtering cannot resolve a hidden key", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce(["model-a"])
    getManagedSiteServiceForTypeMock.mockReturnValue({})

    const service = new ModelSyncService(
      makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API }),
      undefined,
      undefined,
      undefined,
      [makeProbeRule()],
    )
    const channel = makeChannel({
      id: 80,
      name: "Unsupported Provider",
      type: ChannelType.OpenAI,
      base_url: "https://channel.example.com",
      key: "",
      models: "model-a",
    })

    const result = await service.runForChannel(channel, 0)

    expect(result).toMatchObject({
      ok: false,
      oldModels: ["model-a"],
    })
    expect(updateChannelModelsMock).not.toHaveBeenCalled()
    expect(runApiVerificationProbeMock).not.toHaveBeenCalled()
  })

  it("does not update models for unsupported channel types", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce(["model-a"])

    const service = new ModelSyncService(
      makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API }),
      undefined,
      undefined,
      undefined,
      [makeProbeRule()],
    )
    const channel = makeChannel({
      id: 81,
      name: "Unsupported Type",
      type: ChannelType.Midjourney,
      base_url: "https://channel.example.com",
      key: "sk-channel-key",
      models: "model-a",
    })

    const result = await service.runForChannel(channel, 0)

    expect(result).toMatchObject({
      ok: false,
      message: "Probe filtering is unsupported for this channel type.",
    })
    expect(updateChannelModelsMock).not.toHaveBeenCalled()
    expect(runApiVerificationProbeMock).not.toHaveBeenCalled()
  })

  it("keeps key-resolution failure messages secret-safe", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce(["model-a"])
    fetchChannelSecretKeyMock.mockRejectedValueOnce(
      new Error("failed with admin-token sk-hidden-channel-key 123456"),
    )

    const service = new ModelSyncService(
      makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API }),
      undefined,
      undefined,
      undefined,
      [makeProbeRule()],
    )
    const channel = makeChannel({
      id: 82,
      name: "Secret Safe",
      type: ChannelType.OpenAI,
      base_url: "https://channel.example.com",
      key: "",
      models: "model-a",
    })

    const result = await service.runForChannel(channel, 0)

    expect(result.message).not.toContain("admin-token")
    expect(result.message).not.toContain("sk-hidden-channel-key")
    expect(result.message).not.toContain("123456")
    expect(updateChannelModelsMock).not.toHaveBeenCalled()
  })

  it("redacts token-shaped runtime configs from key-resolution failures", async () => {
    fetchChannelSecretKeyMock.mockRejectedValueOnce(
      new Error("failed with runtime-token sk-hidden-channel-key 123456"),
    )
    const context = {
      channel: makeChannel({
        id: 83,
        type: ChannelType.OpenAI,
        base_url: "https://channel.example.com",
        key: "",
      }),
      managedConfig: {
        siteType: SITE_TYPES.NEW_API,
        config: {
          baseUrl: "https://managed.example.com",
          token: "runtime-token",
          userId: "1",
        },
      } as any,
      cache: new Map<string, boolean>(),
    }

    await expect(
      matchesProbeFilterRule(makeProbeRule(), "model-a", context),
    ).rejects.toMatchObject({
      reason: "key-unavailable",
    })
  })

  it("redacts Octopus and AxonHub secrets from key-resolution failures", async () => {
    const cases = [
      {
        runtimeConfig: makeRuntimeConfig({ siteType: SITE_TYPES.OCTOPUS }),
        secret: "secret",
      },
      {
        runtimeConfig: makeRuntimeConfig({ siteType: SITE_TYPES.AXON_HUB }),
        secret: "secret",
      },
    ]

    for (const item of cases) {
      fetchChannelSecretKeyMock.mockRejectedValueOnce(
        new Error(`failed with ${item.secret} sk-hidden-channel-key 123456`),
      )
      const context = {
        channel: makeChannel({
          id: 84,
          type: ChannelType.OpenAI,
          base_url: "https://channel.example.com",
          key: "",
        }),
        managedConfig: item.runtimeConfig,
        cache: new Map<string, boolean>(),
      }

      await expect(
        matchesProbeFilterRule(makeProbeRule(), "model-a", context),
      ).rejects.toMatchObject({
        reason: "key-unavailable",
      })
    }
  })

  it("rejects unusable keys returned by the managed-site provider", async () => {
    fetchChannelSecretKeyMock.mockResolvedValueOnce("sk-mask***")
    const context = {
      channel: makeChannel({
        id: 85,
        type: ChannelType.OpenAI,
        base_url: "https://channel.example.com",
        key: "",
      }),
      managedConfig: makeRuntimeConfig({ siteType: SITE_TYPES.NEW_API }),
      cache: new Map<string, boolean>(),
    }

    await expect(
      matchesProbeFilterRule(makeProbeRule(), "model-a", context),
    ).rejects.toMatchObject({
      reason: "key-unavailable",
    })
  })

  it("resolves a hidden key only once across repeated probe evaluations", async () => {
    const context = {
      channel: makeChannel({
        id: 90,
        type: ChannelType.OpenAI,
        base_url: "https://channel.example.com",
        key: "",
      }),
      managedConfig: makeRuntimeConfig({ siteType: SITE_TYPES.VELOERA }),
      cache: new Map<string, boolean>(),
    }

    await matchesProbeFilterRule(makeProbeRule(), "model-a", context)
    await matchesProbeFilterRule(
      makeProbeRule({ id: "other-rule" }),
      "model-b",
      context,
    )

    expect(fetchChannelSecretKeyMock).toHaveBeenCalledTimes(1)
  })

  it("treats empty probe rules as non-matches", async () => {
    const context = {
      channel: makeChannel({
        id: 91,
        type: ChannelType.OpenAI,
        base_url: "https://channel.example.com",
        key: "sk-channel-key",
      }),
      managedConfig: makeRuntimeConfig({ siteType: SITE_TYPES.VELOERA }),
      cache: new Map<string, boolean>(),
    }

    await expect(
      matchesProbeFilterRule(
        makeProbeRule({ probeIds: [] }),
        "model-a",
        context,
      ),
    ).resolves.toBe(false)

    expect(runApiVerificationProbeMock).not.toHaveBeenCalled()
  })
})

describe("ModelSyncService - batching and mapping", () => {
  it("returns empty statistics without progress callbacks when no channels are provided", async () => {
    const service = new ModelSyncService(makeExampleRuntimeConfig())
    const onProgress = vi.fn()

    const result = await service.runBatch([], {
      concurrency: 0,
      maxRetries: 0,
      onProgress,
    })

    expect(onProgress).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      items: [],
      statistics: {
        total: 0,
        successCount: 0,
        failureCount: 0,
      },
    })
  })

  it("records failures when a worker throws unexpectedly during batch execution", async () => {
    const service = new ModelSyncService(makeExampleRuntimeConfig())
    const runForChannelSpy = vi
      .spyOn(service, "runForChannel")
      .mockImplementation(async (channel): Promise<ExecutionItemResult> => {
        if (channel.id === 2) {
          throw new Error("worker exploded")
        }

        return {
          channelId: channel.id,
          channelName: channel.name,
          ok: true,
          attempts: 0,
          finishedAt: 1,
          message: "Success",
        }
      })

    const onProgress = vi.fn()
    const result = await service.runBatch(
      [
        makeChannel({ id: 1, name: "Alpha", models: "" }),
        makeChannel({ id: 2, name: "Beta", models: "" }),
      ],
      {
        concurrency: 5,
        maxRetries: 0,
        onProgress,
      },
    )

    expect(runForChannelSpy).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(result.statistics).toMatchObject({
      total: 2,
      successCount: 1,
      failureCount: 1,
    })
    expect(result.items).toEqual([
      expect.objectContaining({
        channelId: 1,
        ok: true,
      }),
      expect.objectContaining({
        channelId: 2,
        ok: false,
        attempts: 1,
        message: "worker exploded",
      }),
    ])
  })

  it("marks a channel failed when per-channel processing exceeds the configured timeout", async () => {
    vi.useFakeTimers()
    try {
      const service = new ModelSyncService(makeExampleRuntimeConfig())
      const runForChannelSpy = vi
        .spyOn(service, "runForChannel")
        .mockImplementation(
          () => new Promise<ExecutionItemResult>(() => undefined),
        )

      const onProgress = vi.fn()
      const resultPromise = service.runBatch(
        [makeChannel({ id: 10, name: "Slow Channel", models: "gpt-4o" })],
        {
          concurrency: 1,
          maxRetries: 2,
          channelProcessingTimeout: 1,
          onProgress,
        },
      )

      await vi.advanceTimersByTimeAsync(1_000)
      const result = await resultPromise

      expect(runForChannelSpy).toHaveBeenCalledTimes(1)
      expect(runForChannelSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 10 }),
        2,
        expect.any(AbortSignal),
      )
      expect(result.statistics).toMatchObject({
        total: 1,
        successCount: 0,
        failureCount: 1,
      })
      expect(result.items).toEqual([
        expect.objectContaining({
          channelId: 10,
          channelName: "Slow Channel",
          ok: false,
          attempts: 3,
          message: "managedSiteModelSync:execution.errors.channelTimeout",
        }),
      ])
      expect(onProgress).toHaveBeenCalledWith({
        completed: 1,
        total: 1,
        lastResult: expect.objectContaining({
          channelId: 10,
          ok: false,
          message: "managedSiteModelSync:execution.errors.channelTimeout",
        }),
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps rate limiting in model sync and bypasses the generic site limiter", async () => {
    const acquire = vi.fn().mockResolvedValue(undefined)
    const service = new ModelSyncService(makeExampleRuntimeConfig(), {
      requestsPerMinute: 120,
      burst: 5,
    })
    ;(service as any).rateLimiter = { acquire }

    fetchChannelModelsMock.mockResolvedValueOnce(["gpt-4o"])

    await service.fetchChannelModels(123)

    expect(acquire).toHaveBeenCalledTimes(1)
    expect(fetchChannelModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      }),
      123,
      { bypassSiteRequestLimit: true },
    )
  })

  it("passes abort signals to fetch and update requests", async () => {
    const service = new ModelSyncService(makeExampleRuntimeConfig())
    const controller = new AbortController()

    fetchChannelModelsMock.mockResolvedValueOnce(["gpt-4o"])
    updateChannelModelsMock.mockResolvedValueOnce(undefined)
    updateChannelModelMappingMock.mockResolvedValueOnce(undefined)

    await service.fetchChannelModels(123, controller.signal)
    await service.updateChannelModels(
      makeChannel({ id: 123, models: "" }),
      ["gpt-4o"],
      controller.signal,
    )
    await service.updateChannelModelMapping(
      makeChannel({ id: 123, models: "gpt-4o" }),
      { "gpt-4o": "gpt-4o" },
      controller.signal,
    )

    expect(fetchChannelModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      }),
      123,
      { signal: controller.signal },
    )
    expect(updateChannelModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      }),
      123,
      ["gpt-4o"],
      { signal: controller.signal },
    )
    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      }),
      123,
      ["gpt-4o"],
      { "gpt-4o": "gpt-4o" },
      { signal: controller.signal },
    )
  })

  it("combines abort signals with generic site-limiter bypass when model sync is rate-limited", async () => {
    const service = new ModelSyncService(makeExampleRuntimeConfig(), {
      requestsPerMinute: 120,
      burst: 5,
    })
    const controller = new AbortController()

    fetchChannelModelsMock.mockResolvedValueOnce(["gpt-4o"])

    await service.fetchChannelModels(123, controller.signal)

    expect(fetchChannelModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      }),
      123,
      {
        signal: controller.signal,
        bypassSiteRequestLimit: true,
      },
    )
  })

  it("throws before request work when the abort signal is already cancelled", async () => {
    const service = new ModelSyncService(makeExampleRuntimeConfig())
    const controller = new AbortController()
    controller.abort(new Error("cancelled"))

    await expect(
      service.fetchChannelModels(123, controller.signal),
    ).rejects.toThrow("cancelled")
    await expect(
      service.updateChannelModels(
        makeChannel({ id: 123, models: "" }),
        ["gpt-4o"],
        controller.signal,
      ),
    ).rejects.toThrow("cancelled")
    await expect(
      service.updateChannelModelMapping(
        makeChannel({ id: 123, models: "gpt-4o" }),
        { "gpt-4o": "gpt-4o" },
        controller.signal,
      ),
    ).rejects.toThrow("cancelled")
  })

  it("rethrows cancellation after fetch before channel update", async () => {
    const service = new ModelSyncService(makeExampleRuntimeConfig())
    const controller = new AbortController()

    fetchChannelModelsMock.mockImplementationOnce(async () => {
      controller.abort(new Error("cancelled after fetch"))
      return ["gpt-4o"]
    })

    await expect(
      service.runForChannel(
        makeChannel({ id: 123, models: "" }),
        0,
        controller.signal,
      ),
    ).rejects.toThrow("cancelled after fetch")

    expect(updateChannelModelsMock).not.toHaveBeenCalled()
  })

  it("does not run a model-sync throttle when model sync has no configured limiter", async () => {
    const service = new ModelSyncService(makeExampleRuntimeConfig())

    fetchChannelModelsMock.mockResolvedValueOnce(["gpt-4o"])

    await service.fetchChannelModels(123)

    expect(fetchChannelModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      }),
      123,
      undefined,
    )
  })

  it("merges existing channel models with mapping keys before updating model_mapping", async () => {
    const service = new ModelSyncService(makeExampleRuntimeConfig())

    await service.updateChannelModelMapping(
      makeChannel({
        id: 3,
        name: "Gamma",
        models: "gpt-4o,claude-3",
      }),
      {
        "gpt-4o": "gpt-4o",
        "deepseek-chat": "deepseek-chat",
      },
    )

    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        adminToken: "token",
        userId: "1",
      }),
      3,
      ["gpt-4o", "claude-3", "deepseek-chat"],
      {
        "gpt-4o": "gpt-4o",
        "deepseek-chat": "deepseek-chat",
      },
      undefined,
    )
  })
})
