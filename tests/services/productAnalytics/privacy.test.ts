import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_API_TYPES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_INTERVAL_BUCKETS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS,
  PRODUCT_ANALYTICS_COUNT_BUCKETS,
  PRODUCT_ANALYTICS_DURATION_BUCKETS,
  PRODUCT_ANALYTICS_EDITOR_MODES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_PAGE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SETTING_IDS,
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
        skipped_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.One,
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
      skipped_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.One,
      telemetry_source: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
      usage_data_present: true,
    })
  })

  it("keeps Managed Site Model Sync fixed action enums and drops raw UI text", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
        action_id:
          PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelManagement,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
        managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
        channelName: "Production channel",
        tabLabel: "Private manual tab label",
        filterText: "private-filter",
        searchQuery: "secret-channel",
        selectedChannelIds: [1, 2, 3],
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelManagement,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      mode: PRODUCT_ANALYTICS_MODE_IDS.Selected,
      managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
    })
  })

  it("keeps Managed Site Model Sync fixed setting ids without raw setting values", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      {
        setting_id:
          PRODUCT_ANALYTICS_SETTING_IDS.ManagedSiteModelSyncConfigSnapshot,
        enabled: true,
        sync_interval_bucket: PRODUCT_ANALYTICS_MODE_IDS.RefreshIntervalOneTo6h,
        concurrency_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.FourToTen,
        retry_max_attempts_bucket:
          PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS.FourPlus,
        rate_limit_rpm_bucket: PRODUCT_ANALYTICS_MODE_IDS.RateLimitSixtyPlus,
        rate_limit_burst_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.TenPlus,
        allowed_models_configured: true,
        global_filters_configured: true,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        value: 6,
        rawSettingValue: "private-model-a,private-model-b",
        allowedModels: ["private-model-a"],
        globalFilters: "private-filter",
      },
    )

    expect(sanitized).toEqual({
      setting_id:
        PRODUCT_ANALYTICS_SETTING_IDS.ManagedSiteModelSyncConfigSnapshot,
      enabled: true,
      sync_interval_bucket: PRODUCT_ANALYTICS_MODE_IDS.RefreshIntervalOneTo6h,
      concurrency_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.FourToTen,
      retry_max_attempts_bucket:
        PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS.FourPlus,
      rate_limit_rpm_bucket: PRODUCT_ANALYTICS_MODE_IDS.RateLimitSixtyPlus,
      rate_limit_burst_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.TenPlus,
      allowed_models_configured: true,
      global_filters_configured: true,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("keeps privacy-reviewed boolean settings with sensitive-looking field names", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AccountBehaviorSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        auto_provision_key_on_account_add_enabled: true,
        auto_fill_current_site_url_on_account_add_enabled: false,
        url_whitelist_enabled: true,
        url_whitelist_patterns_configured: true,
        url_whitelist_account_urls_enabled: false,
        url_whitelist_checkin_redeem_urls_enabled: true,
        auto_detect_url_patterns_configured: false,
        rawUrlWhitelistPattern: "https://private.example/*",
        accountUrl: "https://private.example/account",
        apiKey: "private-api-key",
      },
    )

    expect(sanitized).toEqual({
      setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AccountBehaviorSnapshot,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      auto_provision_key_on_account_add_enabled: true,
      auto_fill_current_site_url_on_account_add_enabled: false,
      url_whitelist_enabled: true,
      url_whitelist_patterns_configured: true,
      url_whitelist_account_urls_enabled: false,
      url_whitelist_checkin_redeem_urls_enabled: true,
      auto_detect_url_patterns_configured: false,
    })
  })

  it("keeps broad settings snapshot dimensions and strips configured secrets", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.WebDavConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        configured: true,
        auto_sync_enabled: true,
        backup_encryption_enabled: true,
        sync_strategy: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
        sync_interval_bucket: PRODUCT_ANALYTICS_MODE_IDS.RefreshIntervalOneTo6h,
        sync_accounts_enabled: true,
        sync_bookmarks_enabled: false,
        sync_api_profiles_enabled: true,
        sync_preferences_enabled: false,
        url: "https://dav.example/private",
        username: "private-user",
        password: "private-password",
        backupEncryptionPassword: "private-encryption-password",
      },
    )

    expect(sanitized).toEqual({
      setting_id: PRODUCT_ANALYTICS_SETTING_IDS.WebDavConfigSnapshot,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      configured: true,
      auto_sync_enabled: true,
      backup_encryption_enabled: true,
      sync_strategy: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
      sync_interval_bucket: PRODUCT_ANALYTICS_MODE_IDS.RefreshIntervalOneTo6h,
      sync_accounts_enabled: true,
      sync_bookmarks_enabled: false,
      sync_api_profiles_enabled: true,
      sync_preferences_enabled: false,
    })
  })

  it("drops uncontrolled Managed Site Model Sync setting ids", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      {
        setting_id: "managed_site_model_sync_private_custom_field",
        enabled: true,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      },
    )

    expect(sanitized).toEqual({
      enabled: true,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("keeps Auto Check-in config snapshot strategy dimensions without raw settings", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        global_enabled: true,
        ui_pretrigger_enabled: true,
        notify_completion_enabled: false,
        retry_enabled: true,
        schedule_mode: PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES.Random,
        retry_interval_bucket:
          PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_INTERVAL_BUCKETS.TenTo30m,
        retry_max_attempts_bucket:
          PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS.TwoToThree,
        window_length_bucket:
          PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS.FourTo12h,
        deterministic_time_bucket:
          PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS.Unset,
        windowStart: "09:15",
        windowEnd: "18:45",
        deterministicTime: "10:30",
        retryIntervalMinutes: 15,
        retryMaxAttemptsPerDay: 3,
        accountId: "private-account-id",
        siteUrl: "https://private.example",
      },
    )

    expect(sanitized).toEqual({
      setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      global_enabled: true,
      ui_pretrigger_enabled: true,
      notify_completion_enabled: false,
      retry_enabled: true,
      schedule_mode: PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES.Random,
      retry_interval_bucket:
        PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_INTERVAL_BUCKETS.TenTo30m,
      retry_max_attempts_bucket:
        PRODUCT_ANALYTICS_AUTO_CHECKIN_RETRY_ATTEMPT_BUCKETS.TwoToThree,
      window_length_bucket:
        PRODUCT_ANALYTICS_AUTO_CHECKIN_WINDOW_LENGTH_BUCKETS.FourTo12h,
      deterministic_time_bucket:
        PRODUCT_ANALYTICS_AUTO_CHECKIN_DETERMINISTIC_TIME_BUCKETS.Unset,
    })
  })

  it("drops uncontrolled Auto Check-in config snapshot dimensions", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        global_enabled: true,
        schedule_mode: "custom-private-mode",
        retry_interval_bucket: "15",
        retry_max_attempts_bucket: "99",
        window_length_bucket: "09:00-18:00",
        deterministic_time_bucket: "10:30",
      },
    )

    expect(sanitized).toEqual({
      setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      global_enabled: true,
    })
  })

  it("keeps managed-site channel analytics dimensions as fixed enums and buckets", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.MigrateManagedSiteChannels,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
        source_managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Veloera,
        target_managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.DoneHub,
        failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Preview,
        editor_mode: PRODUCT_ANALYTICS_EDITOR_MODES.Json,
        warning_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.One,
        ready_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.FourToTen,
        blocked_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.TwoToThree,
        sourceSiteUrl: "https://source.example",
        targetSiteUrl: "https://target.example",
        channelName: "Production channel",
        rawWarningCount: 7,
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.MigrateManagedSiteChannels,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
      source_managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.Veloera,
      target_managed_site_type: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.DoneHub,
      failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Preview,
      editor_mode: PRODUCT_ANALYTICS_EDITOR_MODES.Json,
      warning_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.One,
      ready_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.FourToTen,
      blocked_count_bucket: PRODUCT_ANALYTICS_COUNT_BUCKETS.TwoToThree,
    })
  })

  it("drops raw managed-site channel values that are not fixed enums or buckets", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.UpdateManagedSiteChannel,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        managed_site_type: "private-fork",
        source_managed_site_type: "https://source.example",
        target_managed_site_type: "target-production",
        failure_stage: "validation:missing token",
        editor_mode: "json-with-secret",
        warning_count_bucket: "7",
        ready_count_bucket: 3,
        blocked_count_bucket: "all-blocked",
        sourceSiteUrl: "https://source.example",
        targetSiteUrl: "https://target.example",
        channelName: "Production channel",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.UpdateManagedSiteChannel,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
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

  it("keeps API credential profile profile-source and telemetry mode enums without raw details", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
        action_id:
          PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateApiCredentialProfileDialog,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesDialog,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        source_kind:
          PRODUCT_ANALYTICS_SOURCE_KINDS.ApiCredentialProfileManualOptions,
        api_type: PRODUCT_ANALYTICS_API_TYPES.OpenAiCompatible,
        mode: PRODUCT_ANALYTICS_MODE_IDS.TelemetryCustomReadOnlyEndpoint,
        telemetry_source:
          PRODUCT_ANALYTICS_TELEMETRY_SOURCES.CustomReadOnlyEndpoint,
        profileName: "Production profile",
        baseUrl: "https://private.example",
        apiKey: "sk-secret",
        telemetryEndpoint: "/private/usage?token=secret",
        customJsonPath: "data.private.balance",
        errorMessage: "backend returned sk-secret",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      action_id:
        PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateApiCredentialProfileDialog,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      source_kind:
        PRODUCT_ANALYTICS_SOURCE_KINDS.ApiCredentialProfileManualOptions,
      api_type: PRODUCT_ANALYTICS_API_TYPES.OpenAiCompatible,
      mode: PRODUCT_ANALYTICS_MODE_IDS.TelemetryCustomReadOnlyEndpoint,
      telemetry_source:
        PRODUCT_ANALYTICS_TELEMETRY_SOURCES.CustomReadOnlyEndpoint,
    })
  })

  it("drops uncontrolled API credential profile dimensions", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
        action_id: "open_profile_named_production",
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesDialog,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        source_kind: "manual:production",
        mode: "https://private.example/usage",
        telemetry_source: "privateUsageEndpoint",
        apiKey: "sk-secret",
        profileId: "profile-private-id",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesDialog,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
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
