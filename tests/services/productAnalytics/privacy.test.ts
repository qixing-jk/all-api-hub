import { describe, expect, it } from "vitest"

import {
  AUTO_DETECT_FETCH_CONTEXT_KINDS,
  AUTO_DETECT_STRATEGIES,
} from "~/constants/autoDetect"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FAILURE_REASONS,
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_API_TYPES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES,
  PRODUCT_ANALYTICS_EDITOR_MODES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_PAGE_IDS,
  PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS,
  PRODUCT_ANALYTICS_PERMISSION_OPERATIONS,
  PRODUCT_ANALYTICS_PERMISSION_OUTCOMES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  PRODUCT_ANALYTICS_SORT_FIELDS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS,
  PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES,
  PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  PRODUCT_ANALYTICS_TARGET_STATES,
  PRODUCT_ANALYTICS_TELEMETRY_SOURCES,
} from "~/services/productAnalytics/events"
import { sanitizeProductAnalyticsEvent } from "~/services/productAnalytics/privacy"
import { AuthTypeEnum } from "~/types"

describe("product analytics privacy filtering", () => {
  it("keeps whitelisted PageViewed properties and strips unknown keys", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.PageViewed,
      {
        page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsOverview,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        accountName: "Secret Account",
        domain: "example.com",
      },
    )

    expect(sanitized).toEqual({
      page_id: PRODUCT_ANALYTICS_PAGE_IDS.OptionsOverview,
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
        duration_ms: 2000,
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
      duration_ms: 2000,
    })
  })

  it("keeps safe sponsor recommendation fields and drops unsafe sponsor details", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.SponsorRecommendations,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenSponsorProvider,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementAddAccountSponsorRecommendations,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        item_count: 3,
        sponsor_action_kind:
          PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS.VisitProvider,
        sponsor_catalog_source:
          PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES.Remote,
        sponsor_id: "example-sponsor",
        sponsor_rank: 1,
        sponsor_support_status:
          PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES.Supported,
        sponsor_supported_count: 1,
        sponsor_unsupported_count: 0,
        sponsor_catalog_schema_version: 4,
        sponsor_campaign_locale: "en",
        sponsor_action_availability: "bookmark,api",
        sponsor_name: "Example Sponsor",
        sponsor_url: "https://provider.example.invalid/register",
        sponsor_note: "Use promo code all-api-hub.",
        sponsor_campaign_url: "https://campaign.example.invalid/signup",
        sponsor_api_base_url: "https://api.example.invalid/v1",
        promo_code: "all-api-hub",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.SponsorRecommendations,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenSponsorProvider,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementAddAccountSponsorRecommendations,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      item_count: 3,
      sponsor_action_kind: PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS.VisitProvider,
      sponsor_catalog_source: PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES.Remote,
      sponsor_rank: 1,
      sponsor_support_status:
        PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES.Supported,
      sponsor_supported_count: 1,
      sponsor_unsupported_count: 0,
      sponsor_catalog_schema_version: 4,
      sponsor_campaign_locale: "en",
      sponsor_action_availability: "bookmark,api",
    })
    expect(sanitized).not.toHaveProperty("sponsor_id")
    expect(sanitized).not.toHaveProperty("sponsor_campaign_url")
    expect(sanitized).not.toHaveProperty("sponsor_api_base_url")
  })

  it.each([
    "none",
    "add-account",
    "bookmark",
    "api",
    "add-account,bookmark",
    "add-account,api",
    "bookmark,api",
    "add-account,bookmark,api",
  ])("keeps controlled sponsor action availability %s", (availability) => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.SponsorRecommendations,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenSponsorProvider,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        sponsor_action_availability: availability,
      },
    )

    expect(sanitized).toMatchObject({
      sponsor_action_availability: availability,
    })
  })

  it.each(["api,bookmark", "add-account,api,bookmark", "custom"])(
    "drops uncontrolled sponsor action availability %s",
    (availability) => {
      const sanitized = sanitizeProductAnalyticsEvent(
        PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
        {
          feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.SponsorRecommendations,
          action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenSponsorProvider,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          result: PRODUCT_ANALYTICS_RESULTS.Success,
          sponsor_action_availability: availability,
        },
      )

      expect(sanitized).not.toHaveProperty("sponsor_action_availability")
    },
  )

  it("keeps safe product announcement fields and drops remote copy", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnnouncements,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenProductAnnouncements,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsProductAnnouncementsHeader,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        product_announcement_id: "2026-06-risk",
        product_announcement_severity: "critical",
        product_announcement_action_kind: "open_list",
        product_announcement_active_count: 2,
        product_announcement_title: "Private remote title",
        product_announcement_message: "Remote body",
        product_announcement_url:
          "https://github.com/qixing-jk/all-api-hub/releases/tag/v3.44.1",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnnouncements,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenProductAnnouncements,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsProductAnnouncementsHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      product_announcement_id: "2026-06-risk",
      product_announcement_severity: "critical",
      product_announcement_action_kind: "open_list",
      product_announcement_active_count: 2,
    })
  })

  it("keeps safe product announcement restore fields", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnnouncements,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RestoreProductAnnouncement,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsProductAnnouncementsHeader,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        product_announcement_id: "2026-06-risk",
        product_announcement_severity: "warning",
        product_announcement_action_kind: "restore",
        product_announcement_active_count: 0,
        product_announcement_title: "Private remote title",
        product_announcement_message: "Remote body",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ProductAnnouncements,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.RestoreProductAnnouncement,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsProductAnnouncementsHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      product_announcement_id: "2026-06-risk",
      product_announcement_severity: "warning",
      product_announcement_action_kind: "restore",
      product_announcement_active_count: 0,
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
        duration_ms: 500,
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
      duration_ms: 500,
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
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokensToApiCredentialProfiles,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementPage,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      errorCategory: undefined,
    },
    {
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyAccountTokenApi,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      errorCategory: undefined,
    },
    {
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.VerifyAccountTokenCliSupport,
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
          duration_ms: 2000,
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
        duration_ms: 2000,
      })
    },
  )

  it("keeps controlled action insight counts while dropping sensitive source values", () => {
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
        item_count: 3,
        selected_count: 1,
        filter_count: 2,
        result_count: 8,
        success_count: 1,
        failure_count: 1,
        skipped_count: 1,
        target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.ModelFilter,
        target_state: PRODUCT_ANALYTICS_TARGET_STATES.Enabled,
        telemetry_source: PRODUCT_ANALYTICS_TELEMETRY_SOURCES.NewApiTokenUsage,
        usage_data_present: true,
        target_value: "private-provider",
        source_url: "https://private.example/path",
        sourceText: "sk-secret",
        selected_count_label: "2_3",
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
      item_count: 3,
      selected_count: 1,
      filter_count: 2,
      result_count: 8,
      success_count: 1,
      failure_count: 1,
      skipped_count: 1,
      target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.ModelFilter,
      target_state: PRODUCT_ANALYTICS_TARGET_STATES.Enabled,
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
        sync_interval_minutes: 120,
        concurrency: 6,
        retry_max_attempts: 4,
        rate_limit_rpm: 90,
        rate_limit_burst: 12,
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
      sync_interval_minutes: 120,
      concurrency: 6,
      retry_max_attempts: 4,
      rate_limit_rpm: 90,
      rate_limit_burst: 12,
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
        setting_id: "app_preferences_snapshot",
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        theme_mode: "dark",
        normalized_language: "zh-TW",
        toolbar_action_click_behavior: "sidepanel",
        open_changelog_on_update_enabled: false,
        rawLanguage: "zh-Hant-TW-private",
        accountName: "private account",
        url: "https://private.example/settings",
      },
    )

    expect(sanitized).toEqual({
      setting_id: "app_preferences_snapshot",
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      theme_mode: "dark",
      normalized_language: "zh-TW",
      toolbar_action_click_behavior: "sidepanel",
      open_changelog_on_update_enabled: false,
    })
  })

  it("keeps options-page toolbar behavior values", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
      {
        toolbar_action_click_behavior: "options",
      },
    )

    expect(sanitized).toEqual({
      toolbar_action_click_behavior: "options",
    })
  })

  it("keeps WebDAV settings snapshot fields and strips configured secrets", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.WebDavConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        configured: true,
        auto_sync_enabled: true,
        backup_encryption_enabled: true,
        sync_strategy: PRODUCT_ANALYTICS_MODE_IDS.WebDavDownloadOnly,
        sync_interval_minutes: 120,
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
      sync_interval_minutes: 120,
      sync_accounts_enabled: true,
      sync_bookmarks_enabled: false,
      sync_api_profiles_enabled: true,
      sync_preferences_enabled: false,
    })
  })

  it("keeps task notification settings snapshot fields and strips configured secrets", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SettingChanged,
      {
        setting_id:
          PRODUCT_ANALYTICS_SETTING_IDS.TaskNotificationsConfigSnapshot,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        enabled: true,
        browser_channel_enabled: true,
        telegram_channel_enabled: true,
        feishu_channel_enabled: false,
        dingtalk_channel_enabled: false,
        wecom_channel_enabled: false,
        ntfy_channel_enabled: true,
        webhook_channel_enabled: true,
        auto_checkin_task_enabled: true,
        webdav_auto_sync_task_enabled: true,
        managed_site_model_sync_task_enabled: true,
        usage_history_sync_task_enabled: false,
        balance_history_capture_task_enabled: false,
        site_announcements_task_enabled: true,
        third_party_channel_count: 3,
        task_enabled_count: 4,
        telegramBotToken: "private-bot-token",
        telegramChatId: "private-chat",
        ntfyTopicUrl: "https://ntfy.example/topic",
        ntfyAccessToken: "private-ntfy-token",
        webhookUrl: "https://webhook.example/private",
      },
    )

    expect(sanitized).toEqual({
      setting_id: PRODUCT_ANALYTICS_SETTING_IDS.TaskNotificationsConfigSnapshot,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      enabled: true,
      browser_channel_enabled: true,
      telegram_channel_enabled: true,
      feishu_channel_enabled: false,
      dingtalk_channel_enabled: false,
      wecom_channel_enabled: false,
      ntfy_channel_enabled: true,
      webhook_channel_enabled: true,
      auto_checkin_task_enabled: true,
      webdav_auto_sync_task_enabled: true,
      managed_site_model_sync_task_enabled: true,
      usage_history_sync_task_enabled: false,
      balance_history_capture_task_enabled: false,
      site_announcements_task_enabled: true,
      third_party_channel_count: 3,
      task_enabled_count: 4,
    })
  })

  it("keeps aggregate settings snapshot fields with reviewed sensitive-looking names", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
      {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        balance_history_estimated_today_income_enabled: true,
        webdav_sync_accounts_enabled: true,
        webdav_sync_api_profiles_enabled: true,
        active_tab: "balance",
        currency_type: "CNY",
        show_today_cashflow_enabled: false,
        sort_field: "income",
        sort_order: "asc",
        sorting_priority_configured: true,
        sorting_priority_customized: true,
        sorting_priority_enabled_criteria_count: 4,
        console_logging_enabled: false,
        log_level: "warn",
        estimated_today_income_enabled: true,
        auto_detect_enhanced_enabled: true,
        reminder_dismissed: true,
        task_notifications_balance_history_capture_task_enabled: false,
        webdavUrl: "https://dav.example/private",
        apiProfileName: "private profile",
        accountName: "private account",
      },
    )

    expect(sanitized).toEqual({
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      balance_history_estimated_today_income_enabled: true,
      webdav_sync_accounts_enabled: true,
      webdav_sync_api_profiles_enabled: true,
      active_tab: "balance",
      currency_type: "CNY",
      show_today_cashflow_enabled: false,
      sort_field: "income",
      sort_order: "asc",
      sorting_priority_configured: true,
      sorting_priority_customized: true,
      sorting_priority_enabled_criteria_count: 4,
      console_logging_enabled: false,
      log_level: "warn",
      estimated_today_income_enabled: true,
      auto_detect_enhanced_enabled: true,
      reminder_dismissed: true,
      task_notifications_balance_history_capture_task_enabled: false,
    })
  })

  it("keeps the cleared sort sentinel in settings snapshots", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
      {
        setting_id: "display_preferences_snapshot",
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        sort_field: PRODUCT_ANALYTICS_SORT_FIELDS.None,
      },
    )

    expect(sanitized).toEqual({
      setting_id: "display_preferences_snapshot",
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      sort_field: PRODUCT_ANALYTICS_SORT_FIELDS.None,
    })
  })

  it("keeps permission operation outcome fields without raw permission context", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.PermissionResult,
      {
        permission_id: "clipboardRead",
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.Denied,
        failure_reason: PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.UserDenied,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        permissionPromptText: "private browser prompt text",
        errorMessage: "private browser error",
        url: "https://private.example/settings",
      },
    )

    expect(sanitized).toEqual({
      permission_id: "clipboardRead",
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
      outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.Denied,
      failure_reason: PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.UserDenied,
      was_granted_before: false,
      was_granted_after: false,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("keeps permission failure reasons event-scoped from action completion reasons", () => {
    expect(
      sanitizeProductAnalyticsEvent(PRODUCT_ANALYTICS_EVENTS.PermissionResult, {
        permission_id: "clipboardRead",
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
        outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.Denied,
        failure_reason: PRODUCT_ANALYTICS_FAILURE_REASONS.SessionExpired,
        was_granted_before: false,
        was_granted_after: false,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).toEqual({
      permission_id: "clipboardRead",
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      operation: PRODUCT_ANALYTICS_PERMISSION_OPERATIONS.Request,
      outcome: PRODUCT_ANALYTICS_PERMISSION_OUTCOMES.Denied,
      was_granted_before: false,
      was_granted_after: false,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    expect(
      sanitizeProductAnalyticsEvent(
        PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
        {
          feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
          action_id: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          failure_reason:
            PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS.UserDenied,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        },
      ),
    ).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    })
  })

  it("keeps account auto-detect failure reasons without raw diagnostic context", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
        failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
        account_auto_detect_failure_reason:
          PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FAILURE_REASONS.CurrentTabContentScriptUnavailable,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        url: "https://private.example.com",
        errorMessage: "private backend error",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
      failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Detection,
      account_auto_detect_failure_reason:
        PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FAILURE_REASONS.CurrentTabContentScriptUnavailable,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("keeps action completion diagnostics and rejects raw failure reason strings", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
        error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
        failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
        failure_reason: PRODUCT_ANALYTICS_FAILURE_REASONS.SessionExpired,
        cache_hit: false,
        cache_used: true,
        fallback_available: true,
        fallback_used: false,
        retry_attempted: true,
        retry_count: 2,
        stale_response_ignored: true,
        background_execution: true,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        backend_message: "session expired for account alice",
        raw_failure_reason: "private backend text",
        account_name: "Alice",
        url: "https://private.example.com",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteModelSyncActionBar,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      error_category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
      failure_stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
      failure_reason: PRODUCT_ANALYTICS_FAILURE_REASONS.SessionExpired,
      cache_hit: false,
      cache_used: true,
      fallback_available: true,
      fallback_used: false,
      retry_attempted: true,
      retry_count: 2,
      stale_response_ignored: true,
      background_execution: true,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    })

    expect(
      sanitizeProductAnalyticsEvent(
        PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
        {
          feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
          action_id: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          retry_attempted: 999,
          retry_count: 2,
          failure_reason: "session expired for account alice",
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        },
      ),
    ).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteModelSync,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteModels,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      retry_count: 2,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
    })
  })

  it("keeps Options Overview navigation targets without raw route params", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenOptionsOverviewTarget,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewAttentionList,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
        target_page_id: MENU_ITEM_IDS.ACCOUNT,
        route_params_present: true,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        search: "private account search",
        anchor: "private-anchor",
        highlight: "private-highlight",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.OptionsOverview,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.OpenOptionsOverviewTarget,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsOverviewAttentionList,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      target_kind: PRODUCT_ANALYTICS_TARGET_KINDS.OptionsPage,
      target_page_id: MENU_ITEM_IDS.ACCOUNT,
      route_params_present: true,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("keeps controlled account auto-detect context without raw diagnostic context", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect,
        surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        requested_auth_mode: AuthTypeEnum.Cookie,
        auto_detect_strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
        site_type: SITE_TYPES.NEW_API,
        fetch_context_kind: AUTO_DETECT_FETCH_CONTEXT_KINDS.CurrentTab,
        incognito_context_used: true,
        current_tab_matched: true,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        requestedAuthToken: "private-token",
        rawOrigin: "https://private.example.com",
        cookieStoreId: "private-store",
        tabId: 123,
        auto_detect_strategy_raw: "private-current-tab",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      action_id: PRODUCT_ANALYTICS_ACTION_IDS.RunAccountAutoDetect,
      surface_id: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementPage,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      requested_auth_mode: AuthTypeEnum.Cookie,
      auto_detect_strategy: AUTO_DETECT_STRATEGIES.CurrentTab,
      site_type: SITE_TYPES.NEW_API,
      fetch_context_kind: AUTO_DETECT_FETCH_CONTEXT_KINDS.CurrentTab,
      incognito_context_used: true,
      current_tab_matched: true,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("keeps reviewed aggregate settings snapshot fields with sensitive-looking names", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
      {
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        account_auto_refresh_enabled: true,
        account_auto_refresh_on_open_enabled: false,
        account_auto_refresh_interval_minutes: 120,
        account_auto_refresh_min_interval_seconds: 3600,
        balance_history_enabled: true,
        balance_history_end_of_day_capture_enabled: true,
        balance_history_retention_days: 365,
        managed_site_model_sync_enabled: true,
        managed_site_model_sync_interval_minutes: 720,
        managed_site_model_sync_concurrency: 2,
        managed_site_model_sync_retry_max_attempts: 3,
        managed_site_model_sync_channel_timeout_seconds: 10,
        managed_site_model_sync_rate_limit_rpm: 60,
        managed_site_model_sync_rate_limit_burst: 6,
        managed_site_model_sync_allowed_models_configured: true,
        managed_site_model_sync_global_filters_configured: true,
        redemption_assist_allowlist_account_urls_enabled: true,
        redemption_assist_allowlist_checkin_redeem_urls_enabled: false,
        accountName: "Private account",
        balanceAmount: "123.45",
        configuredUrl: "https://private.example",
      },
    )

    expect(sanitized).toEqual({
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      account_auto_refresh_enabled: true,
      account_auto_refresh_on_open_enabled: false,
      account_auto_refresh_interval_minutes: 120,
      account_auto_refresh_min_interval_seconds: 3600,
      balance_history_enabled: true,
      balance_history_end_of_day_capture_enabled: true,
      balance_history_retention_days: 365,
      managed_site_model_sync_enabled: true,
      managed_site_model_sync_interval_minutes: 720,
      managed_site_model_sync_concurrency: 2,
      managed_site_model_sync_retry_max_attempts: 3,
      managed_site_model_sync_channel_timeout_seconds: 10,
      managed_site_model_sync_rate_limit_rpm: 60,
      managed_site_model_sync_rate_limit_burst: 6,
      managed_site_model_sync_allowed_models_configured: true,
      managed_site_model_sync_global_filters_configured: true,
      redemption_assist_allowlist_account_urls_enabled: true,
      redemption_assist_allowlist_checkin_redeem_urls_enabled: false,
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
        retry_interval_minutes: 15,
        retry_max_attempts: 3,
        window_length_minutes: 570,
        deterministic_time_minutes: 0,
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
      retry_interval_minutes: 15,
      retry_max_attempts: 3,
      window_length_minutes: 570,
      deterministic_time_minutes: 0,
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
        retry_interval_label: "15m",
        retry_max_attempts_label: "99",
        window_length_label: "09:00-18:00",
        deterministic_time_label: "10:30",
      },
    )

    expect(sanitized).toEqual({
      setting_id: PRODUCT_ANALYTICS_SETTING_IDS.AutoCheckinConfigSnapshot,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      global_enabled: true,
    })
  })

  it("keeps Auto Check-in run summaries with raw aggregate numbers only", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.AutoCheckinRunSummaryCaptured,
      {
        run_kind: "daily",
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        total_accounts: 12,
        detection_enabled_accounts: 10,
        auto_checkin_enabled_accounts: 9,
        provider_available_accounts: 8,
        runnable_accounts: 7,
        success_count: 5,
        failed_count: 2,
        skipped_count: 3,
        retry_enabled: true,
        retry_pending_before: 0,
        retry_attempted: 0,
        retry_rescued: 0,
        retry_pending_after: 2,
        retry_exhausted: 0,
        accountId: "private-account-id",
        accountName: "private account",
        siteUrl: "https://private.example",
        rawMessage: "private backend error",
      },
    )

    expect(sanitized).toEqual({
      run_kind: "daily",
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      total_accounts: 12,
      detection_enabled_accounts: 10,
      auto_checkin_enabled_accounts: 9,
      provider_available_accounts: 8,
      runnable_accounts: 7,
      success_count: 5,
      failed_count: 2,
      skipped_count: 3,
      retry_enabled: true,
      retry_pending_before: 0,
      retry_attempted: 0,
      retry_rescued: 0,
      retry_pending_after: 2,
      retry_exhausted: 0,
    })
  })

  it("keeps Auto Check-in account group summaries with fixed dimensions and raw numbers", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.AutoCheckinAccountGroupCaptured,
      {
        run_kind: "retry",
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        site_type: "new-api",
        requested_auth_mode: "access_token",
        skip_reason: "provider_not_ready",
        total_accounts: 4,
        runnable_accounts: 2,
        success_count: 1,
        failed_count: 1,
        skipped_count: 2,
        unknown_dimension: "private",
        retry_attempted: 999,
        retryRescued: 999,
      },
    )

    expect(sanitized).toEqual({
      run_kind: "retry",
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      site_type: "new-api",
      requested_auth_mode: "access_token",
      skip_reason: "provider_not_ready",
      total_accounts: 4,
      runnable_accounts: 2,
      success_count: 1,
      failed_count: 1,
      skipped_count: 2,
    })
  })

  it("keeps managed-site channel analytics dimensions as fixed enums and counts", () => {
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
        warning_count_label: "1",
        ready_count: 7,
        blocked_count: 3,
        sourceSiteUrl: "https://source.example",
        targetSiteUrl: "https://target.example",
        channelName: "Production channel",
        rawWarningCount: 7,
        warning_count: 1,
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
      warning_count: 1,
      ready_count: 7,
      blocked_count: 3,
    })
  })

  it("drops raw managed-site channel values and invalid counts", () => {
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
        warning_count: -1,
        ready_count: 1.5,
        blocked_count: Number.MAX_SAFE_INTEGER + 1,
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
        model_count: 7,
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
      model_count: 7,
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
        duration_ms: 1,
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
      duration_ms: 1,
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

  it("keeps shield bypass daily summary counts while dropping request details", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.ShieldBypassSummaryCaptured,
      {
        feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ShieldBypassAssist,
        action_id: PRODUCT_ANALYTICS_ACTION_IDS.SummarizeShieldBypassDaily,
        surface_id:
          PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundShieldBypassTempContext,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        shield_bypass_prompt_shown_count: 11,
        shield_bypass_prompt_dismissed_count: 2,
        shield_bypass_settings_visited_count: 1,
        temp_window_fetch_success_count: 6,
        temp_window_fetch_failure_count: 1,
        temp_window_turnstile_fetch_success_count: 0,
        temp_window_turnstile_fetch_failure_count: 6,
        fetchUrl: "https://private.example/api/checkin?token=secret",
      },
    )

    expect(sanitized).toEqual({
      feature_id: PRODUCT_ANALYTICS_FEATURE_IDS.ShieldBypassAssist,
      surface_id:
        PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundShieldBypassTempContext,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Background,
      shield_bypass_prompt_shown_count: 11,
      shield_bypass_prompt_dismissed_count: 2,
      shield_bypass_settings_visited_count: 1,
      temp_window_fetch_success_count: 6,
      temp_window_fetch_failure_count: 1,
      temp_window_turnstile_fetch_success_count: 0,
      temp_window_turnstile_fetch_failure_count: 6,
    })
  })

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

  it("keeps site ecosystem snapshot count fields only", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SiteEcosystemSnapshot,
      {
        total_account_count: 6,
        distinct_site_count: 2,
        known_site_type_count: 1,
        unknown_site_count: 0,
        managed_site_count: 2,
        site_url: "https://private.example",
        hostname: "private.example",
      },
    )

    expect(sanitized).toEqual({
      total_account_count: 6,
      distinct_site_count: 2,
      known_site_type_count: 1,
      unknown_site_count: 0,
      managed_site_count: 2,
    })
  })

  it("keeps site type count field despite forbidden key pattern", () => {
    const sanitized = sanitizeProductAnalyticsEvent(
      PRODUCT_ANALYTICS_EVENTS.SiteTypePresent,
      {
        site_type: SITE_TYPES.NEW_API,
        account_count: 2,
        accountName: "Secret Account",
        domain: "private.example",
        url: "https://private.example/account",
      },
    )

    expect(sanitized).toEqual({
      site_type: SITE_TYPES.NEW_API,
      account_count: 2,
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
          account_count: 1,
          url: "https://private.example/account",
        },
      )

      expect(sanitized).toEqual({
        site_type: siteType,
        account_count: 1,
      })
    },
  )
})
