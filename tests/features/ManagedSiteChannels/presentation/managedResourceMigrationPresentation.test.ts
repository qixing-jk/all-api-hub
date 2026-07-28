import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { ChannelType } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import {
  mapManagedResourceMigrationExecutionResult,
  mapManagedResourceMigrationPreview,
} from "~/features/ManagedSiteChannels/presentation/managedResourceMigrationPresentation"
import {
  MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES,
  MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES,
} from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES,
  type ManagedSiteMigrationCanonicalExecutionResult,
  type ManagedSiteMigrationCanonicalPreview,
  type ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"

const translations: Record<string, string> = {
  "channelDialog:fields.baseUrl.label": "Base URL",
  "channelDialog:fields.type.label": "Type",
  "channelDialog:fields.models.label": "Models",
  "channelDialog:fields.groups.label": "Groups",
  "channelDialog:fields.priority.label": "Priority",
  "channelDialog:fields.weight.label": "Weight",
  "channelDialog:fields.status.label": "Status",
  "managedSiteChannels:statusLabels.enabled": "Enabled",
  "managedSiteChannels:statusLabels.manualPause": "Disabled",
  "managedSiteChannels:statusLabels.unknown": "Unknown",
  "managedSiteChannels:editor.options.channelType.unsupported":
    "Unsupported type",
  "managedSiteChannels:migration.generalWarnings.createOnly": "Create only",
  "managedSiteChannels:migration.generalWarnings.noDedupeOrSync":
    "No dedupe or sync",
  "managedSiteChannels:migration.generalWarnings.noRollback": "No rollback",
  "managedSiteChannels:migration.itemWarnings.dropsAdvancedSettings":
    "Drops advanced settings",
  "managedSiteChannels:migration.itemWarnings.targetRemapsChannelType":
    "Target remaps type",
  "managedSiteChannels:migration.itemWarnings.targetIgnoresPriority":
    "Target ignores priority",
  "managedSiteChannels:migration.blockedReasons.sourceKeyMissing":
    "Source credential unavailable",
  "managedSiteChannels:migration.blockedReasons.sourceKeyResolutionFailed":
    "Source access could not be verified",
  "managedSiteChannels:migration.blockedReasons.sourceTypeUnsupported":
    "Source type unsupported",
  "managedSiteChannels:migration.blockedReasons.targetDraftPreparationFailed":
    "Target preparation failed",
  "managedSiteChannels:migration.results.status.success": "Created",
  "managedSiteChannels:migration.results.status.failed": "Failed",
  "managedSiteChannels:migration.results.status.skipped": "Skipped",
  "managedSiteChannels:migration.results.status.uncertain": "Uncertain",
  "managedSiteChannels:migration.results.refreshRequired":
    "Verify the target and refresh before continuing.",
}

const t = ((key: string | string[], options?: Record<string, unknown>) => {
  const normalizedKey = Array.isArray(key) ? key[0] : key
  if (normalizedKey === "managedSiteChannels:migration.results.summary") {
    return `${options?.created}/${options?.failed}/${options?.skipped}/${options?.uncertain}/${options?.total}`
  }
  return translations[normalizedKey] ?? `missing:${normalizedKey}`
}) as TFunction

const buildSource = (
  overrides: Partial<ManagedSiteMigrationSource> = {},
): ManagedSiteMigrationSource => ({
  sourceSiteType: SITE_TYPES.AXON_HUB,
  resourceType: ChannelType.Anthropic,
  baseUrl: "https://source.example.invalid/v1",
  models: ["model-b", "model-a"],
  groups: ["source-group"],
  priority: 7,
  weight: 13,
  status: "enabled",
  lossSignals: {
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    hasAdvancedSettings: true,
    hasMultiKeyState: false,
  },
  ...overrides,
})

const preview: ManagedSiteMigrationCanonicalPreview = {
  sourceSiteType: SITE_TYPES.AXON_HUB,
  targetSiteType: SITE_TYPES.AXON_HUB,
  generalWarningCodes: [
    MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.NO_ROLLBACK,
    MANAGED_SITE_CHANNEL_MIGRATION_GENERAL_WARNING_CODES.CREATE_ONLY,
  ],
  items: [
    {
      selection: {
        selectionId: "opaque:row/beta",
        displayName: "Ready example",
        ref: {
          siteType: SITE_TYPES.AXON_HUB,
          kind: "channel",
          scopeKey: "https://private-scope.example.invalid",
          resourceId: "native-private-ref",
        },
      },
      status: "ready",
      source: buildSource(),
      target: {
        projection: {
          name: "Ready example",
          type: AXON_HUB_CHANNEL_TYPE.OPENAI,
          baseUrl: "https://target.example.invalid/v2",
          models: ["model-a"],
          groups: ["default", "fallback"],
          priority: 2,
          weight: 8,
          status: 2,
        },
        adjustments: {
          remappedType: true,
          normalizedBaseUrl: true,
          forcedDefaultGroup: true,
          ignoredPriority: true,
          ignoredWeight: true,
          simplifiedStatus: true,
        },
      },
      warningCodes: [
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_PRIORITY,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_ADVANCED_SETTINGS,
        MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
      ],
    },
    {
      selection: {
        selectionId: "opaque:row/alpha",
        displayName: "Blocked example",
        ref: {
          siteType: SITE_TYPES.AXON_HUB,
          kind: "channel",
          scopeKey: "https://other-private-scope.example.invalid",
          resourceId: "other-native-private-ref",
        },
      },
      status: "blocked",
      warningCodes: [],
      blockingReasonCode:
        MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED,
    },
  ],
  totalCount: 2,
  readyCount: 1,
  blockedCount: 1,
}

