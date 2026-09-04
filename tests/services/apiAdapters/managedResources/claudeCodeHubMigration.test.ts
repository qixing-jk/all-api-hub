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
        remappedType: true,
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
