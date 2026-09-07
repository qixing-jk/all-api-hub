import { beforeEach, describe, expect, it, vi } from "vitest"

import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { ChannelType } from "~/constants/newApi"
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
  MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES,
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

const mockGetManagedSiteCapabilitiesForType = vi.fn()
const mockDoneHubBuildChannelPayload = vi.fn()
const mockDoneHubCreateChannel = vi.fn()
const mockDoneHubFetchChannelSecretKey = vi.fn()
const mockDoneHubGetConfig = vi.fn()
const mockDoneHubListChannels = vi.fn()
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

vi.mock("~/services/apiAdapters/registry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiAdapters/registry")>()),
  getManagedSiteCapabilities: mockGetManagedSiteCapabilitiesForType,
}))

vi.mock("~/services/managedSites/channelMigrationCapabilityRegistry", () => ({
  resolveManagedSiteMigrationCapability:
    mockResolveManagedSiteMigrationCapability,
}))

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
      outcome: "succeeded",
      data: null,
      confirmedEffects: [
        { kind: "resource-created", resourceKind: "channel", resourceId: 1 },
      ],
      message: "ok",
    })
    mockDoneHubListChannels.mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
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
      outcome: "succeeded",
      data: null,
      confirmedEffects: [
        { kind: "resource-created", resourceKind: "channel", resourceId: 1 },
      ],
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
      outcome: "succeeded",
      data: null,
      confirmedEffects: [
        { kind: "resource-created", resourceKind: "channel", resourceId: 1 },
      ],
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
    mockGetManagedSiteCapabilitiesForType.mockImplementation(
      (siteType: string) => {
        if (siteType === SITE_TYPES.DONE_HUB) {
          return {
            buildChannelPayload: mockDoneHubBuildChannelPayload,
            createChannel: mockDoneHubCreateChannel,
            listChannels: mockDoneHubListChannels,
            config: { get: mockDoneHubGetConfig },
            matching: { fetchSecretKey: mockDoneHubFetchChannelSecretKey },
          }
        }

        if (siteType === SITE_TYPES.VELOERA) {
          return {
            buildChannelPayload: vi.fn((draft: any) => ({
              mode: "single",
              channel: {
                name: draft.name,
                key: draft.key,
              },
            })),
            createChannel: vi.fn().mockResolvedValue({
              outcome: "succeeded",
              data: null,
              confirmedEffects: [
                {
                  kind: "resource-created",
                  resourceKind: "channel",
                  resourceId: 1,
                },
              ],
              message: "ok",
            }),
            listChannels: vi.fn().mockResolvedValue({
              items: [],
              total: 0,
              type_counts: {},
            }),
            config: { get: mockVeloeraGetConfig },
            matching: { fetchSecretKey: mockVeloeraFetchChannelSecretKey },
          }
        }

        if (siteType === SITE_TYPES.AXON_HUB) {
          return {
            buildChannelPayload: mockAxonHubBuildChannelPayload,
            createChannel: mockAxonHubCreateChannel,
            listChannels: vi.fn().mockResolvedValue({
              items: [],
              total: 0,
              type_counts: {},
            }),
            config: { get: mockAxonHubGetConfig },
          }
        }

        if (siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
          return {
            buildChannelPayload: mockClaudeCodeHubBuildChannelPayload,
            createChannel: mockClaudeCodeHubCreateChannel,
            listChannels: vi.fn().mockResolvedValue({
              items: [],
              total: 0,
              type_counts: {},
            }),
            config: { get: mockClaudeCodeHubGetConfig },
          }
        }

        return {
          buildChannelPayload: vi.fn((draft: any) => ({
            mode: "single",
            channel: {
              name: draft.name,
              key: draft.key,
            },
          })),
          createChannel: vi.fn().mockResolvedValue({
            outcome: "succeeded",
            data: null,
            confirmedEffects: [
              {
                kind: "resource-created",
                resourceKind: "channel",
                resourceId: 1,
              },
            ],
            message: "ok",
          }),
          listChannels: vi.fn().mockResolvedValue({
            items: [],
            total: 0,
            type_counts: {},
          }),
          config: {
            get: vi.fn().mockResolvedValue({
              baseUrl: "https://target.example.com",
              adminToken: "target-token",
              userId: "1",
            }),
          },
        }
      },
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

  it("blocks the complete untrusted ref matrix in order before capability access", async () => {
    const { prepareManagedSiteMigrationPreview } = await import(
      "~/services/managedSites/channelMigration"
    )
    const prepare = vi.fn()
    const resolveCredential = vi.fn()
    const create = vi.fn()
    mockResolveManagedSiteMigrationCapability.mockReturnValue({
      source: { prepare, resolveCredential },
      target: { prepare: vi.fn(), create },
    })
    const validRef = buildMigrationSelection("valid").ref
    const invalidRefs: readonly unknown[] = [
      null,
      "not-an-object",
      { ...validRef, siteType: SITE_TYPES.DONE_HUB },
      { ...validRef, kind: "model" },
      { ...validRef, scopeKey: "" },
      { ...validRef, scopeKey: "s".repeat(2049) },
      { ...validRef, resourceId: "" },
      { ...validRef, resourceId: "r".repeat(513) },
      { ...validRef, scopeKey: 7 },
      { ...validRef, resourceId: 7 },
    ]
    const selections = invalidRefs.map((ref, index) => ({
      selectionId: `invalid-${index}`,
      displayName: `Invalid ${index}`,
      ref,
    })) as unknown as ManagedSiteMigrationSelection[]

    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.AXON_HUB,
      selections,
    })

    expect(
      preview.items.map(({ selection, status }) => [
        selection.selectionId,
        status,
      ]),
    ).toEqual(selections.map(({ selectionId }) => [selectionId, "blocked"]))
    expect(preview).toMatchObject({
      totalCount: invalidRefs.length,
      readyCount: 0,
      blockedCount: invalidRefs.length,
    })
    expect(mockResolveManagedSiteMigrationCapability).not.toHaveBeenCalled()
    expect(prepare).not.toHaveBeenCalled()
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it("blocks an unregistered target during preview and never resolves credentials at execution", async () => {
    const { prepareManagedSiteMigrationPreview, executeManagedSiteMigration } =
      await import("~/services/managedSites/channelMigration")
    const resolveCredential = vi.fn()
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.NEW_API
        ? {
            source: {
              prepare: vi.fn(async () => ({
                status: "ready" as const,
                source: buildAxonMigrationSource(),
              })),
              resolveCredential,
            },
          }
        : null,
    )
    const selections = [buildMigrationSelection("unregistered-target")]
    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.SUB2API,
      selections,
    })
    expect(preview).toMatchObject({
      readyCount: 0,
      blockedCount: 1,
      items: [
        {
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.TARGET_DRAFT_PREPARATION_FAILED,
        },
      ],
    })
    const result = await executeManagedSiteMigration({
      preview: {
        ...buildCanonicalPreview(selections),
        targetSiteType: SITE_TYPES.SUB2API,
      },
    })
    expect(result).toMatchObject({
      attemptedCount: 0,
      failedCount: 1,
      items: [{ failureCode: "target_unavailable" }],
    })
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(mockDoneHubCreateChannel).not.toHaveBeenCalled()
  })

  it("fails closed when a ready canonical preview loses its source capability", async () => {
    const { executeManagedSiteMigration } = await import(
      "~/services/managedSites/channelMigration"
    )

    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.DONE_HUB
        ? { target: { prepare: vi.fn(), create: vi.fn() } }
        : null,
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

  it.each([
    ["primitive", "caller-cancelled"],
    ["ordinary Error", new Error("Caller cancelled during create")],
  ])(
    "structures in-flight caller cancellation with a %s reason and does not replay the attempted row",
    async (_label, cancellationReason) => {
      const selections = [
        buildMigrationSelection("created"),
        buildMigrationSelection("cancelled-during-create"),
        buildMigrationSelection("remaining"),
      ]
      const controller = new AbortController()
      const create = vi
        .fn()
        .mockResolvedValueOnce({ status: "created" as const })
        .mockImplementationOnce(async () => {
          controller.abort(cancellationReason)
          throw cancellationReason
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
        }),
      )

      expect(error.cause).toBe(cancellationReason)
      expect(error.details.partialResult).toEqual({
        totalSelected: 3,
        attemptedCount: 2,
        createdCount: 1,
        failedCount: 0,
        skippedCount: 0,
        uncertainCount: 1,
        items: [
          {
            selectionId: "created",
            displayName: "Selection created",
            status: "created",
          },
          {
            selectionId: "cancelled-during-create",
            displayName: "Selection cancelled-during-create",
            status: "uncertain",
            failureCode:
              MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
          },
        ],
      })
      expect(error.details.remainingSelections).toEqual([selections[2]])
      expect(create).toHaveBeenCalledTimes(2)
      expectMigrationAbortInvariants(error)
    },
  )

  it("propagates an unexpected create failure unchanged and stops later rows", async () => {
    const selections = [
      buildMigrationSelection("failing"),
      buildMigrationSelection("not-attempted"),
    ]
    const thrown = new Error("create invariant failed")
    const create = vi.fn(async () => {
      throw thrown
    })

    await expect(
      executeManagedSiteMigrationCore({
        preview: buildCanonicalPreview(selections),
        targetAvailable: true,
        sourceFailureReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        resolveCredential: async () => ({
          status: "ready",
          credential: "execution-key",
        }),
        create,
      }),
    ).rejects.toBe(thrown)

    expect(create).toHaveBeenCalledOnce()
  })

  it("preserves completed progress when a later create throws structured cancellation", async () => {
    const selections = [
      buildMigrationSelection("created"),
      buildMigrationSelection("create-aborted"),
      buildMigrationSelection("remaining"),
    ]
    const abortError = new DOMException("Create cancelled", "AbortError")
    const create = vi
      .fn()
      .mockResolvedValueOnce({ status: "created" as const })
      .mockRejectedValueOnce(abortError)

    const error = await captureMigrationExecutionAbort(
      executeManagedSiteMigrationCore({
        preview: buildCanonicalPreview(selections),
        targetAvailable: true,
        sourceFailureReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        resolveCredential: async () => ({
          status: "ready",
          credential: "execution-key",
        }),
        create,
      }),
    )

    expect(error.cause).toBe(abortError)
    expect(error.details).toEqual({
      partialResult: {
        totalSelected: 3,
        attemptedCount: 2,
        createdCount: 1,
        failedCount: 0,
        skippedCount: 0,
        uncertainCount: 1,
        items: [
          {
            selectionId: "created",
            displayName: "Selection created",
            status: "created",
          },
          {
            selectionId: "create-aborted",
            displayName: "Selection create-aborted",
            status: "uncertain",
            failureCode:
              MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
          },
        ],
      },
      remainingSelections: selections.slice(2),
    })
    expect(create).toHaveBeenCalledTimes(2)
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

  it("accounts for every returned canonical execution outcome and continues", async () => {
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
        if (selectionId === "thrown") {
          return {
            status: "failed",
            failureCode:
              MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.Unexpected,
          }
        }
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
    const selections = [
      buildMigrationSelection("target-unavailable-first"),
      buildMigrationSelection("target-unavailable-second"),
    ]
    const resolveCredential = vi.fn()
    const create = vi.fn()

    const result = await executeManagedSiteMigrationCore({
      preview: buildCanonicalPreview(selections),
      targetAvailable: false,
      sourceFailureReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      resolveCredential,
      create,
    })

    expect(result).toMatchObject({
      totalSelected: 2,
      attemptedCount: 0,
      createdCount: 0,
      failedCount: 2,
      skippedCount: 0,
      uncertainCount: 0,
      items: [
        {
          selectionId: "target-unavailable-first",
          status: "failed",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetUnavailable,
        },
        {
          selectionId: "target-unavailable-second",
          status: "failed",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetUnavailable,
        },
      ],
    })
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it("blocks unsupported AxonHub targets and executes ready rows in selection order", async () => {
    const { executeManagedSiteMigration, prepareManagedSiteMigrationPreview } =
      await import("~/services/managedSites/channelMigration")
    const selections = [
      buildMigrationSelection("unsupported-target"),
      buildMigrationSelection("ready-target"),
    ]
    const resolveCredential = vi.fn(async () => ({
      status: "ready" as const,
      credential: "execution-credential-placeholder",
    }))
    const create = vi.fn(async () => ({ status: "created" as const }))
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) => {
      if (siteType === SITE_TYPES.NEW_API) {
        return {
          source: {
            prepare: vi.fn(async (selection) => ({
              status: "ready" as const,
              source: buildMigrationSource({
                resourceType:
                  selection.selectionId === "unsupported-target"
                    ? ChannelType.Midjourney
                    : ChannelType.OpenAI,
              }),
            })),
            resolveCredential,
          },
        }
      }
      if (siteType === SITE_TYPES.AXON_HUB) {
        return {
          target: {
            prepare: axonHubManagedSiteMigrationCapability.target!.prepare,
            create,
          },
        }
      }
      return null
    })

    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.AXON_HUB,
      selections,
    })

    expect(preview.items.map((item) => item.status)).toEqual([
      "blocked",
      "ready",
    ])
    expect(preview.items[0]).toMatchObject({
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.TARGET_DRAFT_PREPARATION_FAILED,
    })

    const result = await executeManagedSiteMigration({ preview })

    expect(result).toEqual({
      totalSelected: 2,
      attemptedCount: 1,
      createdCount: 1,
      failedCount: 0,
      skippedCount: 1,
      uncertainCount: 0,
      items: [
        {
          selectionId: "unsupported-target",
          displayName: "Selection unsupported-target",
          status: "skipped",
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.TARGET_DRAFT_PREPARATION_FAILED,
        },
        {
          selectionId: "ready-target",
          displayName: "Selection ready-target",
          status: "created",
        },
      ],
    })
    expect(resolveCredential).toHaveBeenCalledOnce()
    expect(resolveCredential).toHaveBeenCalledWith(selections[1], undefined)
    expect(create).toHaveBeenCalledOnce()
  })

  it("uses a caller credential resolver for interactive native verification", async () => {
    const { executeManagedSiteMigration } = await import(
      "~/services/managedSites/channelMigration"
    )
    const selection = buildMigrationSelection("interactive-secret")
    const registeredResolver = vi.fn(async () => ({
      status: "ready" as const,
      credential: "registered-credential-placeholder",
    }))
    const interactiveResolver = vi.fn(async () => ({
      status: "ready" as const,
      credential: "interactive-credential-placeholder",
    }))
    const create = vi.fn(async () => ({ status: "created" as const }))
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) => {
      if (siteType === SITE_TYPES.NEW_API) {
        return {
          source: {
            prepare: vi.fn(),
            resolveCredential: registeredResolver,
          },
        }
      }
      if (siteType === SITE_TYPES.DONE_HUB) {
        return {
          target: {
            prepare: vi.fn(),
            create,
          },
        }
      }
      return null
    })
    const options = { signal: new AbortController().signal }

    const result = await executeManagedSiteMigration({
      preview: buildCanonicalPreview([selection]),
      options,
      resolveSourceCredential: interactiveResolver,
    })

    expect(result.createdCount).toBe(1)
    expect(interactiveResolver).toHaveBeenCalledWith(selection, options)
    expect(registeredResolver).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: "interactive-credential-placeholder",
      }),
      options,
    )
  })

  it("keeps an unsupported AxonHub source row blocked through mixed canonical execution", async () => {
    const { executeManagedSiteMigration, prepareManagedSiteMigrationPreview } =
      await import("~/services/managedSites/channelMigration")
    const selections = [
      {
        ...buildMigrationSelection("opaque-unsupported-source"),
        ref: {
          ...buildMigrationSelection("opaque-unsupported-source").ref,
          siteType: SITE_TYPES.AXON_HUB,
        },
      },
      {
        ...buildMigrationSelection("opaque-ready-source"),
        ref: {
          ...buildMigrationSelection("opaque-ready-source").ref,
          siteType: SITE_TYPES.AXON_HUB,
        },
      },
    ]
    const prepareSource = vi.fn(async (selection) =>
      selection.selectionId === "opaque-unsupported-source"
        ? {
            status: "blocked" as const,
            reasonCode:
              MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED,
          }
        : {
            status: "ready" as const,
            source: buildMigrationSource({
              sourceSiteType: SITE_TYPES.AXON_HUB,
              resourceType: ChannelType.Anthropic,
            }),
          },
    )
    const prepareTarget = vi.fn(async () => buildMigrationTarget())
    const resolveCredential = vi.fn(async () => ({
      status: "ready" as const,
      credential: "execution-credential-placeholder",
    }))
    const create = vi.fn(async () => ({ status: "created" as const }))
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.AXON_HUB
        ? {
            source: {
              prepare: prepareSource,
              resolveCredential,
            },
            target: {
              prepare: prepareTarget,
              create,
            },
          }
        : null,
    )

    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.AXON_HUB,
      targetSiteType: SITE_TYPES.AXON_HUB,
      selections,
    })
    const result = await executeManagedSiteMigration({ preview })

    expect(preview.items.map((item) => item.status)).toEqual([
      "blocked",
      "ready",
    ])
    expect(preview.items[0]).toMatchObject({
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED,
    })
    expect(
      result.items.map(({ selectionId, status }) => [selectionId, status]),
    ).toEqual([
      ["opaque-unsupported-source", "skipped"],
      ["opaque-ready-source", "created"],
    ])
    expect(prepareTarget).toHaveBeenCalledOnce()
    expect(prepareTarget).toHaveBeenCalledWith(
      expect.objectContaining({ resourceType: ChannelType.Anthropic }),
      undefined,
    )
    expect(resolveCredential).toHaveBeenCalledOnce()
    expect(resolveCredential).toHaveBeenCalledWith(selections[1], undefined)
    expect(create).toHaveBeenCalledOnce()
  })

  it("returns ordered skipped results when every AxonHub target type is unsupported", async () => {
    const { executeManagedSiteMigration, prepareManagedSiteMigrationPreview } =
      await import("~/services/managedSites/channelMigration")
    const selections = [
      buildMigrationSelection("unsupported-first"),
      buildMigrationSelection("unsupported-second"),
    ]
    const resolveCredential = vi.fn()
    const create = vi.fn()
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) => {
      if (siteType === SITE_TYPES.NEW_API) {
        return {
          source: {
            prepare: vi.fn(async () => ({
              status: "ready" as const,
              source: buildMigrationSource({
                resourceType: ChannelType.Midjourney,
              }),
            })),
            resolveCredential,
          },
        }
      }
      if (siteType === SITE_TYPES.AXON_HUB) {
        return {
          target: {
            prepare: axonHubManagedSiteMigrationCapability.target!.prepare,
            create,
          },
        }
      }
      return null
    })

    const preview = await prepareManagedSiteMigrationPreview({
      sourceSiteType: SITE_TYPES.NEW_API,
      targetSiteType: SITE_TYPES.AXON_HUB,
      selections,
    })
    const result = await executeManagedSiteMigration({ preview })

    expect(preview).toMatchObject({ readyCount: 0, blockedCount: 2 })
    expect(result).toMatchObject({
      totalSelected: 2,
      attemptedCount: 0,
      createdCount: 0,
      failedCount: 0,
      skippedCount: 2,
      uncertainCount: 0,
    })
    expect(result.items.map((item) => item.selectionId)).toEqual([
      "unsupported-first",
      "unsupported-second",
    ])
    expect(result.items.map((item) => item.status)).toEqual([
      "skipped",
      "skipped",
    ])
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

  it("propagates managed-resource mutation errors unchanged", async () => {
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

    await expect(
      executeManagedSiteMigration({
        preview: buildCanonicalPreview([
          buildMigrationSelection("uncertain-mutation-error"),
        ]),
      }),
    ).rejects.toBe(mutationError)

    expect(create).toHaveBeenCalledOnce()
  })

  it("revalidates crafted canonical preview refs and executes only valid rows", async () => {
    const { executeManagedSiteMigration } = await import(
      "~/services/managedSites/channelMigration"
    )
    const resolveCredential = vi.fn(async () => ({
      status: "ready" as const,
      credential: "ephemeral-key",
    }))
    const create = vi.fn(async () => ({ status: "created" as const }))
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.NEW_API
        ? { source: { prepare: vi.fn(), resolveCredential } }
        : siteType === SITE_TYPES.DONE_HUB
          ? { target: { prepare: vi.fn(), create } }
          : null,
    )
    const valid = buildMigrationSelection("valid-crafted")
    const invalid = {
      ...buildMigrationSelection("invalid-crafted"),
      ref: {
        ...buildMigrationSelection("invalid-crafted").ref,
        kind: "not-a-channel",
      },
    } as unknown as ManagedSiteMigrationSelection

    const result = await executeManagedSiteMigration({
      preview: buildCanonicalPreview([invalid, valid]),
    })

    expect(result.items).toEqual([
      {
        selectionId: "invalid-crafted",
        displayName: "Selection invalid-crafted",
        status: "skipped",
        blockingReasonCode:
          MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
      },
      {
        selectionId: "valid-crafted",
        displayName: "Selection valid-crafted",
        status: "created",
      },
    ])
    expect(resolveCredential).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
  })

  it("creates one selection-validation context per execution batch and forwards cancellation", async () => {
    const { executeManagedSiteMigration } = await import(
      "~/services/managedSites/channelMigration"
    )
    const selections = [
      buildMigrationSelection("context-valid"),
      buildMigrationSelection("context-invalid"),
    ]
    const isValid = vi.fn(
      (item: ManagedSiteMigrationSelection) =>
        item.selectionId === "context-valid",
    )
    const createSelectionValidationContext = vi.fn(async () => ({ isValid }))
    const resolveCredential = vi.fn(async () => ({
      status: "ready" as const,
      credential: "ephemeral-key",
    }))
    const create = vi.fn(async () => ({ status: "created" as const }))
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.NEW_API
        ? {
            source: {
              createSelectionValidationContext,
              prepare: vi.fn(),
              resolveCredential,
            },
          }
        : siteType === SITE_TYPES.DONE_HUB
          ? { target: { prepare: vi.fn(), create } }
          : null,
    )
    const controller = new AbortController()

    const result = await executeManagedSiteMigration({
      preview: buildCanonicalPreview(selections),
      options: { signal: controller.signal },
    })

    expect(createSelectionValidationContext).toHaveBeenCalledOnce()
    expect(createSelectionValidationContext).toHaveBeenCalledWith({
      signal: controller.signal,
    })
    expect(isValid).toHaveBeenCalledTimes(2)
    expect(
      result.items.map(({ selectionId, status }) => [selectionId, status]),
    ).toEqual([
      ["context-valid", "created"],
      ["context-invalid", "skipped"],
    ])
    expect(resolveCredential).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
  })

  it("propagates selection-validation cancellation before resolving credentials or creating", async () => {
    const { executeManagedSiteMigration } = await import(
      "~/services/managedSites/channelMigration"
    )
    const abortError = Object.assign(new Error("validation cancelled"), {
      name: "AbortError",
    })
    const createSelectionValidationContext = vi.fn(async () => {
      throw abortError
    })
    const resolveCredential = vi.fn()
    const create = vi.fn()
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.NEW_API
        ? {
            source: {
              createSelectionValidationContext,
              prepare: vi.fn(),
              resolveCredential,
            },
          }
        : siteType === SITE_TYPES.DONE_HUB
          ? { target: { prepare: vi.fn(), create } }
          : null,
    )

    await expect(
      executeManagedSiteMigration({
        preview: buildCanonicalPreview([
          buildMigrationSelection("cancelled-context"),
        ]),
        options: { signal: new AbortController().signal },
      }),
    ).rejects.toBe(abortError)

    expect(resolveCredential).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it("does not resolve credentials or create for an all-invalid crafted preview", async () => {
    const { executeManagedSiteMigration } = await import(
      "~/services/managedSites/channelMigration"
    )
    const resolveCredential = vi.fn()
    const create = vi.fn()
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.NEW_API
        ? { source: { prepare: vi.fn(), resolveCredential } }
        : siteType === SITE_TYPES.DONE_HUB
          ? { target: { prepare: vi.fn(), create } }
          : null,
    )
    const invalidSelections = [
      {
        ...buildMigrationSelection("wrong-site"),
        ref: {
          ...buildMigrationSelection("wrong-site").ref,
          siteType: SITE_TYPES.AXON_HUB,
        },
      },
      {
        ...buildMigrationSelection("oversized-id"),
        ref: {
          ...buildMigrationSelection("oversized-id").ref,
          resourceId: "x".repeat(513),
        },
      },
    ] as ManagedSiteMigrationSelection[]

    const result = await executeManagedSiteMigration({
      preview: buildCanonicalPreview(invalidSelections),
    })

    expect(result).toMatchObject({
      attemptedCount: 0,
      createdCount: 0,
      skippedCount: 2,
    })
    expect(result.items.map((item) => item.selectionId)).toEqual([
      "wrong-site",
      "oversized-id",
    ])
    expect(resolveCredential).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it("preserves canonical progress for an Axon create abort", async () => {
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
    const nativeAbort = new axonHubNativeResources.AxonHubNativeError({
      code: "aborted",
      dispatch: "before",
    })
    const adapterAbort = new DOMException(
      "The operation was aborted",
      "AbortError",
    )
    Object.defineProperty(adapterAbort, "cause", {
      value: nativeAbort,
      configurable: true,
    })
    const createTarget = vi.fn(async () => {
      throw adapterAbort
    })
    mockResolveManagedSiteMigrationCapability.mockImplementation((siteType) =>
      siteType === SITE_TYPES.NEW_API
        ? {
            source: {
              prepare: vi.fn(),
              resolveCredential,
            },
          }
        : siteType === SITE_TYPES.AXON_HUB
          ? {
              target: {
                ...axonHubManagedSiteMigrationCapability.target,
                create: createTarget,
              },
            }
          : null,
    )

    const error = await captureMigrationExecutionAbort(
      executeManagedSiteMigration({ preview }),
    )

    expect(error.cause).toBe(adapterAbort)
    expect(error.details).toEqual({
      partialResult: {
        totalSelected: 2,
        attemptedCount: 1,
        createdCount: 0,
        failedCount: 0,
        skippedCount: 0,
        uncertainCount: 1,
        items: [
          {
            selectionId: "native-aborted",
            displayName: "Selection native-aborted",
            status: "uncertain",
            failureCode:
              MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
          },
        ],
      },
      remainingSelections: [selections[1]],
    })
    expect((adapterAbort as Error).cause).toBe(nativeAbort)
    expect(resolveCredential).toHaveBeenCalledOnce()
    expect(createTarget).toHaveBeenCalledOnce()
    expectMigrationAbortInvariants(error)
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
