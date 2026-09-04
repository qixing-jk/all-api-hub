import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  type ClaudeCodeHubProviderType,
} from "~/constants/claudeCodeHub"
import { ChannelType } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import * as claudeCodeHubNativeResources from "~/services/apiAdapters/managedResources/claudeCodeHub"
import { claudeCodeHubManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/claudeCodeHubMigration"
import { resolveManagedSiteMigrationCapability } from "~/services/managedSites/channelMigrationCapabilityRegistry"
import {
  MANAGED_SITE_MUTATION_COMPLETIONS,
  MANAGED_SITE_MUTATION_EFFECT_KINDS,
  MANAGED_SITE_MUTATION_OUTCOMES,
} from "~/services/managedSites/mutations"
import type { ClaudeCodeHubProviderDisplay } from "~/types/claudeCodeHub"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES } from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES,
  type ManagedSiteMigrationExecutionCommand,
  type ManagedSiteMigrationSelection,
  type ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"

const selection: ManagedSiteMigrationSelection = {
  selectionId: "23",
  displayName: "Primary provider",
  ref: {
    siteType: SITE_TYPES.CLAUDE_CODE_HUB,
    kind: MANAGED_RESOURCE_KINDS.Channel,
    scopeKey: "https://hub.example.invalid",
    resourceId: "23",
  },
}

const provider: ClaudeCodeHubProviderDisplay = {
  id: 23,
  name: "Primary provider",
  url: "https://upstream.example.invalid",
  maskedKey: "sk-****",
  isEnabled: true,
  weight: 7,
  priority: 2,
  groupTag: "team",
  providerType: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
  allowedModels: [
    { matchType: "exact", pattern: "claude-example" },
    { matchType: "prefix", pattern: "claude-" },
  ],
  modelRedirects: [{ from: "legacy", to: "claude-example" }],
  proxyUrl: "https://proxy.example.invalid",
  costMultiplier: 1,
}

const buildOperations = (overrides: Record<string, unknown> = {}) => ({
  scopeKey: "https://hub.example.invalid",
  get: vi.fn(async () => provider),
  loadSecret: vi.fn(async () => "credential-placeholder"),
  create: vi.fn(async () => ({
    outcome: MANAGED_SITE_MUTATION_OUTCOMES.Succeeded,
    data: provider,
    confirmedEffects: [
      {
        kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
        resourceKind: MANAGED_RESOURCE_KINDS.Channel,
      },
    ],
  })),
  ...overrides,
})

const buildSource = (
  resourceType: ChannelType = ChannelType.Anthropic,
): ManagedSiteMigrationSource => ({
  sourceSiteType: SITE_TYPES.NEW_API,
  resourceType,
  baseUrl: "https://target.example.invalid",
  models: ["model-example"],
  groups: ["team", "secondary"],
  priority: -2,
  weight: 150,
  status: "other",
  lossSignals: {
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    hasAdvancedSettings: false,
    hasMultiKeyState: false,
  },
})

const buildCreateCommand = (
  projectionOverrides: Partial<
    ManagedSiteMigrationExecutionCommand["projection"]
  > = {},
): ManagedSiteMigrationExecutionCommand => ({
  source: buildSource(),
  targetSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
  projection: {
    name: "Migrated provider",
    type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
    baseUrl: "https://target.example.invalid",
    models: ["model-example"],
    groups: ["team"],
    priority: 0,
    weight: 100,
    status: 1,
    ...projectionOverrides,
  },
  credential: "credential-placeholder",
})

