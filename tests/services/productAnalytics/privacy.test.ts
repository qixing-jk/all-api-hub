import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_COUNT_BUCKETS,
  PRODUCT_ANALYTICS_DURATION_BUCKETS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_PAGE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TELEMETRY_SOURCES,
} from "~/services/productAnalytics/events"
import {
  bucketCount,
  bucketDurationMs,
  sanitizeProductAnalyticsEvent,
} from "~/services/productAnalytics/privacy"

describe("product analytics privacy filtering", () => {
  it("keeps whitelisted PageViewed properties and strips unknown keys", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.PageViewed,
      {
        page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        accountName: "Secret Account",
        domain: "example.com",
      },
    )

    expect(sanitized).toEqual({
      page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsBasicSettings,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("rejects forbidden-looking keys while keeping valid enum values", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnalyticsSettings,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.EnableProductAnalytics,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBasicSettingsGeneral,
        entrypoint: "options",
        url: "https://private.example/path",
        token: "sk-secret",
        balance: 100,
        email: "user@example.com",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnalyticsSettings,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.EnableProductAnalytics,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBasicSettingsGeneral,
      entrypoint: "options",
    })
  })

  it("drops generic action ids that are not product-specific enums", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnalyticsSettings,
        action_id: "toggle",
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBasicSettingsGeneral,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnalyticsSettings,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsBasicSettingsGeneral,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("keeps expanded controlled feature action enums and drops free-form values", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        duration_bucket: "1_5s",
        action_name: "Refresh Alice",
        surface_name: "Account row for Alice",
        label: "Refresh private account for Alice",
        feature_name: "Account Management",
        accountName: "Secret Account",
        copied_content: "sk-secret",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccount,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      duration_bucket: "1_5s",
    })
  })

  it("keeps Key Management action enums without leaking account token details", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RevealAccountTokenKey,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementDialog,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        duration_bucket: "lt_1s",
        accountName: "Secret Account",
        tokenName: "Production token",
        tokenKey: "sk-secret",
        apiKey: "sk-secret",
        account_id: "private-account-id",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.RevealAccountTokenKey,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      duration_bucket: "lt_1s",
    })
  })

  it.each([
    {
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      errorCategory: undefined,
    },
    {
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteTokenStatus,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      errorCategory: undefined,
    },
    {
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RetryManagedSiteTokenVerification,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementDialog,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
    },
  ])(
    "keeps second-round Key Management completion enums without leaking raw details for $actionId",
    ({ actionId, surfaceId, result, errorCategory }) => {
      const sanitized = sanitizeProductAnalyticsEvent(
        PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
        {
          feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
          action_id: actionId,
          surface_id: surfaceId,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          result,
          error_category: errorCategory,
          duration_bucket: PRODUCT_ANALYTICS_DURATION_BUCKETS.OneTo5s,
          accountName: "Secret Account",
          accountId: "private-account-id",
          accountUrl: "https://private.example/account",
          baseUrl: "https://private.example",
          accessToken: "sk-secret",
          tokenKey: "sk-secret",
          apiKey: "sk-secret",
          rawToken: "sk-secret",
          errorMessage: "backend returned token sk-secret",
          errorStack: "Error: backend returned token sk-secret",
        },
      )

      expect(sanitized).toEqual({
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
        action_id: actionId,
        surface_id: surfaceId,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result,
        ...(errorCategory ? { error_category: errorCategory } : {}),
        duration_bucket: PRODUCT_ANALYTICS_DURATION_BUCKETS.OneTo5s,
      })
    },
  )

  it("keeps controlled action insight buckets while dropping sensitive source values", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        source_kind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
        mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
        item_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.TwoToThree,
        selected_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.One,
        success_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.One,
        failure_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.One,
        telemetry_source: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
        usage_data_present: true,
        source_url: "https://private.example/path",
        sourceText: "sk-secret",
        selected_count: 2,
        telemetry_endpoint: "/api/usage/token/",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      source_kind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
      mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
      item_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.TwoToThree,
      selected_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.One,
      success_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.One,
      failure_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.One,
      telemetry_source: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
      usage_data_present: true,
    })
  })

  it("keeps model-list source and filter analytics enums without raw identifiers", () => {
    expect(PRODUCT_ANALYTICS_ACTION_IDS.SelectModelSource).toBe(
      "select_model_source",
    )
    expect(PRODUCT_ANALYTICS_SOURCE_KINDS.ModelProfile).toBe("model_profile")
    expect(PRODUCT_ANALYTICS_MODE_IDS.ProviderFilter).toBe("provider_filter")

    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.SelectModelSource,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        source_kind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelProfile,
        mode: PRODUCT_ANALYTICS_MODE_IDS.ProviderFilter,
        model_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.FourToTen,
        accountId: "private-account-id",
        profileName: "Private profile",
        modelName: "private-model",
        baseUrl: "https://private.example",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.SelectModelSource,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      source_kind: PRODUCT_ANALYTICS_SOURCE_KINDS.ModelProfile,
      mode: PRODUCT_ANALYTICS_MODE_IDS.ProviderFilter,
      model_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.FourToTen,
    })
  })

  it("keeps account save completion enums while dropping account-sensitive details", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.CreateAccount,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        duration_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.One,
        url: "https://private.example/path",
        baseUrl: "https://private.example",
        accessToken: "sk-secret",
        cookie: "session=secret",
        userId: "123",
        username: "alice",
        notes: "private note",
        tagName: "finance",
        message: "backend returned private details",
        balance: "123.45",
        usage: "456.78",
        tokens: "999",
        amount: "42.00",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.CreateAccount,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    })
  })

  it("keeps content-script manual action enums without leaking page data", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
        action_id:
          PRODUCT_ANALYTICS_ACTION_IDS.DetectedApiCredentialReviewStarted,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckConfirmToast,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
        pageUrl: "https://private.example/path",
        hostname: "private.example",
        sourceText: "sk-secret",
        apiKey: "sk-secret",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      action_id:
        PRODUCT_ANALYTICS_ACTION_IDS.DetectedApiCredentialReviewStarted,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckConfirmToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
  })

  it("keeps background context-menu AI API check enums without leaking page data", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
        action_id:
          PRODUCT_ANALYTICS_ACTION_IDS.TriggerApiCredentialCheckFromContextMenu,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundContextMenu,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        pageUrl: "https://private.example/path",
        originUrl: "https://private.example",
        hostname: "private.example",
        selectionText: "sk-secret",
        apiKey: "sk-secret",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      action_id:
        PRODUCT_ANALYTICS_ACTION_IDS.TriggerApiCredentialCheckFromContextMenu,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundContextMenu,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    })
  })

  it.each([
    PRODUCT_ANALYTICS_ACTION_IDS.RunTempWindowFetch,
    PRODUCT_ANALYTICS_ACTION_IDS.RunTempWindowTurnstileFetch,
  ])(
    "keeps background temp-window action insight enums while dropping request details for %s",
    (actionId) => {
      const sanitized = sanitizeProductAnalyticsEvent(
        PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
        {
          feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ShieldBypassAssist,
          action_id: actionId,
          surface_id:
            PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundShieldBypassTempContext,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
          status_kind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
          status: 502,
          code: "NETWORK_ERROR",
          fetchUrl: "https://private.example/api/checkin?token=secret",
          originUrl: "https://private.example",
          cookieHeader: "session=secret",
          authorization: "Bearer secret",
          responseBody: "{ secret: true }",
        },
      )

      expect(sanitized).toEqual({
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ShieldBypassAssist,
        action_id: actionId,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundShieldBypassTempContext,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Network,
        status_kind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
      })
    },
  )

  it("drops invalid enum values while keeping valid entrypoint", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.PageViewed,
      {
        page_id: "https://private.example",
        entrypoint: "options",
      },
    )

    expect(sanitized).toEqual({
      entrypoint: "options",
    })
  })

  it("keeps site ecosystem snapshot bucket fields only", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SiteEcosystemSnapshot,
      {
        total_account_count_bucket: "4_10",
        distinct_site_count_bucket: "2_3",
        known_site_type_count_bucket: "1",
        unknown_site_count_bucket: "0",
        managed_site_count_bucket: "2_3",
        site_url: "https://private.example",
        hostname: "private.example",
      },
    )

    expect(sanitized).toEqual({
      total_account_count_bucket: "4_10",
      distinct_site_count_bucket: "2_3",
      known_site_type_count_bucket: "1",
      unknown_site_count_bucket: "0",
      managed_site_count_bucket: "2_3",
    })
  })

  it("keeps site type bucket field despite forbidden key pattern", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SiteTypePresent,
      {
        site_type: SITE_TYPES.NEW_API,
        account_count_bucket: "2_3",
        accountName: "Secret Account",
        domain: "private.example",
        url: "https://private.example/account",
      },
    )

    expect(sanitized).toEqual({
      site_type: SITE_TYPES.NEW_API,
      account_count_bucket: "2_3",
    })
  })

  it.each([
    SITE_TYPES.OCTOPUS,
    SITE_TYPES.AXON_HUB,
    SITE_TYPES.CLAUDE_CODE_HUB,
  ])(
    "keeps managed-only site type %s as a fixed analytics enum",
    (siteType) => {
      const sanitized = sanitizeProductAnalyticsEvent(
        PRODUCT_ANALYTICS_EVENTS.SiteTypePresent,
        {
          site_type: siteType,
          account_count_bucket: "1",
          url: "https://private.example/account",
        },
      )

      expect(sanitized).toEqual({
        site_type: siteType,
        account_count_bucket: "1",
      })
    },
  )

  it("buckets count boundaries", () => {
    expect(bucketCount(0)).toBe(PRODUCT_ANALYTICS_COUNT_BUCKETS.Zero)
    expect(bucketCount(1)).toBe(PRODUCT_ANALYTICS_COUNT_BUCKETS.One)
    expect(bucketCount(3)).toBe(PRODUCT_ANALYTICS_COUNT_BUCKETS.TwoToThree)
    expect(bucketCount(10)).toBe(PRODUCT_ANALYTICS_COUNT_BUCKETS.FourToTen)
    expect(bucketCount(11)).toBe(PRODUCT_ANALYTICS_COUNT_BUCKETS.TenPlus)
  })

  it("buckets duration boundaries", () => {
    expect(bucketDurationMs(999)).toBe("lt_1s")
    expect(bucketDurationMs(5_000)).toBe("1_5s")
    expect(bucketDurationMs(30_000)).toBe("5_30s")
    expect(bucketDurationMs(120_000)).toBe("30_120s")
    expect(bucketDurationMs(120_001)).toBe("gt_120s")
  })
})
