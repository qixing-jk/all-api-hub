import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FAILURE_REASONS,
  PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FETCH_CONTEXT_KINDS,
  PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_STRATEGIES,
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_API_TYPES,
  PRODUCT_ANALYTICS_EDITOR_MODES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_REQUESTED_AUTH_MODES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  PRODUCT_ANALYTICS_TARGET_STATES,
  PRODUCT_ANALYTICS_TELEMETRY_SOURCES,
} from "~/services/productAnalytics/events"

const { trackMock } = vi.hoisted(() => ({
  trackMock: vi.fn(),
}))

const { loggerDebugSpy, loggerWarnSpy } = vi.hoisted(() => ({
  loggerDebugSpy: vi.fn(),
  loggerWarnSpy: vi.fn(),
}))

vi.mock("~/services/productAnalytics/events", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/productAnalytics/events")>()
  return {
    ...actual,
    trackProductAnalyticsEvent: trackMock,
  }
})

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: loggerDebugSpy,
    info: vi.fn(),
    warn: loggerWarnSpy,
    error: vi.fn(),
  }),
}))

describe("product analytics action helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
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

  it("logs incomplete scoped actions in custom development build modes", async () => {
    vi.stubEnv("MODE", "staging")
    vi.stubEnv("DEV", true)
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
    expect(loggerDebugSpy).toHaveBeenCalledWith(
      "Product analytics action config could not be resolved",
    )
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

  it("tracks completion with exact duration and error categories but no raw error text", async () => {
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
        duration_ms: 6000,
        failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      },
    )
  })

  it("defaults failed completions without an explicit failure stage to execute", async () => {
    const { trackProductAnalyticsActionCompleted } = await import(
      "~/services/productAnalytics/actions"
    )

    await trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    })

    expect(trackMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RunAutoCheckinNow,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      },
    )
  })

  it("defaults failed completions without an explicit error category to unknown", async () => {
    const { trackProductAnalyticsActionCompleted } = await import(
      "~/services/productAnalytics/actions"
    )

    await trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccountTokens,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
    })

    expect(trackMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccountTokens,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      },
    )
  })

  it("does not add failure diagnostics to non-failure completions by default", async () => {
    const { trackProductAnalyticsActionCompleted } = await import(
      "~/services/productAnalytics/actions"
    )

    await trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportFullBackup,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Cancelled,
    })

    expect(trackMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ImportExport,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.ExportFullBackup,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Cancelled,
      },
    )
  })

  it("maps structured errors to safe analytics categories without raw messages", async () => {
    const { resolveProductAnalyticsErrorCategoryFromError } = await import(
      "~/services/productAnalytics/actions"
    )

    expect(
      resolveProductAnalyticsErrorCategoryFromError({ statusCode: 401 }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth)
    expect(
      resolveProductAnalyticsErrorCategoryFromError({ statusCode: 429 }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.RateLimit)
    expect(
      resolveProductAnalyticsErrorCategoryFromError({
        code: "NETWORK_ERROR",
      }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network)
    expect(
      resolveProductAnalyticsErrorCategoryFromError({
        originalCode: "JSON_PARSE_ERROR",
      }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation)
    expect(
      resolveProductAnalyticsErrorCategoryFromError({
        code: "FEATURE_UNSUPPORTED",
      }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported)
    expect(
      resolveProductAnalyticsErrorCategoryFromError({ name: "AbortError" }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Timeout)
    expect(
      resolveProductAnalyticsErrorCategoryFromError({
        name: "NotAllowedError",
      }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Permission)
    expect(
      resolveProductAnalyticsErrorCategoryFromError({ name: "NotFoundError" }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported)
    expect(
      resolveProductAnalyticsErrorCategoryFromError({ name: "NetworkError" }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network)
    expect(
      resolveProductAnalyticsErrorCategoryFromError({
        cause: { statusCode: 403 },
      }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth)
    expect(
      resolveProductAnalyticsErrorCategoryFromError({ statusCode: 99 }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown)
    expect(
      resolveProductAnalyticsErrorCategoryFromError({ statusCode: 600 }),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown)
  })

  it("keeps unstructured analytics errors in the unknown bucket", async () => {
    const { resolveProductAnalyticsErrorCategoryFromError } = await import(
      "~/services/productAnalytics/actions"
    )

    expect(resolveProductAnalyticsErrorCategoryFromError("private text")).toBe(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    )
    expect(resolveProductAnalyticsErrorCategoryFromError({})).toBe(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    )
    expect(
      resolveProductAnalyticsErrorCategoryFromError(
        new TypeError("Cannot read properties of undefined"),
      ),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown)
    expect(
      resolveProductAnalyticsErrorCategoryFromError(
        new TypeError("Failed to fetch"),
      ),
    ).toBe(PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network)
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
        apiType: PRODUCT_ANALYTICS_API_TYPES.OpenAiCompatible,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
        mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
        editorMode: PRODUCT_ANALYTICS_EDITOR_MODES.Json,
        statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
        telemetrySource: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ModelFilter,
        targetState: PRODUCT_ANALYTICS_TARGET_STATES.Enabled,
        managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
        sourceManagedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
        targetManagedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Octopus,
        failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.PartialSuccess,
        accountAutoDetectFailureReason:
          PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        autoDetectStrategy:
          PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_STRATEGIES.BackgroundTempContext,
        requestedAuthMode: PRODUCT_ANALYTICS_REQUESTED_AUTH_MODES.Cookie,
        siteType: "new-api",
        fetchContextKind:
          PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FETCH_CONTEXT_KINDS.BrowserContext,
        cacheHit: false,
        cacheUsed: true,
        fallbackAvailable: true,
        fallbackUsed: true,
        retryAttempted: true,
        retryCount: 2,
        tempContextUsed: true,
        incognitoContextUsed: true,
        staleResponseIgnored: false,
        backgroundExecution: true,
        currentTabMatched: false,
        selectedCount: 2,
        itemCount: 3,
        successCount: 3,
        failureCount: 0,
        skippedCount: 1,
        warningCount: 13,
        readyCount: 1,
        blockedCount: 2,
        modelCount: 11,
        filterCount: 2,
        resultCount: 8,
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
        duration_ms: 2000,
        api_type: PRODUCT_ANALYTICS_API_TYPES.OpenAiCompatible,
        source_kind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
        mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
        editor_mode: PRODUCT_ANALYTICS_EDITOR_MODES.Json,
        status_kind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
        telemetry_source: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
        target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.ModelFilter,
        target_state: PRODUCT_ANALYTICS_TARGET_STATES.Enabled,
        managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
        source_managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
        target_managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Octopus,
        failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        failure_reason: PRODUCT_ANALYTICS_FAILURE_REASONS.PartialSuccess,
        account_auto_detect_failure_reason:
          PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FAILURE_REASONS.TokenFetchFailed,
        auto_detect_strategy:
          PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_STRATEGIES.BackgroundTempContext,
        requested_auth_mode: PRODUCT_ANALYTICS_REQUESTED_AUTH_MODES.Cookie,
        site_type: "new-api",
        fetch_context_kind:
          PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FETCH_CONTEXT_KINDS.BrowserContext,
        cache_hit: false,
        cache_used: true,
        fallback_available: true,
        fallback_used: true,
        retry_attempted: true,
        retry_count: 2,
        temp_context_used: true,
        incognito_context_used: true,
        stale_response_ignored: false,
        background_execution: true,
        current_tab_matched: false,
        selected_count: 2,
        item_count: 3,
        success_count: 3,
        failure_count: 0,
        skipped_count: 1,
        warning_count: 13,
        ready_count: 1,
        blocked_count: 2,
        model_count: 11,
        filter_count: 2,
        result_count: 8,
        usage_data_present: true,
      },
    )
  })

  it("flattens structured action diagnostics to outbound completion fields", async () => {
    const { trackProductAnalyticsActionCompleted } = await import(
      "~/services/productAnalytics/actions"
    )

    await trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      diagnostics: {
        context: {
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
          mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
          apiType: PRODUCT_ANALYTICS_API_TYPES.OpenAiCompatible,
          editorMode: PRODUCT_ANALYTICS_EDITOR_MODES.Visual,
          statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Warning,
          telemetrySource: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.Models,
          targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ExternalSite,
          targetState: PRODUCT_ANALYTICS_TARGET_STATES.Enabled,
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Veloera,
          sourceManagedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          targetManagedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Octopus,
          siteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          requestedAuthMode: PRODUCT_ANALYTICS_REQUESTED_AUTH_MODES.AccessToken,
          fetchContextKind:
            PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FETCH_CONTEXT_KINDS.CurrentTab,
          autoDetectStrategy:
            PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_STRATEGIES.CurrentTab,
        },
        execution: {
          cacheHit: false,
          cacheUsed: true,
          fallbackAvailable: true,
          fallbackUsed: false,
          retryAttempted: true,
          retryCount: 2,
          tempContextUsed: true,
          incognitoContextUsed: true,
          staleResponseIgnored: true,
          backgroundExecution: true,
          currentTabMatched: true,
        },
        outcome: {
          itemCount: 3,
          selectedCount: 2,
          successCount: 1,
          failureCount: 1,
          skippedCount: 1,
          warningCount: 1,
          readyCount: 2,
          blockedCount: 1,
          modelCount: 8,
          filterCount: 4,
          resultCount: 7,
          usageDataPresent: true,
        },
        failure: {
          category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
          stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
          reason: PRODUCT_ANALYTICS_FAILURE_REASONS.SessionExpired,
          accountAutoDetectFailureReason:
            PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FAILURE_REASONS.UserDataMissing,
        },
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
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
        api_type: PRODUCT_ANALYTICS_API_TYPES.OpenAiCompatible,
        source_kind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelAccount,
        mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
        editor_mode: PRODUCT_ANALYTICS_EDITOR_MODES.Visual,
        status_kind: PRODUCT_ANALYTICS_STATUS_KINDS.Warning,
        telemetry_source: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.Models,
        target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.ExternalSite,
        target_state: PRODUCT_ANALYTICS_TARGET_STATES.Enabled,
        managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Veloera,
        source_managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
        target_managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Octopus,
        requested_auth_mode: PRODUCT_ANALYTICS_REQUESTED_AUTH_MODES.AccessToken,
        site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
        fetch_context_kind:
          PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FETCH_CONTEXT_KINDS.CurrentTab,
        auto_detect_strategy:
          PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_STRATEGIES.CurrentTab,
        cache_hit: false,
        cache_used: true,
        fallback_available: true,
        fallback_used: false,
        retry_attempted: true,
        retry_count: 2,
        temp_context_used: true,
        incognito_context_used: true,
        stale_response_ignored: true,
        background_execution: true,
        current_tab_matched: true,
        item_count: 3,
        selected_count: 2,
        success_count: 1,
        failure_count: 1,
        skipped_count: 1,
        warning_count: 1,
        ready_count: 2,
        blocked_count: 1,
        model_count: 8,
        filter_count: 4,
        result_count: 7,
        usage_data_present: true,
        failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        failure_reason: PRODUCT_ANALYTICS_FAILURE_REASONS.SessionExpired,
        account_auto_detect_failure_reason:
          PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FAILURE_REASONS.UserDataMissing,
      },
    )
  })

  it("keeps an explicit error category when diagnostics report a different category", async () => {
    const { trackProductAnalyticsActionCompleted } = await import(
      "~/services/productAnalytics/actions"
    )

    await trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
      diagnostics: {
        failure: {
          category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
        },
      },
    })

    expect(trackMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
        failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      },
    )
  })

  it("maps content-script detection insights to sanitized action completion fields", async () => {
    const { trackProductAnalyticsActionCompleted } = await import(
      "~/services/productAnalytics/actions"
    )

    await trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShowApiCredentialCheckModal,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        apiType: PRODUCT_ANALYTICS_API_TYPES.OpenAiCompatible,
        sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ContextMenu,
        failureStage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
        readyCount: 2,
        blockedCount: 0,
      },
    })

    expect(trackMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.ShowApiCredentialCheckModal,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        api_type: PRODUCT_ANALYTICS_API_TYPES.OpenAiCompatible,
        source_kind: PRODUCT_ANALYTICS_SOURCE_KINDS.ContextMenu,
        failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
        ready_count: 2,
        blocked_count: 0,
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
          duration_ms: 1250,
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
          apiType: PRODUCT_ANALYTICS_API_TYPES.OpenAiCompatible,
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
          mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
          statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
          telemetrySource: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
          selectedCount: 2,
          itemCount: 3,
          successCount: 3,
          failureCount: 0,
          skippedCount: 1,
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
          duration_ms: 2000,
          api_type: PRODUCT_ANALYTICS_API_TYPES.OpenAiCompatible,
          source_kind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
          mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
          status_kind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
          telemetry_source:
            PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
          selected_count: 2,
          item_count: 3,
          success_count: 3,
          failure_count: 0,
          skipped_count: 1,
          model_count: 11,
          usage_data_present: true,
        },
      )
    })
  })
})