describe("managedResourceMigrationPresentation", () => {
  it("preserves opaque row order and all seven canonical comparison values", () => {
    const mapped = mapManagedResourceMigrationPreview(preview, {
      t,
      getSiteLabel: (siteType) => `Site ${siteType}`,
    })

    expect(mapped.rows.map((row) => row.rowKey)).toEqual([
      "opaque:row/beta",
      "opaque:row/alpha",
    ])
    expect(mapped.rows.map((row) => row.displayIdentifier)).toEqual([
      "opaque:row/beta",
      "opaque:row/alpha",
    ])
    expect(mapped.rows[0].comparisons.map((field) => field.id)).toEqual([
      "baseUrl",
      "type",
      "models",
      "groups",
      "priority",
      "weight",
      "status",
    ])
    expect(
      mapped.rows[0].comparisons.map(({ source, target }) => [source, target]),
    ).toEqual([
      [
        "https://source.example.invalid/v1",
        "https://target.example.invalid/v2",
      ],
      ["Anthropic", "OpenAI"],
      ["model-b, model-a", "model-a"],
      ["source-group", "default, fallback"],
      ["7", "2"],
      ["13", "8"],
      ["Enabled", "Disabled"],
    ])
    expect(mapped).toMatchObject({
      sourceLabel: `Site ${SITE_TYPES.AXON_HUB}`,
      targetLabel: `Site ${SITE_TYPES.AXON_HUB}`,
      readyCount: 1,
      blockedCount: 1,
      totalCount: 2,
      isLoading: false,
      isManualLoading: false,
      error: null,
    })
  })

  it("preserves warning order and maps blocked rows to controlled fallback copy", () => {
    const mapped = mapManagedResourceMigrationPreview(preview, {
      t,
      getSiteLabel: String,
    })

    expect(mapped.generalWarnings).toEqual(["No rollback", "Create only"])
    expect(mapped.rows[0].warningText).toEqual([
      "Target ignores priority",
      "Drops advanced settings",
      "Target remaps type",
    ])
    expect(mapped.rows[1]).toMatchObject({
      status: "blocked",
      blockedReason: "Source type unsupported",
      blockedMessage: undefined,
    })
    expect(mapped.rows[1].comparisons).toHaveLength(7)
    expect(
      mapped.rows[1].comparisons.every(
        ({ source, target, status }) =>
          source === "" && target === "" && status === "unsupported",
      ),
    ).toBe(true)

    const serialized = JSON.stringify(mapped)
    expect(serialized).not.toMatch(
      /native-private-ref|private-scope|credential|command|future-provider/i,
    )
  })

  it("uses a controlled blocked fallback for malformed runtime reason codes", () => {
    const unsafePreview = {
      ...preview,
      items: [
        {
          ...preview.items[1],
          blockingReasonCode: "backend-stack-secret",
        },
      ],
      totalCount: 1,
      readyCount: 0,
      blockedCount: 1,
    } as unknown as ManagedSiteMigrationCanonicalPreview

    const mapped = mapManagedResourceMigrationPreview(unsafePreview, {
      t,
      getSiteLabel: String,
    })

    expect(mapped.rows[0].blockedReason).toBe(
      "Source access could not be verified",
    )
    expect(JSON.stringify(mapped)).not.toContain("backend-stack-secret")
  })

  it("maps partial created, failed, skipped, and uncertain outcomes without replay", () => {
    const result: ManagedSiteMigrationCanonicalExecutionResult = {
      totalSelected: 4,
      attemptedCount: 3,
      createdCount: 1,
      failedCount: 1,
      skippedCount: 1,
      uncertainCount: 1,
      items: [
        {
          selectionId: "opaque:created",
          displayName: "Created example",
          status: "created",
        },
        {
          selectionId: "opaque:failed",
          displayName: "Failed example",
          status: "failed",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.TargetRejected,
        },
        {
          selectionId: "opaque:skipped",
          displayName: "Skipped example",
          status: "skipped",
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_TYPE_UNSUPPORTED,
        },
        {
          selectionId: "opaque:uncertain",
          displayName: "Uncertain example",
          status: "uncertain",
          failureCode:
            MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES.MutationStateUncertain,
        },
      ],
    }

    const mapped = mapManagedResourceMigrationExecutionResult(result, { t })

    expect(mapped.summary).toBe("1/1/1/1/4")
    expect(
      mapped.items.map(({ rowKey, displayIdentifier, status }) => [
        rowKey,
        displayIdentifier,
        status,
      ]),
    ).toEqual([
      ["opaque:created", "opaque:created", "success"],
      ["opaque:failed", "opaque:failed", "failed"],
      ["opaque:skipped", "opaque:skipped", "skipped"],
      ["opaque:uncertain", "opaque:uncertain", "uncertain"],
    ])
    expect(mapped.items.map((item) => item.statusLabel)).toEqual([
      "Created",
      "Failed",
      "Skipped",
      "Uncertain",
    ])
    expect(mapped.items[2].message).toBe("Source type unsupported")
    expect(mapped.items[3].message).toBe(
      "Verify the target and refresh before continuing.",
    )
    expect(mapped.refreshRequired).toBe(true)
    expect(mapped.canReplay).toBe(false)
    expect(JSON.stringify(mapped)).not.toMatch(
      /target_rejected|mutation_state_uncertain|credential|command|native ref/i,
    )
  })
})
