import { beforeEach, describe, expect, it, vi } from "vitest"

import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { ChannelType } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import * as axonHubNativeResources from "~/services/apiAdapters/managedResources/axonHub"
import { axonHubManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/axonHubMigration"
import {
  executeManagedSiteMigrationCore,
  prepareManagedSiteMigrationPreviewCore,
} from "~/services/managedSites/channelMigrationCanonicalOrchestrator"
import {
  collectLegacyMigrationLossSignals,
  resolveAxonHubMigrationResourceRefFromLegacyRow,
  toCanonicalMigrationSelectionFromLegacyAxonRow,
  toCanonicalMigrationSourceFromLegacyChannel,
  toCanonicalTargetPreparationFromLegacyDraft,
} from "~/services/managedSites/channelMigrationLegacyFacade"
import { MANAGED_UPSTREAM_RESOURCE_FEATURES } from "~/services/managedSites/managedUpstreamResourceMigration"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"
import type { ManagedSiteChannel } from "~/types/managedSite"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES,
} from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES,
  ManagedSiteMigrationExecutionAbortedError,
  type ManagedSiteMigrationCanonicalPreview,
  type ManagedSiteMigrationExecutionAbortDetails,
  type ManagedSiteMigrationSelection,
  type ManagedSiteMigrationSource,
  type ManagedSiteMigrationTargetPreparation,
} from "~/types/managedSiteMigrationCapability"
import { OctopusOutboundType } from "~/types/octopus"

const mockGetManagedSiteServiceForType = vi.fn()
const mockDoneHubBuildChannelPayload = vi.fn()
const mockDoneHubCreateChannel = vi.fn()
const mockDoneHubFetchChannelSecretKey = vi.fn()
const mockDoneHubGetConfig = vi.fn()
const mockVeloeraFetchChannelSecretKey = vi.fn()
const mockVeloeraGetConfig = vi.fn()
const mockAxonHubBuildChannelPayload = vi.fn()
const mockAxonHubCreateChannel = vi.fn()
const mockAxonHubGetConfig = vi.fn()
const mockClaudeCodeHubBuildChannelPayload = vi.fn()
const mockClaudeCodeHubCreateChannel = vi.fn()
const mockClaudeCodeHubGetConfig = vi.fn()
const mockResolveManagedUpstreamResourceFeatureCapabilities = vi.fn()
const mockResolveManagedSiteMigrationCapability = vi.fn()

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteServiceForType: mockGetManagedSiteServiceForType,
}))

vi.mock("~/services/managedSites/managedUpstreamResourceService", () => ({
  resolveManagedUpstreamResourceFeatureCapabilities:
    mockResolveManagedUpstreamResourceFeatureCapabilities,
}))

vi.mock("~/services/managedSites/channelMigrationCapabilityRegistry", () => ({
  resolveManagedSiteMigrationCapability:
    mockResolveManagedSiteMigrationCapability,
}))

const buildManagedSiteChannel = (
  overrides: Partial<ManagedSiteChannel> = {},
): ManagedSiteChannel =>
  ({
    id: 1,
    type: ChannelType.OpenAI,
    key: "channel-key",
    name: "Alpha",
    base_url: "https://source.example.com",
    models: "gpt-4o,gpt-4o-mini",
    status: 1,
    weight: 0,
    priority: 0,
    openai_organization: null,
    test_model: null,
    created_time: 0,
    test_time: 0,
    response_time: 0,
    other: "",
    balance: 0,
    balance_updated_time: 0,
    group: "default",
    used_quota: 0,
    model_mapping: "",
    status_code_mapping: "",
    auto_ban: 0,
    other_info: "",
    tag: null,
    param_override: null,
    header_override: null,
    remark: null,
    channel_info: {
      is_multi_key: false,
      multi_key_size: 0,
      multi_key_status_list: null,
      multi_key_polling_index: 0,
      multi_key_mode: "",
    },
    setting: "",
    settings: "",
    ...overrides,
  }) satisfies ManagedSiteChannel

const buildPreferences = (
  overrides: Partial<UserPreferences> = {},
): UserPreferences =>
  ({
    ...DEFAULT_PREFERENCES,
    doneHub: {
      baseUrl: "https://donehub.example.com",
      adminToken: "donehub-token",
      userId: "9",
    },
    ...overrides,
  }) satisfies UserPreferences

const buildMigrationSelection = (
  selectionId: string,
): ManagedSiteMigrationSelection => ({
  selectionId,
  displayName: `Selection ${selectionId}`,
  ref: {
    siteType: SITE_TYPES.NEW_API,
    kind: "channel",
    scopeKey: "https://source.example.invalid",
    resourceId: `resource-${selectionId}`,
  },
})

const buildMigrationSource = (
  overrides: Partial<ManagedSiteMigrationSource> = {},
): ManagedSiteMigrationSource => ({
  sourceSiteType: SITE_TYPES.NEW_API,
  resourceType: ChannelType.OpenAI,
  baseUrl: "https://source.example.invalid",
  models: ["model-example"],
  groups: ["default"],
  priority: 0,
  weight: 0,
  status: "enabled",
  lossSignals: {
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    hasAdvancedSettings: false,
    hasMultiKeyState: false,
  },
  ...overrides,
})

const buildMigrationTarget = (): ManagedSiteMigrationTargetPreparation => ({
  projection: {
    name: "Example",
    type: ChannelType.OpenAI,
    baseUrl: "https://target.example.invalid",
    models: ["model-example"],
    groups: ["default"],
    priority: 0,
    weight: 0,
    status: 1,
  },
  adjustments: {
    remappedType: false,
    normalizedBaseUrl: false,
    forcedDefaultGroup: false,
    ignoredPriority: false,
    ignoredWeight: false,
    simplifiedStatus: false,
  },
})

const buildCanonicalPreview = (
  selections: readonly ManagedSiteMigrationSelection[],
): ManagedSiteMigrationCanonicalPreview => ({
  sourceSiteType: SITE_TYPES.NEW_API,
  targetSiteType: SITE_TYPES.DONE_HUB,
  generalWarningCodes: [],
  items: selections.map((selection) => ({
    selection,
    status: "ready",
    source: buildMigrationSource(),
    target: buildMigrationTarget(),
    warningCodes: [],
  })),
  totalCount: selections.length,
  readyCount: selections.length,
  blockedCount: 0,
})

const captureMigrationExecutionAbort = async (
  execution: Promise<unknown>,
): Promise<ManagedSiteMigrationExecutionAbortedError> => {
  try {
    await execution
  } catch (error) {
    expect(error).toBeInstanceOf(ManagedSiteMigrationExecutionAbortedError)
    return error as ManagedSiteMigrationExecutionAbortedError
  }
  throw new Error("Expected migration execution to abort")
}

const expectMigrationAbortInvariants = (
  error: ManagedSiteMigrationExecutionAbortedError,
) => {
  const details: ManagedSiteMigrationExecutionAbortDetails = error.details
  const { partialResult, remainingSelections } = details
  expect(partialResult.items.length + remainingSelections.length).toBe(
    partialResult.totalSelected,
  )
  expect(
    partialResult.createdCount +
      partialResult.failedCount +
      partialResult.skippedCount +
      partialResult.uncertainCount,
  ).toBe(partialResult.items.length)
  const serializedDetails = JSON.stringify(details)
  expect(serializedDetails).not.toContain("execution-key")
  expect(serializedDetails).not.toContain('"credential"')
  expect(serializedDetails).not.toContain('"projection"')
}

const buildAxonMigrationSource = (
  overrides: Partial<ManagedSiteMigrationSource> = {},
): ManagedSiteMigrationSource => ({
  ...buildMigrationSource(),
  sourceSiteType: SITE_TYPES.AXON_HUB,
  resourceType: ChannelType.Anthropic,
  baseUrl: "https://native-source.example.invalid",
  models: ["model-native"],
  groups: [],
  priority: 0,
  weight: 7,
  ...overrides,
})

const buildAxonTargetPreparation = (
  source: ManagedSiteMigrationSource,
): ManagedSiteMigrationTargetPreparation => ({
  projection: {
    name: "",
    type:
      source.resourceType === ChannelType.Anthropic
        ? AXON_HUB_CHANNEL_TYPE.ANTHROPIC
        : AXON_HUB_CHANNEL_TYPE.OPENAI,
    baseUrl: source.baseUrl,
    models: [...source.models],
    groups: ["default"],
    priority: 0,
    weight: source.weight,
    status: source.status === "enabled" ? 1 : 2,
  },
  adjustments: {
    remappedType: true,
    normalizedBaseUrl: false,
    forcedDefaultGroup: source.groups.join(",") !== "default",
    ignoredPriority: source.priority !== 0,
    ignoredWeight: false,
    simplifiedStatus: source.status === "other",
  },
})

