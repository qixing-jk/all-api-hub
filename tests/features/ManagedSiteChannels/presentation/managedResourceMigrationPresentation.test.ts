import { createInstance, type TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { AXON_HUB_CHANNEL_TYPE } from "~/constants/axonHub"
import { ChannelType } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import {
  mapManagedResourceMigrationExecutionResult,
  mapManagedResourceMigrationPreview,
} from "~/features/ManagedSiteChannels/presentation/managedResourceMigrationPresentation"
import enManagedSiteChannels from "~/locales/en/managedSiteChannels.json"
import es419ManagedSiteChannels from "~/locales/es-419/managedSiteChannels.json"
import jaManagedSiteChannels from "~/locales/ja/managedSiteChannels.json"
import viManagedSiteChannels from "~/locales/vi/managedSiteChannels.json"
import zhCnManagedSiteChannels from "~/locales/zh-CN/managedSiteChannels.json"
import zhTwManagedSiteChannels from "~/locales/zh-TW/managedSiteChannels.json"
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
  "managedSiteChannels:migration.itemWarnings.dropsModelMapping":
    "Drops model mapping",
  "managedSiteChannels:migration.itemWarnings.dropsStatusCodeMapping":
    "Drops status mapping",
  "managedSiteChannels:migration.itemWarnings.dropsMultiKeyState":
    "Drops multiple keys",
  "managedSiteChannels:migration.itemWarnings.targetRemapsChannelType":
    "Target remaps type",
  "managedSiteChannels:migration.itemWarnings.targetNormalizesBaseUrl":
    "Target normalizes Base URL",
  "managedSiteChannels:migration.itemWarnings.targetForcesDefaultGroup":
    "Target forces default group",
  "managedSiteChannels:migration.itemWarnings.targetIgnoresPriority":
    "Target ignores priority",
  "managedSiteChannels:migration.itemWarnings.targetIgnoresWeight":
    "Target ignores weight",
  "managedSiteChannels:migration.itemWarnings.targetSimplifiesStatus":
    "Target simplifies status",
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
  const summaryMetric = normalizedKey.match(
    /^managedSiteChannels:migration\.results\.summaryMetrics\.(created|failed|skipped|uncertain|total)$/,
  )?.[1]
  if (summaryMetric) return `${options?.count} ${summaryMetric}`
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

  it("maps every controlled warning, blocker, type, and status fallback without leaking malformed codes", () => {
    const malformedWarning = "backend-warning-secret"
    const allWarnings = [
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MODEL_MAPPING,
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_STATUS_CODE_MAPPING,
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_ADVANCED_SETTINGS,
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.DROPS_MULTI_KEY_STATE,
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_REMAPS_CHANNEL_TYPE,
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_NORMALIZES_BASE_URL,
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_FORCES_DEFAULT_GROUP,
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_PRIORITY,
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_IGNORES_WEIGHT,
      MANAGED_SITE_CHANNEL_MIGRATION_ITEM_WARNING_CODES.TARGET_SIMPLIFIES_STATUS,
      malformedWarning,
    ]
    const readyItem = preview.items[0]
    const matrix = {
      ...preview,
      generalWarningCodes: [
        ...preview.generalWarningCodes,
        "backend-general-warning-secret",
      ],
      items: [
        {
          ...readyItem,
          source: buildSource({
            resourceType: "future-provider" as unknown as ChannelType,
            status: "disabled",
          }),
          warningCodes: allWarnings,
        },
        {
          ...readyItem,
          selection: {
            ...readyItem.selection,
            selectionId: "opaque:unknown-status",
            displayName: "Unknown status",
          },
          source: buildSource({ status: "other" }),
          warningCodes: [],
        },
        {
          ...preview.items[1],
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.TARGET_DRAFT_PREPARATION_FAILED,
        },
        {
          ...preview.items[1],
          selection: {
            ...preview.items[1].selection,
            selectionId: "opaque:source-resolution",
            displayName: "Source resolution",
          },
          blockingReasonCode:
            MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES.SOURCE_KEY_RESOLUTION_FAILED,
        },
      ],
      totalCount: 4,
      readyCount: 2,
      blockedCount: 2,
    } as unknown as ManagedSiteMigrationCanonicalPreview

    const mapped = mapManagedResourceMigrationPreview(matrix, {
      t,
      getSiteLabel: String,
    })

    expect(mapped.generalWarnings).toEqual(["No rollback", "Create only"])
    expect(mapped.rows[0].warningText).toEqual([
      "Drops model mapping",
      "Drops status mapping",
      "Drops advanced settings",
      "Drops multiple keys",
      "Target remaps type",
      "Target normalizes Base URL",
      "Target forces default group",
      "Target ignores priority",
      "Target ignores weight",
      "Target simplifies status",
    ])
    expect(
      mapped.rows
        .slice(0, 2)
        .map((row) =>
          Object.fromEntries(
            row.comparisons
              .filter(({ id }) => id === "type" || id === "status")
              .map(({ id, source }) => [id, source]),
          ),
        ),
    ).toEqual([
      { type: "Unsupported type", status: "Disabled" },
      { type: "Anthropic", status: "Unknown" },
    ])
    expect(mapped.rows.slice(2).map((row) => row.blockedReason)).toEqual([
      "Target preparation failed",
      "Source access could not be verified",
    ])
    expect(JSON.stringify(mapped)).not.toMatch(/backend-.*-secret/)
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

    expect(mapped.summary).toBe(
      "1 created/1 failed/1 skipped/1 uncertain/4 total",
    )
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

  it("uses independently pluralized Spanish metrics for mixed result counts", async () => {
    const i18n = createInstance()
    await i18n.init({
      lng: "es-419",
      fallbackLng: false,
      resources: {
        "es-419": { managedSiteChannels: es419ManagedSiteChannels },
      },
    })
    const baseResult: ManagedSiteMigrationCanonicalExecutionResult = {
      totalSelected: 6,
      attemptedCount: 6,
      createdCount: 1,
      failedCount: 2,
      skippedCount: 1,
      uncertainCount: 2,
      items: [],
    }

    expect(
      mapManagedResourceMigrationExecutionResult(baseResult, {
        t: i18n.getFixedT("es-419", "managedSiteChannels"),
      }).summary,
    ).toBe(
      "Resultados: 1 creado, 2 fallidos, 1 omitido, 2 inciertos, 6 en total.",
    )
    expect(
      mapManagedResourceMigrationExecutionResult(
        {
          ...baseResult,
          createdCount: 2,
          failedCount: 1,
          skippedCount: 2,
          uncertainCount: 1,
        },
        { t: i18n.getFixedT("es-419", "managedSiteChannels") },
      ).summary,
    ).toBe(
      "Resultados: 2 creados, 1 fallido, 2 omitidos, 1 incierto, 6 en total.",
    )
  })

  it.each([
    ["en", enManagedSiteChannels],
    ["es-419", es419ManagedSiteChannels],
    ["ja", jaManagedSiteChannels],
    ["vi", viManagedSiteChannels],
    ["zh-CN", zhCnManagedSiteChannels],
    ["zh-TW", zhTwManagedSiteChannels],
  ])("resolves plural summary metrics in %s", async (language, resource) => {
    const i18n = createInstance()
    await i18n.init({
      lng: language,
      fallbackLng: false,
      resources: { [language]: { managedSiteChannels: resource } },
    })

    const summary = mapManagedResourceMigrationExecutionResult(
      {
        totalSelected: 6,
        attemptedCount: 6,
        createdCount: 1,
        failedCount: 2,
        skippedCount: 1,
        uncertainCount: 2,
        items: [],
      },
      { t: i18n.getFixedT(language, "managedSiteChannels") },
    ).summary

    expect(summary).toContain("1")
    expect(summary).toContain("2")
    expect(summary).toContain("6")
    expect(summary).not.toContain("summaryMetrics")
  })
})