describe("Claude Code Hub native migration capability", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("is registered as both a canonical source and target", () => {
    expect(
      resolveManagedSiteMigrationCapability(SITE_TYPES.CLAUDE_CODE_HUB),
    ).toBe(claudeCodeHubManagedSiteMigrationCapability)
    expect(claudeCodeHubManagedSiteMigrationCapability.source).toBeDefined()
    expect(claudeCodeHubManagedSiteMigrationCapability.target).toBeDefined()
  })

  it("validates refs against the configured scope without fetching rows", async () => {
    const operations = buildOperations()
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    const context =
      await claudeCodeHubManagedSiteMigrationCapability.source!
        .createSelectionValidationContext!()

    expect(context.isValid(selection)).toBe(true)
    expect(
      context.isValid({
        ...selection,
        ref: { ...selection.ref, scopeKey: "https://other.example.invalid" },
      }),
    ).toBe(false)
    expect(operations.get).not.toHaveBeenCalled()
  })

  it("projects provider data without secrets and discloses lossy native settings", async () => {
    const operations = buildOperations()
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    const preparation =
      await claudeCodeHubManagedSiteMigrationCapability.source!.prepare(
        selection,
      )

    expect(preparation).toEqual({
      status: "ready",
      source: {
        sourceSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
        resourceType: ChannelType.Anthropic,
        baseUrl: "https://upstream.example.invalid",
        models: ["claude-example"],
        groups: ["team"],
        priority: 2,
        weight: 7,
        status: "enabled",
        lossSignals: {
          hasModelMapping: true,
          hasStatusCodeMapping: false,
          hasAdvancedSettings: true,
          hasMultiKeyState: false,
        },
      },
    })
    expect(operations.loadSecret).not.toHaveBeenCalled()
    expect(JSON.stringify(preparation)).not.toContain("credential-placeholder")
    expect(JSON.stringify(preparation)).not.toContain("sk-****")
  })

  it("does not flag Claude Code Hub's native advanced defaults as lossy", async () => {
    const operations = buildOperations({
      get: vi.fn(async () => ({
        ...provider,
        allowedModels: [{ matchType: "exact", pattern: "claude-example" }],
        modelRedirects: undefined,
        proxyUrl: undefined,
        costMultiplier: 1,
        mcpPassthroughType: "none",
        proxyFallbackToDirect: false,
        limit5hResetMode: "rolling",
        dailyResetMode: "fixed",
        dailyResetTime: "00:00",
        customHeaders: {},
      })),
    })
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    const preparation =
      await claudeCodeHubManagedSiteMigrationCapability.source!.prepare(
        selection,
      )

    expect(preparation).toMatchObject({
      status: "ready",
      source: {
        lossSignals: { hasAdvancedSettings: false },
      },
    })
  })

  it.each([
    ["mcpPassthroughType", "minimax"],
    ["proxyFallbackToDirect", true],
    ["limit5hResetMode", "fixed"],
    ["dailyResetMode", "rolling"],
    ["dailyResetTime", "12:00"],
    ["providerVendorId", "vendor-example"],
    ["limit5hUsd", 1],
    ["preserveClientIp", true],
    ["customHeaders", { "x-example": "value" }],
  ])(
    "discloses non-default %s configuration as lossy",
    async (field, value) => {
      const operations = buildOperations({
        get: vi.fn(async () => ({
          ...provider,
          allowedModels: [{ matchType: "exact", pattern: "claude-example" }],
          modelRedirects: undefined,
          proxyUrl: undefined,
          costMultiplier: 1,
          mcpPassthroughType: "none",
          proxyFallbackToDirect: false,
          limit5hResetMode: "rolling",
          dailyResetMode: "fixed",
          dailyResetTime: "00:00",
          [field]: value,
        })),
      })
      vi.spyOn(
        claudeCodeHubNativeResources,
        "openClaudeCodeHubNativeResourceOperations",
      ).mockResolvedValue(operations as never)

      const preparation =
        await claudeCodeHubManagedSiteMigrationCapability.source!.prepare(
          selection,
        )

      expect(preparation).toMatchObject({
        status: "ready",
        source: {
          lossSignals: { hasAdvancedSettings: true },
        },
      })
    },
  )

  it("blocks an invalid source ref before provider access", async () => {
    const operations = buildOperations()
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)
    const invalidSelection = {
      ...selection,
      ref: { ...selection.ref, resourceId: "0" },
    }

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.source!.prepare(
        invalidSelection,
      ),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
    await expect(
      claudeCodeHubManagedSiteMigrationCapability.source!.resolveCredential(
        invalidSelection,
      ),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
    expect(operations.get).not.toHaveBeenCalled()
    expect(operations.loadSecret).not.toHaveBeenCalled()
  })

  it("defaults a provider without a native type to OpenAI compatibility", async () => {
    const operations = buildOperations({
      get: vi.fn(async () => ({
        ...provider,
        providerType: undefined,
      })),
    })
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.source!.prepare(selection),
    ).resolves.toMatchObject({
      status: "ready",
      source: { resourceType: ChannelType.OpenAI },
    })
  })

  it("propagates an aborted source lookup", async () => {
    const operations = buildOperations({
      get: vi.fn(async () => {
        throw new claudeCodeHubNativeResources.ClaudeCodeHubNativeError({
          code: MANAGED_RESOURCE_FAILURE_CODES.Aborted,
        })
      }),
    })
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.source!.prepare(selection),
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("blocks unknown provider types before credential resolution", async () => {
    const operations = buildOperations({
      get: vi.fn(async () => ({
        ...provider,
        providerType: "future-provider" as ClaudeCodeHubProviderType,
      })),
    })
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.source!.prepare(selection),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED,
    })
    expect(operations.loadSecret).not.toHaveBeenCalled()
  })

  it("resolves the credential only during execution", async () => {
    const operations = buildOperations()
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      ),
    ).resolves.toEqual({
      status: "ready",
      credential: "credential-placeholder",
    })
    expect(operations.loadSecret).toHaveBeenCalledWith(23, undefined)
  })

  it("blocks a source whose resolved credential is empty", async () => {
    const operations = buildOperations({
      loadSecret: vi.fn(async () => "   "),
    })
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      ),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_MISSING,
    })
  })

  it("blocks credential resolution when the native request fails", async () => {
    const operations = buildOperations({
      loadSecret: vi.fn(async () => {
        throw new Error("credential lookup failed")
      }),
    })
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      ),
    ).resolves.toEqual({
      status: "blocked",
      reasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
    })
  })

  it("propagates a native abort during credential resolution", async () => {
    const operations = buildOperations({
      loadSecret: vi.fn(async () => {
        throw new claudeCodeHubNativeResources.ClaudeCodeHubNativeError({
          code: MANAGED_RESOURCE_FAILURE_CODES.Aborted,
        })
      }),
    })
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it("propagates the original failure when credential resolution is cancelled", async () => {
    const controller = new AbortController()
    const failure = new Error("cancelled credential request")
    controller.abort()
    const operations = buildOperations({
      loadSecret: vi.fn(
        async (_providerId, options?: { signal?: AbortSignal }) => {
          if (options?.signal?.aborted) throw failure
          throw new Error("expected an aborted signal")
        },
      ),
    })
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.source!.resolveCredential(
        selection,
        { signal: controller.signal },
      ),
    ).rejects.toBe(failure)
  })

  it("normalizes the target projection and creates through native operations", async () => {
    const operations = buildOperations()
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)
    const source = buildSource()
    const preparation =
      await claudeCodeHubManagedSiteMigrationCapability.target!.prepare(source)
    const command: ManagedSiteMigrationExecutionCommand = {
      source,
      targetSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      projection: { ...preparation.projection, name: "Migrated provider" },
      credential: "credential-placeholder",
    }

    expect(preparation).toEqual({
      projection: {
        name: "",
        type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
        baseUrl: "https://target.example.invalid",
        models: ["model-example"],
        groups: ["team"],
        priority: 0,
        weight: 100,
        status: 2,
      },
      adjustments: {
        remappedType: false,
        normalizedBaseUrl: false,
        forcedDefaultGroup: true,
        ignoredPriority: true,
        ignoredWeight: true,
        simplifiedStatus: true,
      },
    })
    await expect(
      claudeCodeHubManagedSiteMigrationCapability.target!.create(command),
    ).resolves.toEqual({ status: "created" })
    expect(operations.create).toHaveBeenCalledWith(
      {
        name: "Migrated provider",
        url: "https://target.example.invalid",
        key: "credential-placeholder",
        provider_type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
        allowed_models: [{ matchType: "exact", pattern: "model-example" }],
        group_tag: "team",
        priority: 0,
        weight: 100,
        is_enabled: false,
      },
      undefined,
    )

    const remappedPreparation =
      await claudeCodeHubManagedSiteMigrationCapability.target!.prepare(
        buildSource(ChannelType.Azure),
      )
    expect(remappedPreparation).toMatchObject({
      projection: {
        type: CLAUDE_CODE_HUB_PROVIDER_TYPE.OPENAI_COMPATIBLE,
      },
      adjustments: {
        remappedType: true,
      },
    })
  })

  it("uses the default group when the source has no usable group", async () => {
    const operations = buildOperations()
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)
    const preparation =
      await claudeCodeHubManagedSiteMigrationCapability.target!.prepare({
        ...buildSource(),
        groups: ["   "],
      })

    expect(preparation).toMatchObject({
      projection: { groups: ["default"] },
      adjustments: { forcedDefaultGroup: true },
    })
    await expect(
      claudeCodeHubManagedSiteMigrationCapability.target!.create(
        buildCreateCommand({ groups: [] }),
      ),
    ).resolves.toEqual({ status: "created" })
    expect(operations.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ group_tag: "default" }),
      undefined,
    )
  })

  it("rejects an unsupported target provider type before opening native operations", async () => {
    const openOperations = vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    )

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.target!.create(
        buildCreateCommand({ type: "future-provider" }),
      ),
    ).resolves.toEqual({
      status: "failed",
      failureCode:
        MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
    })
    expect(openOperations).not.toHaveBeenCalled()
  })

  it.each([
    [
      MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
      {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Rejected,
        diagnostic: { message: "provider rejected" },
      },
      {
        status: "failed",
        failureCode:
          MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
      },
    ],
    [
      MANAGED_SITE_MUTATION_OUTCOMES.Partial,
      {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Partial,
        confirmedEffects: [
          {
            kind: MANAGED_SITE_MUTATION_EFFECT_KINDS.ResourceCreated,
            resourceKind: MANAGED_RESOURCE_KINDS.Channel,
          },
        ],
        completion: MANAGED_SITE_MUTATION_COMPLETIONS.Uncertain,
        diagnostic: { message: "completion unknown" },
      },
      { status: "uncertain" },
    ],
    [
      MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
      {
        outcome: MANAGED_SITE_MUTATION_OUTCOMES.Uncertain,
        diagnostic: { message: "completion unknown" },
      },
      { status: "uncertain" },
    ],
  ])("maps a native %s create outcome", async (_outcome, result, expected) => {
    const operations = buildOperations({
      create: vi.fn(async () => result),
    })
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.target!.create(
        buildCreateCommand(),
      ),
    ).resolves.toEqual(expected)
  })

  it("propagates an aborted target create", async () => {
    const operations = buildOperations({
      create: vi.fn(async () => {
        throw new claudeCodeHubNativeResources.ClaudeCodeHubNativeError({
          code: MANAGED_RESOURCE_FAILURE_CODES.Aborted,
        })
      }),
    })
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.target!.create(
        buildCreateCommand(),
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
  })

  it.each([
    [
      "validation failure",
      new claudeCodeHubNativeResources.ClaudeCodeHubNativeError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
      }),
      MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
    ],
    [
      "unexpected native failure",
      new claudeCodeHubNativeResources.ClaudeCodeHubNativeError({
        code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected,
      }),
      MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.Unexpected,
    ],
    [
      "untyped failure",
      new Error("unexpected create failure"),
      MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.Unexpected,
    ],
  ])("maps a %s during target creation", async (_name, error, failureCode) => {
    const operations = buildOperations({
      create: vi.fn(async () => {
        throw error
      }),
    })
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockResolvedValue(operations as never)

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.target!.create(
        buildCreateCommand(),
      ),
    ).resolves.toEqual({ status: "failed", failureCode })
  })

  it("classifies a missing target configuration as unavailable", async () => {
    vi.spyOn(
      claudeCodeHubNativeResources,
      "openClaudeCodeHubNativeResourceOperations",
    ).mockRejectedValue(
      new ManagedResourceError({
        code: MANAGED_RESOURCE_FAILURE_CODES.ConfigurationRequired,
      }),
    )
    const source = buildSource()
    const preparation =
      await claudeCodeHubManagedSiteMigrationCapability.target!.prepare(source)

    await expect(
      claudeCodeHubManagedSiteMigrationCapability.target!.create({
        source,
        targetSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
        projection: {
          ...preparation.projection,
          name: "Migrated provider",
        },
        credential: "credential-placeholder",
      }),
    ).resolves.toEqual({
      status: "failed",
      failureCode:
        MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetUnavailable,
    })
  })
})