describe("channelMigration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveManagedSiteMigrationCapability.mockReturnValue(null)
    mockDoneHubGetConfig.mockResolvedValue({
      baseUrl: "https://donehub.example.com",
      adminToken: "donehub-token",
      userId: "9",
    })
    mockDoneHubBuildChannelPayload.mockImplementation((draft: any) => ({
      mode: "single",
      channel: {
        name: draft.name,
        key: draft.key,
        status: draft.status,
      },
    }))
    mockDoneHubCreateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    mockDoneHubFetchChannelSecretKey.mockResolvedValue("real-donehub-key")
    mockVeloeraGetConfig.mockResolvedValue({
      baseUrl: "https://veloera.example.com",
      adminToken: "veloera-token",
      userId: "8",
    })
    mockVeloeraFetchChannelSecretKey.mockResolvedValue("real-veloera-key")
    mockAxonHubGetConfig.mockResolvedValue({
      baseUrl: "https://axonhub.example.com",
      email: "admin@example.com",
      password: "axonhub-password",
    })
    mockAxonHubBuildChannelPayload.mockImplementation((draft: any) => ({
      mode: "single",
      channel: {
        name: draft.name,
        type: draft.type,
        key: draft.key,
        base_url: draft.base_url,
        models: draft.models.join(","),
        groups: [],
        priority: 0,
        weight: draft.weight,
        status: draft.status,
      },
    }))
    mockAxonHubCreateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    mockClaudeCodeHubGetConfig.mockResolvedValue({
      baseUrl: "https://cch.example.com",
      adminToken: "cch-token",
    })
    mockClaudeCodeHubBuildChannelPayload.mockImplementation((draft: any) => ({
      mode: "single",
      channel: {
        name: draft.name,
        type: draft.type,
        key: draft.key,
        base_url: draft.base_url,
        models: draft.models.join(","),
        groups: draft.groups,
        group: draft.groups[0],
        priority: draft.priority,
        weight: draft.weight,
        status: draft.status,
      },
    }))
    mockClaudeCodeHubCreateChannel.mockResolvedValue({
      success: true,
      message: "ok",
    })
    mockResolveManagedUpstreamResourceFeatureCapabilities.mockImplementation(
      (siteType: string) => ({
        supported: false,
        siteType,
        feature: "channelMigration",
        reason: "feature-slice-disabled",
      }),
    )
    mockGetManagedSiteServiceForType.mockImplementation((siteType: string) => {
      if (siteType === SITE_TYPES.DONE_HUB) {
        return {
          getConfig: mockDoneHubGetConfig,
          buildChannelPayload: mockDoneHubBuildChannelPayload,
          createChannel: mockDoneHubCreateChannel,
          fetchChannelSecretKey: mockDoneHubFetchChannelSecretKey,
        }
      }

      if (siteType === SITE_TYPES.VELOERA) {
        return {
          getConfig: mockVeloeraGetConfig,
          buildChannelPayload: vi.fn((draft: any) => ({
            mode: "single",
            channel: {
              name: draft.name,
              key: draft.key,
            },
          })),
          createChannel: vi.fn().mockResolvedValue({
            success: true,
            message: "ok",
          }),
          fetchChannelSecretKey: mockVeloeraFetchChannelSecretKey,
        }
      }

      if (siteType === SITE_TYPES.AXON_HUB) {
        return {
          getConfig: mockAxonHubGetConfig,
          buildChannelPayload: mockAxonHubBuildChannelPayload,
          createChannel: mockAxonHubCreateChannel,
        }
      }

      if (siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
        return {
          getConfig: mockClaudeCodeHubGetConfig,
          buildChannelPayload: mockClaudeCodeHubBuildChannelPayload,
          createChannel: mockClaudeCodeHubCreateChannel,
        }
      }

      return {
        getConfig: vi.fn().mockResolvedValue({
          baseUrl: "https://target.example.com",
          adminToken: "target-token",
          userId: "1",
        }),
        buildChannelPayload: vi.fn((draft: any) => ({
          mode: "single",
          channel: {
            name: draft.name,
            key: draft.key,
          },
        })),
        createChannel: vi.fn().mockResolvedValue({
          success: true,
          message: "ok",
        }),
      }
    })
  })

  it("preserves the legacy non-Axon preview row contract", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const channels = [
      buildManagedSiteChannel({
        id: 701,
        name: "First",
        key: "first-key",
        base_url: "https://source.example.invalid",
        model_mapping: '{"legacy":"current"}',
      }),
      buildManagedSiteChannel({
        id: 702,
        name: "Second",
        key: "sk-********",
        base_url: "https://source.example.invalid",
        status_code_mapping: '{"429":"503"}',
      }),
    ]

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels,
      resolveNewApiSourceKey: vi.fn().mockResolvedValue(""),
    })

    expect(preview).toMatchObject({
      totalCount: 2,
      readyCount: 1,
      blockedCount: 1,
    })
    expect(
      preview.items.map(
        ({ channelId, channelName, status, warningCodes, draft }) => ({
          channelId,
          channelName,
          status,
          warningCodes,
          draft,
        }),
      ),
    ).toEqual([
      {
        channelId: 701,
        channelName: "First",
        status: "ready",
        warningCodes: [
          MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MODEL_MAPPING,
        ],
        draft: {
          name: "First",
          type: ChannelType.OpenAI,
          key: "first-key",
          base_url: "https://source.example.invalid",
          models: ["gpt-4o", "gpt-4o-mini"],
          groups: ["default"],
          priority: 0,
          weight: 0,
          status: 1,
        },
      },
      {
        channelId: 702,
        channelName: "Second",
        status: "blocked",
        warningCodes: [
          MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_STATUS_CODE_MAPPING,
        ],
        draft: null,
      },
    ])
  })

  it("preserves native ref precedence and fallback identity for non-Axon legacy rows", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const existingRef = {
      siteType: SITE_TYPES.DONE_HUB,
      kind: "channel" as const,
      scopeKey: "https://native-scope.example.invalid",
      resourceId: "native-resource",
    }
    const prepare = vi.fn(async () => ({
      status: "blocked" as const,
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    }))
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.DONE_HUB
        ? { source: { prepare, resolveCredential: vi.fn() } }
        : null,
    )

    await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.DONE_HUB,
      targetSiteType: SITE_TYPES.VELOERA,
      channels: [
        {
          ...buildManagedSiteChannel({ id: 704, name: "Native ref" }),
          resourceRef: existingRef,
        } as ManagedSiteChannel & { resourceRef: typeof existingRef },
        buildManagedSiteChannel({ id: 705, name: "Fallback ref" }),
      ],
    })

    expect(prepare).toHaveBeenNthCalledWith(1, {
      selectionId: "704",
      displayName: "Native ref",
      ref: existingRef,
    })
    expect(prepare).toHaveBeenNthCalledWith(2, {
      selectionId: "705",
      displayName: "Fallback ref",
      ref: {
        siteType: SITE_TYPES.DONE_HUB,
        kind: "channel",
        scopeKey: "https://donehub.example.com",
        resourceId: "705",
      },
    })
  })

  it("preserves AutoDisabled status through generic legacy target creation", async () => {
    const {
      executeManagedSiteChannelMigration,
      prepareManagedSiteChannelMigrationPreview,
    } = await import("~/services/managedSites/channelMigration")
    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 703,
          name: "Auto-disabled",
          key: "execution-key",
          base_url: "https://source.example.invalid",
          status: 3,
        }),
      ],
    })

    expect(preview.items[0].draft?.status).toBe(3)

    const result = await executeManagedSiteChannelMigration({ preview })

    expect(result.createdCount).toBe(1)
    expect(mockDoneHubCreateChannel).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        channel: expect.objectContaining({
          key: "execution-key",
          status: 3,
        }),
      }),
    )
  })

  it("exposes canonical migration entry points using native resource selections", async () => {
    const { executeManagedSiteMigration, prepareManagedSiteMigrationPreview } =
      await import("~/services/managedSites/channelMigration")
    const selection = {
      selectionId: "legacy-row-7",
      displayName: "Example",
      ref: {
        siteType: SITE_TYPES.NEW_API,
        kind: "channel" as const,
        scopeKey: "https://source.example.invalid",
        resourceId: "native-channel-7",
      },
    }

    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.DONE_HUB,
      selections: [selection],
    })

    expect(preview).toMatchObject({
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.DONE_HUB,
      totalCount: 1,
      readyCount: 0,
      blockedCount: 1,
      items: [
        {
          selection,
          status: "blocked",
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        },
      ],
    })
    expect(preview.items[0]).not.toHaveProperty("draft")

    const result = await executeManagedSiteMigration({ preview })

    expect(result).toEqual({
      totalSelected: 1,
      attemptedCount: 0,
      createdCount: 0,
      failedCount: 0,
      skippedCount: 1,
      uncertainCount: 0,
      items: [
        {
          selectionId: "legacy-row-7",
          displayName: "Example",
          status: "skipped",
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        },
      ],
    })
  })

  it("bridges canonical sources into legacy target creation outcomes", async () => {
    const { executeManagedSiteMigration, prepareManagedSiteMigrationPreview } =
      await import("~/services/managedSites/channelMigration")
    const selections = ["created", "rejected"].map(buildMigrationSelection)
    const prepare = vi.fn(async (selection: ManagedSiteMigrationSelection) => ({
      status: "ready" as const,
      source: buildMigrationSource({ baseUrl: selection.ref.resourceId }),
    }))
    const resolveCredential = vi.fn(
      async (selection: ManagedSiteMigrationSelection) => ({
        status: "ready" as const,
        credential: `credential-${selection.selectionId}`,
      }),
    )
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.NEW_API
        ? { source: { prepare, resolveCredential } }
        : null,
    )
    mockDoneHubCreateChannel
      .mockResolvedValueOnce({ success: true, message: "ok" })
      .mockResolvedValueOnce({ success: false, message: "rejected" })

    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.DONE_HUB,
      selections,
    })
    const result = await executeManagedSiteMigration({ preview })

    expect(preview.items.map((item) => item.status)).toEqual(["ready", "ready"])
    expect(result).toMatchObject({
      attemptedCount: 2,
      createdCount: 1,
      failedCount: 1,
      items: [
        { selectionId: "created", status: "created" },
        {
          selectionId: "rejected",
          status: "failed",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
        },
      ],
    })
  })

  it("fails closed when a ready canonical preview loses its source capability", async () => {
    const { executeManagedSiteMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    const result = await executeManagedSiteMigration({
      preview: buildCanonicalPreview([
        buildMigrationSelection("missing-source-capability"),
      ]),
    })

    expect(result).toMatchObject({
      attemptedCount: 0,
      createdCount: 0,
      skippedCount: 1,
      items: [
        {
          selectionId: "missing-source-capability",
          status: "skipped",
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        },
      ],
    })
    expect(mockDoneHubCreateChannel).not.toHaveBeenCalled()
  })

  it("keeps legacy channel credentials out of the canonical source model", async () => {
    const { toCanonicalMigrationSourceFromLegacyChannel } = await import(
      "~/services/managedSites/channelMigrationLegacyFacade"
    )

    const source = toCanonicalMigrationSourceFromLegacyChannel({
      sourceSiteType: SITE_TYPES.NEW_API,
      channel: buildManagedSiteChannel({ id: 7, name: "Example" }),
    })

    expect(source).toMatchObject({ sourceSiteType: SITE_TYPES.NEW_API })
    expect(source).not.toHaveProperty("credential")
    expect(source).not.toHaveProperty("key")
  })

  it("normalizes unknown Claude Code Hub providers and disabled legacy status", () => {
    const source = toCanonicalMigrationSourceFromLegacyChannel({
      sourceSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      channel: buildManagedSiteChannel({
        type: "future-provider",
        status: 2,
      }),
    })

    expect(source).toMatchObject({
      resourceType: ChannelType.OpenAI,
      status: "disabled",
    })
  })

  it("collects controlled legacy migration loss facts without exposing credentials", () => {
    const lossSignals = collectLegacyMigrationLossSignals(
      buildManagedSiteChannel({
        key: "must-remain-private",
        model_mapping: '{"legacy-model":"example-model"}',
        status_code_mapping: '{"429":"503"}',
        setting: '{"retry":true}',
        channel_info: {
          is_multi_key: true,
          multi_key_size: 2,
          multi_key_status_list: [1, 2],
          multi_key_polling_index: 0,
          multi_key_mode: "round-robin",
        },
      }),
    )

    expect(lossSignals).toEqual({
      hasModelMapping: true,
      hasStatusCodeMapping: true,
      hasAdvancedSettings: true,
      hasMultiKeyState: true,
    })
    expect(lossSignals).not.toHaveProperty("key")
    expect(lossSignals).not.toHaveProperty("credential")
  })

  it("resolves AxonHub migration refs from explicit, existing, and native fallback identities", () => {
    const providedRef = {
      siteType: SITE_TYPES.AXON_HUB,
      kind: "channel" as const,
      scopeKey: "https://provided.example.invalid",
      resourceId: "provided-resource",
    }
    const existingRef = {
      siteType: SITE_TYPES.AXON_HUB,
      kind: "channel" as const,
      scopeKey: "https://existing.example.invalid",
      resourceId: "existing-resource",
    }
    const channelWithExistingRef = {
      ...buildManagedSiteChannel({ id: 81 }),
      resourceRef: existingRef,
      _axonHubData: { id: "native-resource" },
    }

    expect(
      resolveAxonHubMigrationResourceRefFromLegacyRow({
        sourceSiteType: SITE_TYPES.AXON_HUB,
        channel: channelWithExistingRef,
        resourceRef: providedRef,
      }),
    ).toBe(providedRef)
    expect(
      resolveAxonHubMigrationResourceRefFromLegacyRow({
        sourceSiteType: SITE_TYPES.AXON_HUB,
        channel: channelWithExistingRef,
      }),
    ).toBe(existingRef)
    expect(
      resolveAxonHubMigrationResourceRefFromLegacyRow({
        sourceSiteType: SITE_TYPES.AXON_HUB,
        channel: {
          ...buildManagedSiteChannel({ id: 82 }),
          _axonHubData: { id: "  native-fallback  " },
        },
        scopeKey: "https://axon.example.invalid",
      }),
    ).toEqual({
      siteType: SITE_TYPES.AXON_HUB,
      kind: "channel",
      scopeKey: "https://axon.example.invalid",
      resourceId: "native-fallback",
    })
  })

  it("keeps legacy row and native AxonHub resource identities separate", () => {
    const selection = toCanonicalMigrationSelectionFromLegacyAxonRow({
      sourceSiteType: SITE_TYPES.AXON_HUB,
      channel: {
        ...buildManagedSiteChannel({ id: 83, name: "Example Axon channel" }),
        _axonHubData: { id: "native-83" },
      },
      scopeKey: "https://axon.example.invalid",
    })

    expect(selection).toEqual({
      selectionId: "83",
      displayName: "Example Axon channel",
      ref: {
        siteType: SITE_TYPES.AXON_HUB,
        kind: "channel",
        scopeKey: "https://axon.example.invalid",
        resourceId: "native-83",
      },
    })
  })

  it("rejects a pre-aborted preview before adapter work starts", async () => {
    const selection = buildMigrationSelection("pre-aborted-preview")
    const cancellation = new Error("Preview cancelled before start")
    const controller = new AbortController()
    controller.abort(cancellation)
    const prepareSource = vi.fn()
    const prepareTarget = vi.fn()

    await expect(
      prepareManagedSiteMigrationPreviewCore({
        sourceSiteType: SITE_TYPES.NEW_API,
        targetSiteType: SITE_TYPES.DONE_HUB,
        selections: [selection],
        signal: controller.signal,
        sourceFailureReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        targetFailureReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.TARGET_DRAFT_PREPARATION_FAILED,
        prepareSource,
        prepareTarget,
        getReadyWarningCodes: () => [],
      }),
    ).rejects.toBe(cancellation)
    expect(prepareSource).not.toHaveBeenCalled()
    expect(prepareTarget).not.toHaveBeenCalled()
  })

  it.each(["source", "target"] as const)(
    "rethrows canonical preview cancellation from %s preparation",
    async (stage) => {
      const selection = buildMigrationSelection("abort-preview")
      const abortError = Object.assign(new Error("Preview cancelled"), {
        name: "AbortError",
      })

      const previewPromise = prepareManagedSiteMigrationPreviewCore({
        sourceSiteType: SITE_TYPES.NEW_API,
        targetSiteType: SITE_TYPES.DONE_HUB,
        selections: [selection],
        signal: new AbortController().signal,
        sourceFailureReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        targetFailureReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.TARGET_DRAFT_PREPARATION_FAILED,
        prepareSource: async () => {
          if (stage === "source") throw abortError
          return { status: "ready", source: buildMigrationSource() }
        },
        prepareTarget: async () => {
          throw abortError
        },
        getReadyWarningCodes: () => [],
      })

      await expect(previewPromise).rejects.toBe(abortError)
    },
  )

  it("stops preview workers from claiming later rows after one mapper aborts", async () => {
    const selections = Array.from({ length: 12 }, (_, index) =>
      buildMigrationSelection(`preview-${index}`),
    )
    const abortError = Object.assign(new Error("Preview cancelled"), {
      name: "AbortError",
    })
    const startedSelections: string[] = []
    let releaseInitialBatch!: () => void
    const initialBatchStarted = new Promise<void>((resolve) => {
      releaseInitialBatch = resolve
    })
    let releaseInFlight!: () => void
    const inFlightCanFinish = new Promise<void>((resolve) => {
      releaseInFlight = resolve
    })
    let finishedInitialCount = 0
    let resolveInitialFinished!: () => void
    const initialInFlightFinished = new Promise<void>((resolve) => {
      resolveInitialFinished = resolve
    })

    const previewPromise = prepareManagedSiteMigrationPreviewCore({
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.DONE_HUB,
      selections,
      sourceFailureReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      targetFailureReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.TARGET_DRAFT_PREPARATION_FAILED,
      prepareSource: async (selection) => {
        startedSelections.push(selection.selectionId)
        if (startedSelections.length === 5) releaseInitialBatch()
        await initialBatchStarted
        if (selection.selectionId === "preview-0") throw abortError
        await inFlightCanFinish
        if (Number(selection.selectionId.split("-")[1]) < 5) {
          finishedInitialCount += 1
          if (finishedInitialCount === 4) resolveInitialFinished()
        }
        return {
          status: "blocked",
          reasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
        }
      },
      prepareTarget: async () => buildMigrationTarget(),
      getReadyWarningCodes: () => [],
    })

    await expect(previewPromise).rejects.toBe(abortError)
    expect(startedSelections).toHaveLength(5)

    releaseInFlight()
    await initialInFlightFinished
    await Promise.resolve()
    await Promise.resolve()

    expect(startedSelections).toHaveLength(5)
  })

  it("reports all selections remaining when execution is aborted before the first row", async () => {
    const selections = [
      buildMigrationSelection("first"),
      buildMigrationSelection("second"),
    ]
    const controller = new AbortController()
    const cause = new Error("Cancelled before execution")
    controller.abort(cause)
    const resolveCredential = vi.fn()
    const create = vi.fn()

    const error = await captureMigrationExecutionAbort(
      executeManagedSiteMigrationCore({
        preview: buildCanonicalPreview(selections),
        targetAvailable: true,
        signal: controller.signal,
        sourceFailureReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        resolveCredential,
        create,
      }),
    )

    expect(error.cause).toBe(cause)
    expect(error.details).toEqual({
      partialResult: {
        totalSelected: 2,
        attemptedCount: 0,
        createdCount: 0,
        failedCount: 0,
        skippedCount: 0,
        uncertainCount: 0,
        items: [],
      },
      remainingSelections: selections,
    })
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expectMigrationAbortInvariants(error)
  })

  it("retains a created result when cancellation arrives with the create response", async () => {
    const selections = [
      buildMigrationSelection("created"),
      buildMigrationSelection("remaining"),
    ]
    const controller = new AbortController()
    const resolveCredential = vi.fn(async () => ({
      status: "ready" as const,
      credential: "execution-key",
    }))
    const create = vi.fn(async () => {
      controller.abort(new Error("Cancelled after create"))
      return { status: "created" as const }
    })

    const error = await captureMigrationExecutionAbort(
      executeManagedSiteMigrationCore({
        preview: buildCanonicalPreview(selections),
        targetAvailable: true,
        signal: controller.signal,
        sourceFailureReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        resolveCredential,
        create,
      }),
    )

    expect(error.details.partialResult).toEqual({
      totalSelected: 2,
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      skippedCount: 0,
      uncertainCount: 0,
      items: [
        {
          selectionId: "created",
          displayName: "Selection created",
          status: "created",
        },
      ],
    })
    expect(error.details.remainingSelections).toEqual([selections[1]])
    expect(resolveCredential).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
    expectMigrationAbortInvariants(error)
  })

  it("retains an uncertain result when cancellation arrives with the create response", async () => {
    const selections = [
      buildMigrationSelection("uncertain"),
      buildMigrationSelection("remaining"),
    ]
    const controller = new AbortController()
    const resolveCredential = vi.fn(async () => ({
      status: "ready" as const,
      credential: "execution-key",
    }))
    const create = vi.fn(async () => {
      controller.abort(new Error("Cancelled after uncertain create"))
      return { status: "uncertain" as const }
    })

    const error = await captureMigrationExecutionAbort(
      executeManagedSiteMigrationCore({
        preview: buildCanonicalPreview(selections),
        targetAvailable: true,
        signal: controller.signal,
        sourceFailureReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        resolveCredential,
        create,
      }),
    )

    expect(error.details.partialResult).toMatchObject({
      totalSelected: 2,
      attemptedCount: 1,
      createdCount: 0,
      failedCount: 0,
      skippedCount: 0,
      uncertainCount: 1,
      items: [
        {
          selectionId: "uncertain",
          status: "uncertain",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
        },
      ],
    })
    expect(error.details.remainingSelections).toEqual([selections[1]])
    expect(resolveCredential).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
    expectMigrationAbortInvariants(error)
  })

  it("classifies uncertain create errors before honoring cancellation", async () => {
    const selections = [
      buildMigrationSelection("uncertain-error"),
      buildMigrationSelection("remaining"),
    ]
    const controller = new AbortController()
    const mutationError = new Error("Mutation state is uncertain")
    const create = vi.fn(async () => {
      controller.abort(new Error("Cancelled during uncertain create"))
      throw mutationError
    })

    const error = await captureMigrationExecutionAbort(
      executeManagedSiteMigrationCore({
        preview: buildCanonicalPreview(selections),
        targetAvailable: true,
        signal: controller.signal,
        sourceFailureReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        resolveCredential: async () => ({
          status: "ready",
          credential: "execution-key",
        }),
        create,
        isMutationStateUncertain: (error) => error === mutationError,
      }),
    )

    expect(error.details.partialResult).toMatchObject({
      attemptedCount: 1,
      uncertainCount: 1,
      items: [
        {
          selectionId: "uncertain-error",
          status: "uncertain",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
        },
      ],
    })
    expect(error.details.remainingSelections).toEqual([selections[1]])
    expect(create).toHaveBeenCalledOnce()
    expectMigrationAbortInvariants(error)
  })

  it("retains earlier outcomes when cancellation occurs during a later credential resolution", async () => {
    const selections = [
      buildMigrationSelection("created"),
      buildMigrationSelection("credential-aborted"),
      buildMigrationSelection("remaining"),
    ]
    const controller = new AbortController()
    const cause = new Error("Credential resolution cancelled")
    const resolveCredential = vi.fn(async (selection) => {
      if (selection.selectionId === "credential-aborted") {
        controller.abort(cause)
        throw cause
      }
      return { status: "ready" as const, credential: "execution-key" }
    })
    const create = vi.fn(async () => ({ status: "created" as const }))

    const error = await captureMigrationExecutionAbort(
      executeManagedSiteMigrationCore({
        preview: buildCanonicalPreview(selections),
        targetAvailable: true,
        signal: controller.signal,
        sourceFailureReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        resolveCredential,
        create,
      }),
    )

    expect(error.cause).toBe(cause)
    expect(error.details.partialResult).toMatchObject({
      totalSelected: 3,
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      skippedCount: 0,
      uncertainCount: 0,
      items: [{ selectionId: "created", status: "created" }],
    })
    expect(error.details.remainingSelections).toEqual(selections.slice(1))
    expect(resolveCredential).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenCalledOnce()
    expectMigrationAbortInvariants(error)
  })

  it("accounts for every canonical execution outcome and continues after non-abort failures", async () => {
    const selections = [
      "created",
      "failed",
      "uncertain",
      "thrown",
      "blocked",
      "after",
    ].map(buildMigrationSelection)
    const preview = buildCanonicalPreview(selections)
    const items = preview.items.map((item) =>
      item.selection.selectionId === "blocked"
        ? {
            selection: item.selection,
            status: "blocked" as const,
            warningCodes: [],
            blockingReasonCode:
              MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
          }
        : item,
    )
    const selectionIdBySource = new Map(
      items.flatMap((item) =>
        item.status === "ready"
          ? [[item.source, item.selection.selectionId] as const]
          : [],
      ),
    )
    const resolvedSelections: string[] = []
    const createCounts = new Map<string, number>()

    const result = await executeManagedSiteMigrationCore({
      preview: {
        ...preview,
        items,
        readyCount: 5,
        blockedCount: 1,
      },
      targetAvailable: true,
      sourceFailureReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      resolveCredential: async (selection) => {
        resolvedSelections.push(selection.selectionId)
        return { status: "ready", credential: "execution-key" }
      },
      create: async (command) => {
        const selectionId = selectionIdBySource.get(command.source)!
        createCounts.set(selectionId, (createCounts.get(selectionId) ?? 0) + 1)
        if (selectionId === "failed") {
          return {
            status: "failed",
            failureCode:
              MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
          }
        }
        if (selectionId === "uncertain") return { status: "uncertain" }
        if (selectionId === "thrown") throw new Error("Create failed")
        return { status: "created" }
      },
    })

    expect(result).toEqual({
      totalSelected: 6,
      attemptedCount: 5,
      createdCount: 2,
      failedCount: 2,
      skippedCount: 1,
      uncertainCount: 1,
      items: [
        {
          selectionId: "created",
          displayName: "Selection created",
          status: "created",
        },
        {
          selectionId: "failed",
          displayName: "Selection failed",
          status: "failed",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
        },
        {
          selectionId: "uncertain",
          displayName: "Selection uncertain",
          status: "uncertain",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
        },
        {
          selectionId: "thrown",
          displayName: "Selection thrown",
          status: "failed",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.Unexpected,
        },
        {
          selectionId: "blocked",
          displayName: "Selection blocked",
          status: "skipped",
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
        },
        {
          selectionId: "after",
          displayName: "Selection after",
          status: "created",
        },
      ],
    })
    expect(resolvedSelections).toEqual([
      "created",
      "failed",
      "uncertain",
      "thrown",
      "after",
    ])
    expect(createCounts).toEqual(
      new Map([
        ["created", 1],
        ["failed", 1],
        ["uncertain", 1],
        ["thrown", 1],
        ["after", 1],
      ]),
    )
  })

  it("skips blocked credential rows without attempting creation and continues in order", async () => {
    const selections = [
      buildMigrationSelection("blocked-credential"),
      buildMigrationSelection("created-after-blocker"),
    ]
    const preview = buildCanonicalPreview(selections)
    const resolveCredential = vi.fn(async (selection) =>
      selection.selectionId === "blocked-credential"
        ? {
            status: "blocked" as const,
            reasonCode:
              MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
          }
        : { status: "ready" as const, credential: "execution-key" },
    )
    const create = vi.fn(async () => ({ status: "created" as const }))

    const result = await executeManagedSiteMigrationCore({
      preview,
      targetAvailable: true,
      sourceFailureReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      resolveCredential,
      create,
    })

    expect(result).toEqual({
      totalSelected: 2,
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      skippedCount: 1,
      uncertainCount: 0,
      items: [
        {
          selectionId: "blocked-credential",
          displayName: "Selection blocked-credential",
          status: "skipped",
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
        },
        {
          selectionId: "created-after-blocker",
          displayName: "Selection created-after-blocker",
          status: "created",
        },
      ],
    })
    expect(resolveCredential).toHaveBeenNthCalledWith(1, selections[0])
    expect(resolveCredential).toHaveBeenNthCalledWith(2, selections[1])
    expect(create).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: preview.items[1].source,
        projection:
          preview.items[1].status === "ready"
            ? preview.items[1].target.projection
            : undefined,
        credential: "execution-key",
      }),
    )
  })

  it("fails ready canonical rows without resolving credentials when the target is unavailable", async () => {
    const selection = buildMigrationSelection("target-unavailable")
    const resolveCredential = vi.fn()
    const create = vi.fn()

    const result = await executeManagedSiteMigrationCore({
      preview: buildCanonicalPreview([selection]),
      targetAvailable: false,
      sourceFailureReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      resolveCredential,
      create,
    })

    expect(result).toMatchObject({
      totalSelected: 1,
      attemptedCount: 0,
      createdCount: 0,
      failedCount: 1,
      skippedCount: 0,
      uncertainCount: 0,
      items: [
        {
          selectionId: "target-unavailable",
          status: "failed",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetUnavailable,
        },
      ],
    })
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it("propagates the public operation signal through canonical capabilities", async () => {
    const { executeManagedSiteMigration, prepareManagedSiteMigrationPreview } =
      await import("~/services/managedSites/channelMigration")
    const selection = buildMigrationSelection("public-signal")
    const source = buildMigrationSource()
    const target = buildMigrationTarget()
    const prepareSource = vi.fn(async () => ({
      status: "ready" as const,
      source,
    }))
    const resolveCredential = vi.fn(async () => ({
      status: "ready" as const,
      credential: "execution-key",
    }))
    const prepareTarget = vi.fn(async () => target)
    const create = vi.fn(async () => ({ status: "created" as const }))
    mockResolveManagedSiteMigrationCapability.mockImplementation(
      (siteType: string) => {
        if (siteType === SITE_TYPES.NEW_API) {
          return { source: { prepare: prepareSource, resolveCredential } }
        }
        if (siteType === SITE_TYPES.DONE_HUB) {
          return { target: { prepare: prepareTarget, create } }
        }
        return null
      },
    )
    const controller = new AbortController()
    const options = { signal: controller.signal }

    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.DONE_HUB,
      selections: [selection],
      options,
    })
    const result = await executeManagedSiteMigration({ preview, options })

    expect(result.createdCount).toBe(1)
    expect(prepareSource).toHaveBeenCalledWith(selection, options)
    expect(prepareTarget).toHaveBeenCalledWith(source, options)
    expect(resolveCredential).toHaveBeenCalledWith(selection, options)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ source, projection: target.projection }),
      options,
    )
  })

  it("blocks New API preview items when a masked source key still requires verification", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 11,
          key: "sk-********",
        }),
      ],
      resolveNewApiSourceKey: vi
        .fn()
        .mockRejectedValue(new Error("Verification required")),
    })

    expect(preview.readyCount).toBe(0)
    expect(preview.blockedCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      channelId: 11,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      blockingMessage: "Verification required",
    })
  })

  it("blocks New API preview items when masked source keys have no resolver available", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 12,
          key: "sk-********",
        }),
      ],
    })

    expect(preview.readyCount).toBe(0)
    expect(preview.items[0]).toMatchObject({
      channelId: 12,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
  })

  it("hydrates masked Done Hub keys and warns about Octopus-specific field normalization", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.DONE_HUB,
      targetSiteType: SITE_TYPES.OCTOPUS,
      channels: [
        buildManagedSiteChannel({
          id: 21,
          key: "sk-********",
          type: ChannelType.Gemini,
          base_url: "https://provider.example.com",
          group: "vip,default",
          priority: 10,
          weight: 5,
          status: 3,
          model_mapping: '{"gpt-4o":"gpt-4.1"}',
        }),
      ],
    })

    expect(mockDoneHubFetchChannelSecretKey).toHaveBeenCalledWith(
      {
        baseUrl: "https://donehub.example.com",
        adminToken: "donehub-token",
        userId: "9",
      },
      21,
    )
    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft).toMatchObject({
      key: "real-donehub-key",
      base_url: "https://provider.example.com/v1",
      groups: ["default"],
      priority: 0,
      weight: 0,
      status: 2,
      type: 3,
    })
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MODEL_MAPPING,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_NORMALIZES_BASE_URL,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_PRIORITY,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_WEIGHT,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS,
      ]),
    )
  })

  it("hydrates masked Veloera keys through the managed-site service loader", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        veloera: {
          baseUrl: "https://veloera.example.com",
          adminToken: "veloera-token",
          userId: "8",
        },
      }),
      sourceSiteType: SITE_TYPES.VELOERA,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22,
          key: "sk-********",
        }),
      ],
    })

    expect(mockVeloeraFetchChannelSecretKey).toHaveBeenCalledWith(
      {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "8",
      },
      22,
    )
    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft?.key).toBe("real-veloera-key")
  })

  it("uses feature-gated resource secrets for migrated source preview key hydration", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const revealSecret = vi.fn().mockResolvedValue({
      status: "available",
      secret: "resource-revealed-key",
    })
    mockResolveManagedUpstreamResourceFeatureCapabilities.mockImplementation(
      (siteType: string, feature: string) =>
        siteType === SITE_TYPES.DONE_HUB &&
        feature === MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration
          ? {
              supported: true,
              siteType,
              feature,
              capabilities: {
                items: {
                  list: vi.fn(),
                  search: vi.fn(),
                  getDetail: vi.fn(),
                  create: vi.fn(),
                  update: vi.fn(),
                  delete: vi.fn(),
                },
                drafts: {
                  prepareImportDraft: vi.fn(),
                  prepareEditDraft: vi.fn(),
                  describeFields: vi.fn(),
                  validateDraft: vi.fn(),
                },
                secrets: {
                  revealSecret,
                },
              },
            }
          : {
              supported: false,
              siteType,
              feature,
              reason: "feature-slice-disabled",
            },
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.DONE_HUB,
      targetSiteType: SITE_TYPES.VELOERA,
      channels: [
        buildManagedSiteChannel({
          id: 22_01,
          key: "sk-********",
        }),
      ],
    })

    expect(revealSecret).toHaveBeenCalledWith(
      {
        baseUrl: "https://donehub.example.com",
        adminToken: "donehub-token",
        userId: "9",
      },
      {
        managedSiteType: SITE_TYPES.DONE_HUB,
        scopeKey: "https://donehub.example.com",
        resourceId: "2201",
      },
    )
    expect(mockDoneHubFetchChannelSecretKey).not.toHaveBeenCalled()
    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft?.key).toBe("resource-revealed-key")
  })

  it("falls back to legacy source key hydration when the channel migration resource feature is unavailable", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.DONE_HUB,
      targetSiteType: SITE_TYPES.VELOERA,
      channels: [
        buildManagedSiteChannel({
          id: 22_02,
          key: "sk-********",
        }),
      ],
    })

    expect(mockDoneHubFetchChannelSecretKey).toHaveBeenCalledWith(
      {
        baseUrl: "https://donehub.example.com",
        adminToken: "donehub-token",
        userId: "9",
      },
      22_02,
    )
    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft?.key).toBe("real-donehub-key")
  })

  it("blocks managed-site preview items when source admin config is missing", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        doneHub: {
          baseUrl: "",
          adminToken: "",
          userId: "",
        },
      }),
      sourceSiteType: SITE_TYPES.DONE_HUB,
      targetSiteType: SITE_TYPES.VELOERA,
      channels: [
        buildManagedSiteChannel({
          id: 22_1,
          key: "sk-********",
        }),
      ],
    })

    expect(preview.readyCount).toBe(0)
    expect(preview.items[0]).toMatchObject({
      channelId: 22_1,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      blockingMessage: "Source managed-site configuration is missing.",
    })
  })

  it("blocks managed-site preview items when the provider cannot hydrate secret keys", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockGetManagedSiteServiceForType.mockImplementation((siteType: string) => {
      if (siteType === SITE_TYPES.DONE_HUB) {
        return {
          getConfig: mockDoneHubGetConfig,
          buildChannelPayload: mockDoneHubBuildChannelPayload,
          createChannel: mockDoneHubCreateChannel,
        }
      }

      return {
        getConfig: vi.fn().mockResolvedValue({
          baseUrl: "https://target.example.com",
          adminToken: "target-token",
          userId: "1",
        }),
        buildChannelPayload: vi.fn((draft: any) => ({
          mode: "single",
          channel: {
            name: draft.name,
            key: draft.key,
          },
        })),
        createChannel: vi.fn().mockResolvedValue({
          success: true,
          message: "ok",
        }),
      }
    })

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.DONE_HUB,
      targetSiteType: SITE_TYPES.VELOERA,
      channels: [
        buildManagedSiteChannel({
          id: 22_2,
          key: "sk-********",
        }),
      ],
    })

    expect(preview.readyCount).toBe(0)
    expect(preview.items[0]).toMatchObject({
      channelId: 22_2,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
  })

  it("maps Octopus source channels back to shared fields and preserves migration warnings", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.OCTOPUS,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_3,
          name: "   ",
          type: OctopusOutboundType.Gemini,
          key: "  octopus-secret  ",
          base_url: " https://octopus-upstream.example.com/v1/ ",
          group: "   ",
          setting: '{"retry":true}',
          channel_info: {
            is_multi_key: true,
            multi_key_size: 2,
            multi_key_status_list: [1, 2],
            multi_key_polling_index: 1,
            multi_key_mode: "round-robin",
          },
        }),
      ],
    })

    expect(preview.items[0].draft).toMatchObject({
      name: "Channel #223",
      type: ChannelType.Gemini,
      key: "octopus-secret",
      base_url: "https://octopus-upstream.example.com/v1/",
      groups: ["default"],
    })
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_ADVANCED_SETTINGS,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MULTI_KEY_STATE,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
      ]),
    )
  })

  it("maps AxonHub string channel types to shared channel types and warns about remapping", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_4,
          type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft?.type).toBe(ChannelType.Anthropic)
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
      ]),
    )
  })

  it("falls back unknown AxonHub string channel types to OpenAI and warns about remapping", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_5,
          type: "future-provider",
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft?.type).toBe(ChannelType.OpenAI)
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
      ]),
    )
  })

  it("maps Claude Code Hub source providers to shared channel types when real key material is available", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        claudeCodeHub: {
          baseUrl: "https://cch.example.com",
          adminToken: "cch-token",
        },
      }),
      sourceSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_51,
          name: "Codex Provider",
          type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CODEX,
          key: "sk-********",
          base_url: " https://cch-upstream.example.com/v1 ",
          models: "gpt-4o,gpt-4.1",
          group: "paid",
          priority: 7,
          weight: 3,
          status: 1,
          _claudeCodeHubData: {
            key: "  cch-real-key  ",
          },
        } as Partial<ManagedSiteChannel>),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      status: "ready",
      draft: {
        name: "Codex Provider",
        type: ChannelType.OpenAI,
        key: "cch-real-key",
        base_url: "https://cch-upstream.example.com/v1",
        models: ["gpt-4o", "gpt-4.1"],
        groups: ["paid"],
        priority: 7,
        weight: 3,
        status: 1,
      },
    })
    expect(preview.items[0].warningCodes).toContain(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
    )
  })

  it("maps New API source channels to AxonHub string channel types and target-safe fields", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        axonHub: {
          baseUrl: "https://axonhub.example.com",
          email: "admin@example.com",
          password: "secret",
        },
      }),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.AXON_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_6,
          type: ChannelType.Gemini,
          key: "  source-key  ",
          group: "default,vip",
          priority: 9,
          weight: 4,
          status: 3,
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft).toMatchObject({
      type: AXON_HUB_CHANNEL_TYPE.GEMINI,
      key: "source-key",
      groups: ["default"],
      priority: 0,
      weight: 4,
      status: 2,
    })
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_PRIORITY,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS,
      ]),
    )
  })

  it("projects legacy Vertex AI channels to AxonHub Gemini compatibility", async () => {
    const channel = buildManagedSiteChannel({
      id: 22_601,
      type: ChannelType.VertexAi,
    })
    const source = toCanonicalMigrationSourceFromLegacyChannel({
      sourceSiteType: SITE_TYPES.NEW_API,
      channel,
    })

    const target = await toCanonicalTargetPreparationFromLegacyDraft({
      source,
      targetSiteType: SITE_TYPES.AXON_HUB,
      displayName: channel.name,
      selectionId: String(channel.id),
    })

    expect(target.projection.type).toBe(AXON_HUB_CHANNEL_TYPE.GEMINI)
  })

  it("lets feature-gated target resources prepare the migration preview draft", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const prepareImportDraft = vi.fn(async ({ source }) => ({
      ...(source as Record<string, unknown>),
      type: AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES,
      weight: 6,
    }))
    mockResolveManagedUpstreamResourceFeatureCapabilities.mockImplementation(
      (siteType: string, feature: string) =>
        siteType === SITE_TYPES.AXON_HUB &&
        feature === MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration
          ? {
              supported: true,
              siteType,
              feature,
              capabilities: {
                items: {
                  list: vi.fn(),
                  search: vi.fn(),
                  getDetail: vi.fn(),
                  create: vi.fn(),
                  update: vi.fn(),
                  delete: vi.fn(),
                },
                drafts: {
                  prepareImportDraft,
                  prepareEditDraft: vi.fn(),
                  describeFields: vi.fn(),
                  validateDraft: vi.fn(),
                },
              },
            }
          : {
              supported: false,
              siteType,
              feature,
              reason: "feature-slice-disabled",
            },
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        axonHub: {
          baseUrl: "https://axonhub.example.com",
          email: "admin@example.com",
          password: "secret",
        },
      }),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.AXON_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_61,
          type: ChannelType.OpenAI,
          key: "source-key",
          weight: 2,
        }),
      ],
    })

    expect(prepareImportDraft).toHaveBeenCalledWith({
      source: expect.objectContaining({
        name: "Alpha",
        type: AXON_HUB_CHANNEL_TYPE.OPENAI,
        weight: 2,
      }),
    })
    expect(prepareImportDraft.mock.calls[0][0].source).not.toHaveProperty("key")
    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft).toMatchObject({
      type: AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES,
      key: "source-key",
      weight: 6,
    })
  })

  it("derives ready warnings from the actual prepared target projection", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const prepareImportDraft = vi.fn(async ({ source }) => ({
      ...(source as Record<string, unknown>),
      base_url: "https://normalized.example.invalid",
    }))
    mockResolveManagedUpstreamResourceFeatureCapabilities.mockImplementation(
      (siteType: string, feature: string) =>
        siteType === SITE_TYPES.DONE_HUB &&
        feature === MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration
          ? {
              supported: true,
              siteType,
              feature,
              capabilities: {
                items: {
                  list: vi.fn(),
                  search: vi.fn(),
                  getDetail: vi.fn(),
                  create: vi.fn(),
                  update: vi.fn(),
                  delete: vi.fn(),
                },
                drafts: {
                  prepareImportDraft,
                  prepareEditDraft: vi.fn(),
                  describeFields: vi.fn(),
                  validateDraft: vi.fn(),
                },
              },
            }
          : {
              supported: false,
              siteType,
              feature,
              reason: "feature-slice-disabled",
            },
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_62,
          key: "source-key",
          base_url: "https://source.example.invalid",
        }),
      ],
    })

    expect(
      preview.items[0].canonicalPreparation?.target.adjustments,
    ).toMatchObject({ normalizedBaseUrl: true })
    expect(preview.items[0].warningCodes).toContain(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_NORMALIZES_BASE_URL,
    )
  })

  it("blocks only the row whose resource target draft preparation fails", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const prepareImportDraft = vi.fn(async ({ source }) => {
      const draft = source as { name: string }
      if (draft.name === "Broken") {
        throw new Error("Target draft failed")
      }

      return {
        ...(source as Record<string, unknown>),
        preparedByPreview: true,
      }
    })
    mockResolveManagedUpstreamResourceFeatureCapabilities.mockImplementation(
      (siteType: string, feature: string) =>
        siteType === SITE_TYPES.AXON_HUB &&
        feature === MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration
          ? {
              supported: true,
              siteType,
              feature,
              capabilities: {
                items: {
                  list: vi.fn(),
                  search: vi.fn(),
                  getDetail: vi.fn(),
                  create: vi.fn(),
                  update: vi.fn(),
                  delete: vi.fn(),
                },
                drafts: {
                  prepareImportDraft,
                  prepareEditDraft: vi.fn(),
                  describeFields: vi.fn(),
                  validateDraft: vi.fn(),
                },
              },
            }
          : {
              supported: false,
              siteType,
              feature,
              reason: "feature-slice-disabled",
            },
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        axonHub: {
          baseUrl: "https://axonhub.example.com",
          email: "admin@example.com",
          password: "secret",
        },
      }),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.AXON_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_64,
          name: "Broken",
          type: ChannelType.OpenAI,
          key: "broken-key",
        }),
        buildManagedSiteChannel({
          id: 22_65,
          name: "Ready",
          type: ChannelType.OpenAI,
          key: "ready-key",
        }),
      ],
    })

    expect(prepareImportDraft).toHaveBeenCalledTimes(2)
    expect(preview).toMatchObject({
      readyCount: 1,
      blockedCount: 1,
      items: [
        {
          channelId: 22_64,
          channelName: "Broken",
          status: "blocked",
          draft: null,
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.TARGET_DRAFT_PREPARATION_FAILED,
          blockingMessage: "Target draft failed",
        },
        {
          channelId: 22_65,
          channelName: "Ready",
          status: "ready",
          draft: expect.objectContaining({
            key: "ready-key",
            preparedByPreview: true,
          }),
        },
      ],
    })
  })

  it("warns about AxonHub default group forcing only when the emitted group differs", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        axonHub: {
          baseUrl: "https://axonhub.example.com",
          email: "admin@example.com",
          password: "secret",
        },
      }),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.AXON_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_61,
          group: "default",
        }),
        buildManagedSiteChannel({
          id: 22_62,
          group: "",
        }),
        buildManagedSiteChannel({
          id: 22_63,
          group: " default ",
        }),
      ],
    })

    expect(preview.items[0].draft?.groups).toEqual(["default"])
    expect(preview.items[0].warningCodes).not.toContain(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
    )
    expect(preview.items[1].draft?.groups).toEqual(["default"])
    expect(preview.items[1].warningCodes).toContain(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
    )
    expect(preview.items[2].draft?.groups).toEqual(["default"])
    expect(preview.items[2].warningCodes).not.toContain(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
    )
  })

  it("falls back unmapped shared channel types to AxonHub OpenAI and warns", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        axonHub: {
          baseUrl: "https://axonhub.example.com",
          email: "admin@example.com",
          password: "secret",
        },
      }),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.AXON_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_7,
          type: ChannelType.Midjourney,
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft?.type).toBe(AXON_HUB_CHANNEL_TYPE.OPENAI)
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
      ]),
    )
  })

  it("maps New API source channels to Claude Code Hub provider types and provider-safe fields", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        claudeCodeHub: {
          baseUrl: "https://cch.example.com",
          adminToken: "cch-token",
        },
      }),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_71,
          type: ChannelType.Anthropic,
          key: "  source-key  ",
          base_url: " https://source.example.com/v1 ",
          models: "claude-3-5-sonnet",
          group: "default,vip",
          priority: 9,
          weight: 4,
          status: 3,
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft).toMatchObject({
      type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      key: "source-key",
      base_url: "https://source.example.com/v1",
      models: ["claude-3-5-sonnet"],
      groups: ["default"],
      priority: 9,
      weight: 4,
      status: 2,
    })
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS,
      ]),
    )
  })

  it("maps legacy Vertex AI channels to Claude Code Hub Gemini providers", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        claudeCodeHub: {
          baseUrl: "https://cch.example.com",
          adminToken: "cch-token",
        },
      }),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_711,
          type: ChannelType.VertexAi,
          key: "source-key",
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft?.type).toBe(
      CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
    )
  })

  it("falls back unmapped shared channel types to Claude Code Hub OpenAI-compatible and warns", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        claudeCodeHub: {
          baseUrl: "https://cch.example.com",
          adminToken: "cch-token",
        },
      }),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_72,
          type: ChannelType.Midjourney,
          key: "source-key",
          group: "",
          weight: 0,
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft).toMatchObject({
      type: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
      groups: ["default"],
      weight: 1,
    })
    expect(preview.items[0].warningCodes).toEqual(
      expect.arrayContaining([
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_WEIGHT,
      ]),
    )
  })

  it("defaults missing source status before simplifying Claude Code Hub target status", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        claudeCodeHub: {
          baseUrl: "https://cch.example.com",
          adminToken: "cch-token",
        },
      }),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_73,
          type: ChannelType.OpenAI,
          key: "source-key",
          status: undefined,
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.items[0].draft?.status).toBe(1)
    expect(preview.items[0].warningCodes).not.toContain(
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS,
    )
  })

  it("blocks only AxonHub source rows without usable key material", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        axonHub: {
          baseUrl: "https://axonhub.example.com",
          email: "admin@example.com",
          password: "secret",
        },
      }),
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_8,
          name: "Ready",
          type: AXON_HUB_CHANNEL_TYPE.OPENROUTER,
          key: "axonhub-real-key",
        }),
        buildManagedSiteChannel({
          id: 22_9,
          name: "Masked",
          type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
          key: "sk-********",
        }),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.blockedCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      channelId: 22_8,
      status: "ready",
      draft: {
        type: ChannelType.OpenRouter,
        key: "axonhub-real-key",
      },
    })
    expect(preview.items[1]).toMatchObject({
      channelId: 22_9,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
  })

  it("blocks only Claude Code Hub source providers without usable key material", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        claudeCodeHub: {
          baseUrl: "https://cch.example.com",
          adminToken: "cch-token",
        },
      }),
      sourceSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 22_91,
          name: "Ready",
          type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
          key: "",
          _claudeCodeHubData: {
            key: "cch-real-key",
          },
        } as Partial<ManagedSiteChannel>),
        buildManagedSiteChannel({
          id: 22_92,
          name: "Masked",
          type: CLAUDE_CODE_HUB_PROVIDER_TYPE.GEMINI,
          key: "sk-********",
          _claudeCodeHubData: {
            maskedKey: "sk-********",
          },
        } as Partial<ManagedSiteChannel>),
      ],
    })

    expect(preview.readyCount).toBe(1)
    expect(preview.blockedCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      channelId: 22_91,
      status: "ready",
      draft: {
        type: ChannelType.Anthropic,
        key: "cch-real-key",
      },
    })
    expect(preview.items[1]).toMatchObject({
      channelId: 22_92,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
  })

  it("limits concurrent preview key resolution while preserving channel order", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    const channels = Array.from({ length: 7 }, (_, index) =>
      buildManagedSiteChannel({
        id: 100 + index,
        name: `Channel ${index + 1}`,
        key: "sk-********",
      }),
    )
    const releaseResolvers: Array<() => void> = []
    let activeResolvers = 0
    let maxActiveResolvers = 0

    const previewPromise = prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels,
      resolveNewApiSourceKey: vi.fn(async ({ channelId }) => {
        activeResolvers += 1
        maxActiveResolvers = Math.max(maxActiveResolvers, activeResolvers)

        await new Promise<void>((resolve) => {
          releaseResolvers.push(() => {
            activeResolvers -= 1
            resolve()
          })
        })

        return `real-key-${channelId}`
      }),
    })

    await vi.waitFor(() => {
      expect(releaseResolvers).toHaveLength(5)
    })
    expect(maxActiveResolvers).toBe(5)

    const firstWave = releaseResolvers.splice(0, 5)
    firstWave.forEach((release) => release())

    await vi.waitFor(() => {
      expect(releaseResolvers).toHaveLength(2)
    })

    const secondWave = releaseResolvers.splice(0, 2)
    secondWave.forEach((release) => release())

    const preview = await previewPromise

    expect(maxActiveResolvers).toBe(5)
    expect(preview.items.map((item) => item.channelId)).toEqual(
      channels.map((channel) => channel.id),
    )
    expect(preview.readyCount).toBe(channels.length)
  })

  it("blocks preview items when hydrated source keys are still masked", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockVeloeraFetchChannelSecretKey.mockResolvedValue("sk-********")

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        veloera: {
          baseUrl: "https://veloera.example.com",
          adminToken: "veloera-token",
          userId: "8",
        },
      }),
      sourceSiteType: SITE_TYPES.VELOERA,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 23,
          key: "sk-********",
        }),
      ],
    })

    expect(preview.readyCount).toBe(0)
    expect(preview.blockedCount).toBe(1)
    expect(preview.items[0]).toMatchObject({
      channelId: 23,
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
  })

  it("creates only ready channels and skips blocked rows during execution", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    const result = await executeManagedSiteChannelMigration({
      preview: {
        sourceSiteType: SITE_TYPES.NEW_API,
        targetSiteType: SITE_TYPES.DONE_HUB,
        generalWarningCodes: [],
        totalCount: 2,
        readyCount: 1,
        blockedCount: 1,
        items: [
          {
            channelId: 31,
            channelName: "Ready",
            sourceChannel: buildManagedSiteChannel({ id: 31, name: "Ready" }),
            draft: {
              name: "Ready",
              type: ChannelType.OpenAI,
              key: "ready-key",
              base_url: "https://source.example.com",
              models: ["gpt-4o"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              status: 1,
            },
            status: "ready",
            warningCodes: [],
          },
          {
            channelId: 32,
            channelName: "Blocked",
            sourceChannel: buildManagedSiteChannel({ id: 32, name: "Blocked" }),
            draft: null,
            status: "blocked",
            warningCodes: [],
            blockingReasonCode:
              MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
            blockingMessage: "Missing key",
          },
        ],
      },
    })

    expect(mockDoneHubBuildChannelPayload).toHaveBeenCalledTimes(1)
    expect(mockDoneHubCreateChannel).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      totalSelected: 2,
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      skippedCount: 1,
    })
    expect(result.items).toEqual([
      {
        channelId: 31,
        channelName: "Ready",
        success: true,
        skipped: false,
      },
      {
        channelId: 32,
        channelName: "Blocked",
        success: false,
        skipped: true,
        blockingReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
        error: "Missing key",
      },
    ])
  })

  it("creates AxonHub targets through the managed-site service and keeps failures per row", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockAxonHubCreateChannel
      .mockResolvedValueOnce({
        success: false,
        message: "AxonHub rejected channel",
      })
      .mockResolvedValueOnce({
        success: true,
        message: "ok",
      })

    const result = await executeManagedSiteChannelMigration({
      preview: {
        sourceSiteType: SITE_TYPES.NEW_API,
        targetSiteType: SITE_TYPES.AXON_HUB,
        generalWarningCodes: [],
        totalCount: 2,
        readyCount: 2,
        blockedCount: 0,
        items: [
          {
            channelId: 61,
            channelName: "Rejected",
            sourceChannel: buildManagedSiteChannel({
              id: 61,
              name: "Rejected",
            }),
            draft: {
              name: "Rejected",
              type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
              key: "rejected-key",
              base_url: "https://source.example.com",
              models: ["claude-3-5-sonnet"],
              groups: ["default"],
              priority: 0,
              weight: 2,
              status: 1,
            },
            status: "ready",
            warningCodes: [],
          },
          {
            channelId: 62,
            channelName: "Ready",
            sourceChannel: buildManagedSiteChannel({ id: 62, name: "Ready" }),
            draft: {
              name: "Ready",
              type: AXON_HUB_CHANNEL_TYPE.OPENAI,
              key: "ready-key",
              base_url: "https://source.example.com",
              models: ["gpt-4o"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              status: 1,
            },
            status: "ready",
            warningCodes: [],
          },
        ],
      },
    })

    expect(mockAxonHubBuildChannelPayload).toHaveBeenCalledTimes(2)
    expect(mockAxonHubCreateChannel).toHaveBeenCalledTimes(2)
    expect(mockAxonHubCreateChannel).toHaveBeenNthCalledWith(
      1,
      {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "axonhub-password",
      },
      expect.objectContaining({
        channel: expect.objectContaining({
          type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
          key: "rejected-key",
          models: "claude-3-5-sonnet",
        }),
      }),
    )
    expect(result).toMatchObject({
      attemptedCount: 2,
      createdCount: 1,
      failedCount: 1,
      skippedCount: 0,
      items: [
        {
          channelId: 61,
          success: false,
          skipped: false,
          error: "AxonHub rejected channel",
        },
        {
          channelId: 62,
          success: true,
          skipped: false,
        },
      ],
    })
  })

  it("creates feature-gated target resources without using legacy channel payloads", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )
    const prepareImportDraft = vi.fn(async ({ source }) => ({
      ...(source as Record<string, unknown>),
      type: AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES,
    }))
    const create = vi.fn().mockResolvedValue({
      success: true,
      message: "created",
    })
    mockResolveManagedUpstreamResourceFeatureCapabilities.mockImplementation(
      (siteType: string, feature: string) =>
        siteType === SITE_TYPES.AXON_HUB &&
        feature === MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration
          ? {
              supported: true,
              siteType,
              feature,
              capabilities: {
                items: {
                  list: vi.fn(),
                  search: vi.fn(),
                  getDetail: vi.fn(),
                  create,
                  update: vi.fn(),
                  delete: vi.fn(),
                },
                drafts: {
                  prepareImportDraft,
                  prepareEditDraft: vi.fn(),
                  describeFields: vi.fn(),
                  validateDraft: vi.fn(),
                },
              },
            }
          : {
              supported: false,
              siteType,
              feature,
              reason: "feature-slice-disabled",
            },
    )

    const result = await executeManagedSiteChannelMigration({
      preview: {
        sourceSiteType: SITE_TYPES.NEW_API,
        targetSiteType: SITE_TYPES.AXON_HUB,
        generalWarningCodes: [],
        totalCount: 1,
        readyCount: 1,
        blockedCount: 0,
        items: [
          {
            channelId: 81,
            channelName: "Resource Target",
            sourceChannel: buildManagedSiteChannel({
              id: 81,
              name: "Resource Target",
            }),
            draft: {
              name: "Resource Target",
              type: AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES,
              key: "ready-key",
              base_url: "https://source.example.com",
              models: ["gpt-4o"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              status: 1,
            },
            status: "ready",
            warningCodes: [],
          },
        ],
      },
    })

    expect(prepareImportDraft).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledWith(
      {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "axonhub-password",
      },
      expect.objectContaining({
        type: AXON_HUB_CHANNEL_TYPE.OPENAI_RESPONSES,
        key: "ready-key",
      }),
    )
    expect(mockAxonHubBuildChannelPayload).not.toHaveBeenCalled()
    expect(mockAxonHubCreateChannel).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      skippedCount: 0,
    })
  })

  it("executes resource target drafts prepared during preview without preparing them again", async () => {
    const {
      executeManagedSiteChannelMigration,
      prepareManagedSiteChannelMigrationPreview,
    } = await import("~/services/managedSites/channelMigration")
    const prepareImportDraft = vi.fn(async ({ source }) => ({
      ...(source as Record<string, unknown>),
      preparedByPreview: true,
    }))
    const create = vi.fn().mockResolvedValue({
      success: true,
      message: "created",
    })
    mockResolveManagedUpstreamResourceFeatureCapabilities.mockImplementation(
      (siteType: string, feature: string) =>
        siteType === SITE_TYPES.AXON_HUB &&
        feature === MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration
          ? {
              supported: true,
              siteType,
              feature,
              capabilities: {
                items: {
                  list: vi.fn(),
                  search: vi.fn(),
                  getDetail: vi.fn(),
                  create,
                  update: vi.fn(),
                  delete: vi.fn(),
                },
                drafts: {
                  prepareImportDraft,
                  prepareEditDraft: vi.fn(),
                  describeFields: vi.fn(),
                  validateDraft: vi.fn(),
                },
              },
            }
          : {
              supported: false,
              siteType,
              feature,
              reason: "feature-slice-disabled",
            },
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences({
        axonHub: {
          baseUrl: "https://axonhub.example.com",
          email: "admin@example.com",
          password: "secret",
        },
      }),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.AXON_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 82,
          name: "Preview Prepared",
          type: ChannelType.OpenAI,
          key: "source-key",
        }),
      ],
    })

    expect(preview.items[0].draft).toMatchObject({
      preparedByPreview: true,
    })

    const result = await executeManagedSiteChannelMigration({ preview })

    expect(prepareImportDraft).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(
      {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "axonhub-password",
      },
      expect.objectContaining({
        name: "Preview Prepared",
        preparedByPreview: true,
        key: "source-key",
      }),
    )
    expect(result).toMatchObject({
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
    })
  })

  it.each([
    {
      label: "Done Hub",
      targetSiteType: SITE_TYPES.DONE_HUB,
      targetConfig: {
        baseUrl: "https://donehub.example.com",
        adminToken: "donehub-token",
        userId: "9",
      },
      draftType: ChannelType.OpenAI,
      legacyBuild: mockDoneHubBuildChannelPayload,
      legacyCreate: mockDoneHubCreateChannel,
    },
    {
      label: "Claude Code Hub",
      targetSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      targetConfig: {
        baseUrl: "https://cch.example.com",
        adminToken: "cch-token",
      },
      draftType: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
      legacyBuild: mockClaudeCodeHubBuildChannelPayload,
      legacyCreate: mockClaudeCodeHubCreateChannel,
    },
  ])(
    "creates feature-gated target resources for $label without legacy channel creation",
    async ({
      targetSiteType,
      targetConfig,
      draftType,
      legacyBuild,
      legacyCreate,
    }) => {
      const { executeManagedSiteChannelMigration } = await import(
        "~/services/managedSites/channelMigration"
      )
      const create = vi.fn().mockResolvedValue({
        success: true,
        message: "created",
      })
      const previewDraft = {
        name: "Prepared Target",
        type: draftType,
        key: "ready-key",
        base_url: "https://source.example.com",
        models: ["gpt-4o"],
        groups: ["default"],
        priority: 0,
        weight: 1,
        status: 1 as const,
      }
      mockResolveManagedUpstreamResourceFeatureCapabilities.mockImplementation(
        (siteType: string, feature: string) =>
          siteType === targetSiteType &&
          feature === MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration
            ? {
                supported: true,
                siteType,
                feature,
                capabilities: {
                  items: {
                    list: vi.fn(),
                    search: vi.fn(),
                    getDetail: vi.fn(),
                    create,
                    update: vi.fn(),
                    delete: vi.fn(),
                  },
                  drafts: {
                    prepareImportDraft: vi.fn(),
                    prepareEditDraft: vi.fn(),
                    describeFields: vi.fn(),
                    validateDraft: vi.fn(),
                  },
                },
              }
            : {
                supported: false,
                siteType,
                feature,
                reason: "feature-slice-disabled",
              },
      )

      const result = await executeManagedSiteChannelMigration({
        preview: {
          sourceSiteType: SITE_TYPES.NEW_API,
          targetSiteType,
          generalWarningCodes: [],
          totalCount: 1,
          readyCount: 1,
          blockedCount: 0,
          items: [
            {
              channelId: 84,
              channelName: "Prepared Target",
              sourceChannel: buildManagedSiteChannel({
                id: 84,
                name: "Prepared Target",
              }),
              draft: previewDraft,
              status: "ready",
              warningCodes: [],
            },
          ],
        },
      })

      expect(create).toHaveBeenCalledWith(targetConfig, previewDraft)
      expect(legacyBuild).not.toHaveBeenCalled()
      expect(legacyCreate).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        attemptedCount: 1,
        createdCount: 1,
        failedCount: 0,
      })
    },
  )

  it.each([
    { status: "masked" as const, message: "Secret is still masked" },
    { status: "unavailable" as const, message: "Secret cannot be revealed" },
  ])(
    "blocks resource-backed source key hydration when revealSecret returns $status",
    async (secretResult) => {
      const { prepareManagedSiteChannelMigrationPreview } = await import(
        "~/services/managedSites/channelMigration"
      )
      const revealSecret = vi.fn().mockResolvedValue(secretResult)
      mockResolveManagedUpstreamResourceFeatureCapabilities.mockImplementation(
        (siteType: string, feature: string) =>
          siteType === SITE_TYPES.DONE_HUB &&
          feature === MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration
            ? {
                supported: true,
                siteType,
                feature,
                capabilities: {
                  items: {
                    list: vi.fn(),
                    search: vi.fn(),
                    getDetail: vi.fn(),
                    create: vi.fn(),
                    update: vi.fn(),
                    delete: vi.fn(),
                  },
                  drafts: {
                    prepareImportDraft: vi.fn(),
                    prepareEditDraft: vi.fn(),
                    describeFields: vi.fn(),
                    validateDraft: vi.fn(),
                  },
                  secrets: {
                    revealSecret,
                  },
                },
              }
            : {
                supported: false,
                siteType,
                feature,
                reason: "feature-slice-disabled",
              },
      )

      const preview = await prepareManagedSiteChannelMigrationPreview({
        preferences: buildPreferences(),
        sourceSiteType: SITE_TYPES.DONE_HUB,
        targetSiteType: SITE_TYPES.VELOERA,
        channels: [
          buildManagedSiteChannel({
            id: 83,
            name: "Masked Source",
            key: "sk-********",
          }),
        ],
      })

      expect(revealSecret).toHaveBeenCalledTimes(1)
      expect(mockDoneHubFetchChannelSecretKey).not.toHaveBeenCalled()
      expect(preview).toMatchObject({
        readyCount: 0,
        blockedCount: 1,
        items: [
          {
            channelId: 83,
            channelName: "Masked Source",
            status: "blocked",
            draft: null,
            blockingReasonCode:
              MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
            blockingMessage: secretResult.message,
          },
        ],
      })
    },
  )

  it("creates Claude Code Hub targets through the managed-site service and keeps failures per row", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockClaudeCodeHubCreateChannel
      .mockResolvedValueOnce({
        success: false,
        message: "Claude Code Hub rejected provider",
      })
      .mockResolvedValueOnce({
        success: true,
        message: "ok",
      })

    const result = await executeManagedSiteChannelMigration({
      preview: {
        sourceSiteType: SITE_TYPES.NEW_API,
        targetSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
        generalWarningCodes: [],
        totalCount: 2,
        readyCount: 2,
        blockedCount: 0,
        items: [
          {
            channelId: 71,
            channelName: "Rejected",
            sourceChannel: buildManagedSiteChannel({
              id: 71,
              name: "Rejected",
            }),
            draft: {
              name: "Rejected",
              type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
              key: "rejected-key",
              base_url: "https://source.example.com",
              models: ["claude-3-5-sonnet"],
              groups: ["default"],
              priority: 1,
              weight: 2,
              status: 1,
            },
            status: "ready",
            warningCodes: [],
          },
          {
            channelId: 72,
            channelName: "Ready",
            sourceChannel: buildManagedSiteChannel({ id: 72, name: "Ready" }),
            draft: {
              name: "Ready",
              type: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
              key: "ready-key",
              base_url: "https://source.example.com",
              models: ["gpt-4o"],
              groups: ["default"],
              priority: 0,
              weight: 1,
              status: 1,
            },
            status: "ready",
            warningCodes: [],
          },
        ],
      },
    })

    expect(mockClaudeCodeHubBuildChannelPayload).toHaveBeenCalledTimes(2)
    expect(mockClaudeCodeHubCreateChannel).toHaveBeenCalledTimes(2)
    expect(mockClaudeCodeHubCreateChannel).toHaveBeenNthCalledWith(
      1,
      {
        baseUrl: "https://cch.example.com",
        adminToken: "cch-token",
      },
      expect.objectContaining({
        channel: expect.objectContaining({
          type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
          key: "rejected-key",
          models: "claude-3-5-sonnet",
        }),
      }),
    )
    expect(result).toMatchObject({
      attemptedCount: 2,
      createdCount: 1,
      failedCount: 1,
      skippedCount: 0,
      items: [
        {
          channelId: 71,
          success: false,
          skipped: false,
          error: "Claude Code Hub rejected provider",
        },
        {
          channelId: 72,
          success: true,
          skipped: false,
        },
      ],
    })
  })

  it("preserves blocker details when execution fails before creating target channels", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockDoneHubGetConfig.mockResolvedValue(null)

    const result = await executeManagedSiteChannelMigration({
      preview: {
        sourceSiteType: SITE_TYPES.NEW_API,
        targetSiteType: SITE_TYPES.DONE_HUB,
        generalWarningCodes: [],
        totalCount: 2,
        readyCount: 1,
        blockedCount: 1,
        items: [
          {
            channelId: 41,
            channelName: "Ready",
            sourceChannel: buildManagedSiteChannel({ id: 41, name: "Ready" }),
            draft: {
              name: "Ready",
              type: ChannelType.OpenAI,
              key: "ready-key",
              base_url: "https://source.example.com",
              models: ["gpt-4o"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              status: 1,
            },
            status: "ready",
            warningCodes: [],
          },
          {
            channelId: 42,
            channelName: "Blocked",
            sourceChannel: buildManagedSiteChannel({ id: 42, name: "Blocked" }),
            draft: null,
            status: "blocked",
            warningCodes: [],
            blockingReasonCode:
              MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
            blockingMessage: "Missing key",
          },
        ],
      },
    })

    expect(result.items).toEqual([
      {
        channelId: 41,
        channelName: "Ready",
        success: false,
        skipped: false,
        error: "Target managed-site configuration is missing.",
      },
      {
        channelId: 42,
        channelName: "Blocked",
        success: false,
        skipped: true,
        blockingReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
        error: "Missing key",
      },
    ])
  })

  it("uses neutral fallback guidance for a blocked target-preparation row", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    const result = await executeManagedSiteChannelMigration({
      preview: {
        sourceSiteType: SITE_TYPES.NEW_API,
        targetSiteType: SITE_TYPES.DONE_HUB,
        generalWarningCodes: [],
        totalCount: 1,
        readyCount: 0,
        blockedCount: 1,
        items: [
          {
            channelId: 43,
            channelName: "Blocked target preparation",
            sourceChannel: buildManagedSiteChannel({ id: 43 }),
            draft: null,
            status: "blocked",
            warningCodes: [],
            blockingReasonCode:
              MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.TARGET_DRAFT_PREPARATION_FAILED,
          },
        ],
      },
    })

    expect(result.items).toEqual([
      {
        channelId: 43,
        channelName: "Blocked target preparation",
        success: false,
        skipped: true,
        blockingReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.TARGET_DRAFT_PREPARATION_FAILED,
        error:
          "This channel cannot be migrated right now. Verify source access and try again.",
      },
    ])
  })

  it("uses a local fallback message when target creation fails without an error message", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockDoneHubCreateChannel.mockResolvedValue({
      success: false,
      message: "",
    })

    const result = await executeManagedSiteChannelMigration({
      preview: {
        sourceSiteType: SITE_TYPES.NEW_API,
        targetSiteType: SITE_TYPES.DONE_HUB,
        generalWarningCodes: [],
        totalCount: 1,
        readyCount: 1,
        blockedCount: 0,
        items: [
          {
            channelId: 51,
            channelName: "Ready",
            sourceChannel: buildManagedSiteChannel({ id: 51, name: "Ready" }),
            draft: {
              name: "Ready",
              type: ChannelType.OpenAI,
              key: "ready-key",
              base_url: "https://source.example.com",
              models: ["gpt-4o"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              status: 1,
            },
            status: "ready",
            warningCodes: [],
          },
        ],
      },
    })

    expect(result).toMatchObject({
      attemptedCount: 1,
      createdCount: 0,
      failedCount: 1,
      skippedCount: 0,
    })
    expect(result.items).toEqual([
      {
        channelId: 51,
        channelName: "Ready",
        success: false,
        skipped: false,
        error: "Unknown error",
      },
    ])
  })

  it("reports thrown target creation errors for ready rows", async () => {
    const { executeManagedSiteChannelMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockDoneHubCreateChannel.mockRejectedValue(new Error("Create exploded"))

    const result = await executeManagedSiteChannelMigration({
      preview: {
        sourceSiteType: SITE_TYPES.NEW_API,
        targetSiteType: SITE_TYPES.DONE_HUB,
        generalWarningCodes: [],
        totalCount: 1,
        readyCount: 1,
        blockedCount: 0,
        items: [
          {
            channelId: 52,
            channelName: "Ready",
            sourceChannel: buildManagedSiteChannel({ id: 52, name: "Ready" }),
            draft: {
              name: "Ready",
              type: ChannelType.OpenAI,
              key: "ready-key",
              base_url: "https://source.example.com",
              models: ["gpt-4o"],
              groups: ["default"],
              priority: 0,
              weight: 0,
              status: 1,
            },
            status: "ready",
            warningCodes: [],
          },
        ],
      },
    })

    expect(result).toMatchObject({
      attemptedCount: 1,
      createdCount: 0,
      failedCount: 1,
      skippedCount: 0,
    })
    expect(result.items).toEqual([
      {
        channelId: 52,
        channelName: "Ready",
        success: false,
        skipped: false,
        error: "Create exploded",
      },
    ])
  })

  it("prepares an Axon target through the named capability and keeps the displayed legacy draft equivalent", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const prepare = vi.fn(async (source: ManagedSiteMigrationSource) =>
      buildAxonTargetPreparation(source),
    )
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB ? { target: { prepare } } : null,
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.AXON_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 301,
          name: "Native target",
          type: ChannelType.Anthropic,
          key: "source-key",
          base_url: "https://source.example.invalid",
          models: "model-a,model-b",
          weight: 7,
        }),
      ],
    })

    expect(prepare).toHaveBeenCalledOnce()
    expect(preview.items[0]).toMatchObject({
      channelId: 301,
      status: "ready",
      draft: {
        name: "Native target",
        type: AXON_HUB_CHANNEL_TYPE.ANTHROPIC,
        base_url: "https://source.example.invalid",
        models: ["model-a", "model-b"],
        groups: ["default"],
        priority: 0,
        weight: 7,
        status: 1,
      },
    })
    expect(
      mockResolveManagedUpstreamResourceFeatureCapabilities,
    ).not.toHaveBeenCalledWith(
      SITE_TYPES.AXON_HUB,
      MANAGED_UPSTREAM_RESOURCE_FEATURES.ChannelMigration,
    )
  })

  it("resolves an Axon credential only at execution and creates exactly once without legacy payload builders", async () => {
    const {
      executeManagedSiteChannelMigration,
      prepareManagedSiteChannelMigrationPreview,
    } = await import("~/services/managedSites/channelMigration")
    const source = buildAxonMigrationSource()
    const sourcePrepare = vi.fn(async () => ({
      status: "ready" as const,
      source,
    }))
    const resolveCredential = vi.fn(async () => ({
      status: "ready" as const,
      credential: "execution-only-key",
    }))
    const targetPrepare = vi.fn(async () => buildAxonTargetPreparation(source))
    const create = vi.fn(async () => ({ status: "created" as const }))
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB
        ? {
            source: { prepare: sourcePrepare, resolveCredential },
            target: { prepare: targetPrepare, create },
          }
        : null,
    )
    const channel = {
      ...buildManagedSiteChannel({ id: 302, name: "Native round trip" }),
      _axonHubData: { id: "native-302" },
    } as ManagedSiteChannel

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.AXON_HUB,
      channels: [channel],
    })
    expect(resolveCredential).not.toHaveBeenCalled()

    const result = await executeManagedSiteChannelMigration({ preview })

    expect(resolveCredential).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ credential: "execution-only-key" }),
    )
    expect(mockAxonHubBuildChannelPayload).not.toHaveBeenCalled()
    expect(mockAxonHubCreateChannel).not.toHaveBeenCalled()
    expect(result.createdCount).toBe(1)
  })

  it("prepares an Axon source from its native string ref without old secret hydration", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const prepare = vi.fn(async () => ({
      status: "ready" as const,
      source: buildAxonMigrationSource(),
    }))
    const resolveCredential = vi.fn()
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB
        ? { source: { prepare, resolveCredential } }
        : null,
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        {
          ...buildManagedSiteChannel({ id: 303, key: "sk-********" }),
          _axonHubData: { id: "native-string-303" },
        } as ManagedSiteChannel,
      ],
    })

    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        selectionId: "303",
        ref: expect.objectContaining({ resourceId: "native-string-303" }),
      }),
    )
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(preview.readyCount).toBe(1)
  })

  it("maps permission-hidden Axon credentials to the existing blocked row", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const prepare = vi.fn(async () => ({
      status: "blocked" as const,
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    }))
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB
        ? { source: { prepare, resolveCredential: vi.fn() } }
        : null,
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [buildManagedSiteChannel({ id: 304 })],
    })

    expect(preview.items[0]).toMatchObject({
      status: "blocked",
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
  })

  it("preserves Axon source projection when targeting a legacy site", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const source = buildAxonMigrationSource({
      resourceType: ChannelType.OpenRouter,
      baseUrl: "https://native.example.invalid",
      models: ["model-one", "model-two"],
      weight: 9,
      status: "disabled",
    })
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB
        ? {
            source: {
              prepare: vi.fn(async () => ({
                status: "ready" as const,
                source,
              })),
              resolveCredential: vi.fn(),
            },
          }
        : null,
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [
        buildManagedSiteChannel({ id: 305, name: "Projected native" }),
      ],
    })

    expect(preview.items[0].draft).toMatchObject({
      name: "Projected native",
      type: ChannelType.OpenRouter,
      base_url: "https://native.example.invalid",
      models: ["model-one", "model-two"],
      weight: 9,
      status: 2,
    })
    expect(preview.items[0].canonicalPreparation?.source).toEqual(source)
  })

  it("executes an Axon native selection into a legacy target with one just-in-time credential resolution and one create", async () => {
    const {
      executeManagedSiteChannelMigration,
      prepareManagedSiteChannelMigrationPreview,
    } = await import("~/services/managedSites/channelMigration")
    const source = buildAxonMigrationSource()
    const resolveCredential = vi.fn(async () => ({
      status: "ready" as const,
      credential: "jit-native-key",
    }))
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB
        ? {
            source: {
              prepare: vi.fn(async () => ({
                status: "ready" as const,
                source,
              })),
              resolveCredential,
            },
          }
        : null,
    )
    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels: [buildManagedSiteChannel({ id: 306 })],
    })

    expect(resolveCredential).not.toHaveBeenCalled()
    const result = await executeManagedSiteChannelMigration({ preview })

    expect(resolveCredential).toHaveBeenCalledOnce()
    expect(mockDoneHubCreateChannel).toHaveBeenCalledOnce()
    expect(mockDoneHubBuildChannelPayload).toHaveBeenCalledWith(
      expect.objectContaining({ key: "jit-native-key" }),
    )
    expect(result.createdCount).toBe(1)
  })

  it.each([
    {
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
      expectedError:
        "The source credential is unavailable. Verify source access and try again.",
    },
    {
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      expectedError:
        "The source credential could not be resolved. Verify source access and try again.",
    },
  ])(
    "explains a just-in-time $reasonCode blocker without creating the ready preview row",
    async ({ reasonCode, expectedError }) => {
      const {
        executeManagedSiteChannelMigration,
        prepareManagedSiteChannelMigrationPreview,
      } = await import("~/services/managedSites/channelMigration")
      const source = buildAxonMigrationSource()
      const resolveCredential = vi.fn(async () => ({
        status: "blocked" as const,
        reasonCode,
      }))
      mockResolveManagedSiteMigrationCapability.mockImplementation(
        (siteType) =>
          siteType === SITE_TYPES.AXON_HUB
            ? {
                source: {
                  prepare: vi.fn(async () => ({
                    status: "ready" as const,
                    source,
                  })),
                  resolveCredential,
                },
              }
            : null,
      )
      const preview = await prepareManagedSiteChannelMigrationPreview({
        preferences: buildPreferences(),
        sourceSiteType: SITE_TYPES.AXON_HUB,
        targetSiteType: SITE_TYPES.DONE_HUB,
        channels: [buildManagedSiteChannel({ id: 306_1 })],
      })

      expect(preview.items[0].status).toBe("ready")
      const result = await executeManagedSiteChannelMigration({ preview })

      expect(resolveCredential).toHaveBeenCalledOnce()
      expect(mockDoneHubBuildChannelPayload).not.toHaveBeenCalled()
      expect(mockDoneHubCreateChannel).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        totalSelected: 1,
        attemptedCount: 0,
        createdCount: 0,
        failedCount: 0,
        skippedCount: 1,
        items: [
          {
            channelId: 306_1,
            success: false,
            skipped: true,
            blockingReasonCode: reasonCode,
            error: expectedError,
          },
        ],
      })
    },
  )

  it("blocks only the row whose named target preparation fails", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const prepare = vi.fn(async (source: ManagedSiteMigrationSource) => {
      if (source.baseUrl.includes("blocked")) throw new Error("blocked target")
      return buildAxonTargetPreparation(source)
    })
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB ? { target: { prepare } } : null,
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.AXON_HUB,
      channels: [
        buildManagedSiteChannel({
          id: 307,
          base_url: "https://blocked.example.invalid",
        }),
        buildManagedSiteChannel({
          id: 308,
          base_url: "https://ready.example.invalid",
        }),
      ],
    })

    expect(preview.items.map((item) => item.status)).toEqual([
      "blocked",
      "ready",
    ])
    expect(preview.items[0].blockingReasonCode).toBe(
      MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.TARGET_DRAFT_PREPARATION_FAILED,
    )
  })

  it("continues after one named target create failure", async () => {
    const {
      executeManagedSiteChannelMigration,
      prepareManagedSiteChannelMigrationPreview,
    } = await import("~/services/managedSites/channelMigration")
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        status: "failed",
        failureCode:
          MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
      })
      .mockResolvedValueOnce({ status: "created" })
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB
        ? {
            target: {
              prepare: vi.fn(async (source) =>
                buildAxonTargetPreparation(source),
              ),
              create,
            },
          }
        : null,
    )
    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.AXON_HUB,
      channels: [
        buildManagedSiteChannel({ id: 309, key: "key-one" }),
        buildManagedSiteChannel({ id: 310, key: "key-two" }),
      ],
    })

    const result = await executeManagedSiteChannelMigration({ preview })

    expect(create).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      attemptedCount: 2,
      createdCount: 1,
      failedCount: 1,
    })
    expect(result.items.map((item) => item.success)).toEqual([false, true])
  })

  it("reports named-target uncertainty with verify-before-retry guidance", async () => {
    const {
      executeManagedSiteChannelMigration,
      prepareManagedSiteChannelMigrationPreview,
    } = await import("~/services/managedSites/channelMigration")
    const create = vi.fn(async () => ({ status: "uncertain" as const }))
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB
        ? {
            target: {
              prepare: vi.fn(async (source) =>
                buildAxonTargetPreparation(source),
              ),
              create,
            },
          }
        : null,
    )
    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.AXON_HUB,
      channels: [buildManagedSiteChannel({ id: 311, key: "source-key" })],
    })

    const result = await executeManagedSiteChannelMigration({ preview })

    expect(result).toMatchObject({
      attemptedCount: 1,
      createdCount: 0,
      failedCount: 1,
      skippedCount: 0,
      items: [
        {
          channelId: 311,
          success: false,
          skipped: false,
          error:
            "Target creation may have succeeded. Verify the target before retrying.",
        },
      ],
    })
  })

  it("preserves string selection identity and order across native preparation", async () => {
    const { prepareManagedSiteChannelMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const prepare = vi.fn(async (selection: ManagedSiteMigrationSelection) => ({
      status: "ready" as const,
      source: buildAxonMigrationSource({ baseUrl: selection.ref.resourceId }),
    }))
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB
        ? { source: { prepare, resolveCredential: vi.fn() } }
        : null,
    )
    const channels = ["native-z", "native-a", "native-m"].map(
      (resourceId, index) =>
        ({
          ...buildManagedSiteChannel({ id: 311 + index, name: resourceId }),
          _axonHubData: { id: resourceId },
        }) as ManagedSiteChannel,
    )

    const preview = await prepareManagedSiteChannelMigrationPreview({
      preferences: buildPreferences(),
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.DONE_HUB,
      channels,
    })

    expect(
      prepare.mock.calls.map(([selection]) => selection.ref.resourceId),
    ).toEqual(["native-z", "native-a", "native-m"])
    expect(preview.items.map((item) => item.channelId)).toEqual([311, 312, 313])
    expect(
      preview.items.map(
        (item) => item.canonicalPreparation?.selection.ref.resourceId,
      ),
    ).toEqual(["native-z", "native-a", "native-m"])
  })

  it("maps uncertain target creation to an explicit non-replayable result", async () => {
    const { executeManagedSiteMigration, prepareManagedSiteMigrationPreview } =
      await import("~/services/managedSites/channelMigration")
    const source = buildAxonMigrationSource()
    const create = vi.fn(async () => ({ status: "uncertain" as const }))
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB
        ? {
            source: {
              prepare: vi.fn(async () => ({
                status: "ready" as const,
                source,
              })),
              resolveCredential: vi.fn(async () => ({
                status: "ready" as const,
                credential: "ephemeral-key",
              })),
            },
            target: {
              prepare: vi.fn(async () => buildAxonTargetPreparation(source)),
              create,
            },
          }
        : null,
    )
    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.AXON_HUB,
      selections: [
        {
          ...buildMigrationSelection("native-selection"),
          ref: {
            ...buildMigrationSelection("native-selection").ref,
            siteType: SITE_TYPES.AXON_HUB,
            resourceId: "native-selection",
          },
        },
      ],
    })
    expect(preview.items[0]).toMatchObject({
      status: "ready",
      target: { projection: { name: "Selection native-selection" } },
    })

    const result = await executeManagedSiteMigration({ preview })

    expect(create).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      attemptedCount: 1,
      createdCount: 0,
      failedCount: 0,
      uncertainCount: 1,
      items: [
        {
          status: "uncertain",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
        },
      ],
    })
  })

  it("classifies managed-resource mutation errors as uncertain", async () => {
    const { executeManagedSiteMigration } = await import(
      "~/services/managedSites/channelMigration"
    )
    const mutationError = new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.MutationStateUncertain,
    })
    const create = vi.fn(async () => {
      throw mutationError
    })
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) => {
      if (siteType === SITE_TYPES.NEW_API) {
        return {
          source: {
            prepare: vi.fn(),
            resolveCredential: vi.fn(async () => ({
              status: "ready" as const,
              credential: "ephemeral-key",
            })),
          },
        }
      }
      if (siteType === SITE_TYPES.DONE_HUB) {
        return { target: { prepare: vi.fn(), create } }
      }
      return null
    })

    const result = await executeManagedSiteMigration({
      preview: buildCanonicalPreview([
        buildMigrationSelection("uncertain-mutation-error"),
      ]),
    })

    expect(create).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      attemptedCount: 1,
      createdCount: 0,
      failedCount: 0,
      uncertainCount: 1,
      items: [
        {
          selectionId: "uncertain-mutation-error",
          status: "uncertain",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
        },
      ],
    })
  })

  it("stops canonical Axon creation after an actual native abort and retains secret-free progress", async () => {
    const { executeManagedSiteMigration } = await import(
      "~/services/managedSites/channelMigration"
    )
    const selections = [
      buildMigrationSelection("native-aborted"),
      buildMigrationSelection("must-not-create"),
    ]
    const preview = {
      ...buildCanonicalPreview(selections),
      targetSiteType: SITE_TYPES.AXON_HUB,
    }
    const resolveCredential = vi.fn(async () => ({
      status: "ready" as const,
      credential: "execution-key",
    }))
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.NEW_API
        ? {
            source: {
              prepare: vi.fn(),
              resolveCredential,
            },
          }
        : siteType === SITE_TYPES.AXON_HUB
          ? { target: axonHubManagedSiteMigrationCapability.target }
          : null,
    )
    const nativeAbort = new axonHubNativeResources.AxonHubNativeError({
      code: "aborted",
      dispatch: "before",
    })
    const openSpy = vi
      .spyOn(axonHubNativeResources, "openAxonHubNativeResourceOperations")
      .mockRejectedValue(nativeAbort)

    try {
      const error = await captureMigrationExecutionAbort(
        executeManagedSiteMigration({ preview }),
      )

      expect(error.cause).toMatchObject({ name: "AbortError" })
      expect((error.cause as Error).cause).toBe(nativeAbort)
      expect(error.details.partialResult).toEqual({
        totalSelected: 2,
        attemptedCount: 1,
        createdCount: 0,
        failedCount: 0,
        skippedCount: 0,
        uncertainCount: 0,
        items: [],
      })
      expect(error.details.remainingSelections).toEqual(selections)
      expect(resolveCredential).toHaveBeenCalledOnce()
      expect(openSpy).toHaveBeenCalledOnce()
      expectMigrationAbortInvariants(error)
    } finally {
      openSpy.mockRestore()
    }
  })

  it("keeps canonical preview and result objects free of credentials and commands", async () => {
    const { executeManagedSiteMigration, prepareManagedSiteMigrationPreview } =
      await import("~/services/managedSites/channelMigration")
    const source = buildAxonMigrationSource()
    const secret = "execution-secret-placeholder"
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB
        ? {
            source: {
              prepare: vi.fn(async () => ({
                status: "ready" as const,
                source,
              })),
              resolveCredential: vi.fn(async () => ({
                status: "ready" as const,
                credential: secret,
              })),
            },
            target: {
              prepare: vi.fn(async () => buildAxonTargetPreparation(source)),
              create: vi.fn(async () => ({ status: "created" as const })),
            },
          }
        : null,
    )
    const selection = {
      ...buildMigrationSelection("safe"),
      ref: {
        ...buildMigrationSelection("safe").ref,
        siteType: SITE_TYPES.AXON_HUB,
      },
    }

    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.AXON_HUB,
      selections: [selection],
    })
    const result = await executeManagedSiteMigration({ preview })

    expect(JSON.stringify(preview)).not.toContain(secret)
    expect(JSON.stringify(preview)).not.toContain("credential")
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(JSON.stringify(result)).not.toContain("command")
  })

  it("returns the existing create-only no-dedupe and no-rollback general warnings", async () => {
    const { prepareManagedSiteMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const source = buildAxonMigrationSource()
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB
        ? {
            source: {
              prepare: vi.fn(async () => ({
                status: "ready" as const,
                source,
              })),
              resolveCredential: vi.fn(),
            },
            target: {
              prepare: vi.fn(async () => buildAxonTargetPreparation(source)),
              create: vi.fn(),
            },
          }
        : null,
    )

    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.AXON_HUB,
      selections: [
        {
          ...buildMigrationSelection("warnings"),
          ref: {
            ...buildMigrationSelection("warnings").ref,
            siteType: SITE_TYPES.AXON_HUB,
          },
        },
      ],
    })

    expect(preview.generalWarningCodes).toEqual([
      MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.CREATE_ONLY,
      MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.NO_DEDUPE_OR_SYNC,
      MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.NO_ROLLBACK,
    ])
  })
})
