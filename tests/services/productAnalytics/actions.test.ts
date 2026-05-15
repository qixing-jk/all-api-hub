import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TELEMETRY_SOURCES,
} from "~/services/productAnalytics/events"

const { trackMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/events")>()
  return {
    ...actual,
    trackProductAnalyticsEvent: trackMock,
  }
})

describe("product analytics action helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trackMock.mockResolvedValue({ success: true })
  })

  it("tracks a controlled feature action start with fixed enum values", async () => {
    const { trackProductAnalyticsActionStarted } = await import(
      "~/services/productAnalytics/actions"
    )

    await trackProductAnalyticsActionStarted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    expect(trackMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
  })

  it("swallows analytics send failures so feature code can continue", async () => {
    trackMock.mockRejectedValue(new Error("network unavailable"))
    const { trackProductAnalyticsActionStarted } = await import(
      "~/services/productAnalytics/actions"
    )

    await expect(
      trackProductAnalyticsActionStarted({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).resolves.toBeUndefined()
  })

  it("resolves a scoped action id string using the provided scope", async () => {
    const { resolveProductAnalyticsActionContext } = await import(
      "~/services/productAnalytics/actions"
    )

    expect(
      resolveProductAnalyticsActionContext(
        PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
        {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
          surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        },
      ),
    ).toEqual({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("lets scoped action object fields override the provided scope", async () => {
    const { resolveProductAnalyticsActionContext } = await import(
      "~/services/productAnalytics/actions"
    )

    expect(
      resolveProductAnalyticsActionContext(
        {
          action_id: PRODUCT_ANALYTICS_ACTION_IDS.ExportFullBackup,
          feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
          surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsImportExportPage,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        },
        {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
          surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
        },
      ),
    ).toEqual({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportFullBackup,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsImportExportPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("returns undefined when required scoped action fields are missing", async () => {
    const { resolveProductAnalyticsActionContext } = await import(
      "~/services/productAnalytics/actions"
    )

    expect(
      resolveProductAnalyticsActionContext(
        PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
        {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        },
      ),
    ).toBeUndefined()
    expect(
      resolveProductAnalyticsActionContext(
        {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        },
        {},
      ),
    ).toBeUndefined()
  })

  it("resolves a scoped action without a surface id", async () => {
    const { resolveProductAnalyticsActionContext } = await import(
      "~/services/productAnalytics/actions"
    )

    expect(
      resolveProductAnalyticsActionContext(
        PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
        {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        },
      ),
    ).toEqual({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("returns undefined when no analytics action is provided", async () => {
    const { resolveProductAnalyticsActionContext } = await import(
      "~/services/productAnalytics/actions"
    )

    expect(
      resolveProductAnalyticsActionContext(undefined, {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).toBeUndefined()
  })

  it("tracks completion with duration and error buckets but no raw error text", async () => {
    const { trackProductAnalyticsActionCompleted } = await import(
      "~/services/productAnalytics/actions"
    )

    await trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundAutoCheckinScheduler,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      durationMs: 6_000,
    })

    expect(trackMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundAutoCheckinScheduler,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
        duration_bucket: "5_30s",
      },
    )
  })

  it("tracks completion with controlled action insight properties", async () => {
    const { trackProductAnalyticsActionCompleted } = await import(
      "~/services/productAnalytics/actions"
    )

    await trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      durationMs: 2_000,
      insights: {
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
        mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
        statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
        telemetrySource: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
        selectedCount: 2,
        itemCount: 3,
        successCount: 3,
        failureCount: 0,
        modelCount: 11,
        usageDataPresent: true,
      },
    })

    expect(trackMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        duration_bucket: "1_5s",
        source_kind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
        mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
        status_kind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
        telemetry_source: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
        selected_count_bucket: "2_3",
        item_count_bucket: "2_3",
        success_count_bucket: "2_3",
        failure_count_bucket: "0",
        model_count_bucket: "10_plus",
        usage_data_present: true,
      },
    )
  })

  it("omits absent optional completion metadata fields", async () => {
    const { trackProductAnalyticsActionCompleted } = await import(
      "~/services/productAnalytics/actions"
    )

    await trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {},
    })

    expect(trackMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
      },
    )
  })

  it("creates a manual action tracker that reports elapsed duration on completion", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(2_250)
    const { startProductAnalyticsAction } = await import(
      "~/services/productAnalytics/actions"
    )

    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportBackupData,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsImportExportPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    const completeResult = tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)

    expect(trackMock).toHaveBeenNthCalledWith(
      1,
      PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.ImportBackupData,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsImportExportPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )
    expect(completeResult).toBeUndefined()
    await vi.waitFor(() => {
      expect(trackMock).toHaveBeenNthCalledWith(
        2,
        PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
        {
          feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
          action_id: PRODUCT_ANALYTICS_ACTION_IDS.ImportBackupData,
          surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsImportExportPage,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          result: PRODUCT_ANALYTICS_RESULTS.Success,
          duration_bucket: "1_5s",
        },
      )
    })
  })

  it("keeps manual tracker completion best-effort when analytics sending fails", async () => {
    trackMock
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("network unavailable"))
    const { startProductAnalyticsAction } = await import(
      "~/services/productAnalytics/actions"
    )

    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    expect(() =>
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success, {
        durationMs: 2_000,
        insights: {
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
          mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
          statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
          telemetrySource: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
          selectedCount: 2,
          itemCount: 3,
          successCount: 3,
          failureCount: 0,
          modelCount: 11,
          usageDataPresent: true,
        },
      }),
    ).not.toThrow()

    await vi.waitFor(() => {
      expect(trackMock).toHaveBeenNthCalledWith(
        2,
        PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
        {
          feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
          action_id: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
          surface_id:
            PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          result: PRODUCT_ANALYTICS_RESULTS.Success,
          duration_bucket: "1_5s",
          source_kind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
          mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
          status_kind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
          telemetry_source:
            PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
          selected_count_bucket: "2_3",
          item_count_bucket: "2_3",
          success_count_bucket: "2_3",
          failure_count_bucket: "0",
          model_count_bucket: "10_plus",
          usage_data_present: true,
        },
      )
    })
  })
})
