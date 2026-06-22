import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_API_TYPES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_RUN_KINDS,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES,
  PRODUCT_ANALYTICS_AUTO_CHECKIN_SKIP_REASONS,
  PRODUCT_ANALYTICS_EDITOR_MODES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_SETTING_IDS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  trackProductAnalyticsEvent,
} from "~/services/productAnalytics/events"
import { ProductAnalyticsMessageTypes } from "~/services/productAnalytics/messaging"

const { sendProductAnalyticsMessageMock } = vi.hoisted(() => ({
  sendProductAnalyticsMessageMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/messaging", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/productAnalytics/messaging")
  >()),
  sendProductAnalyticsMessage: sendProductAnalyticsMessageMock,
}))

beforeEach(() => {
  vi.clearAllMocks()
  sendProductAnalyticsMessageMock.mockResolvedValue({ success: true })
})

describe("product analytics event enums", () => {
  it("does not expose generic product action ids", () => {
    const disallowedActionIds = new Set([
      "open",
      "create",
      "update",
      "delete",
      "refresh",
      "sync",
      "toggle",
      "copy",
      "verify",
      "run",
      "import",
      "export",
      "request",
    ])

    expect(
      Object.values(PRODUCT_ANALYTICS_ACTION_IDS).filter((actionId) =>
        disallowedActionIds.has(actionId),
      ),
    ).toEqual([])
  })

  it("defines fixed action ids for third-party export and import flows", () => {
    expect(PRODUCT_ANALYTICS_ACTION_IDS).toMatchObject({
      ExportAccountTokenToCherryStudio: "export_account_token_to_cherry_studio",
      ExportAccountTokenToCCSwitch: "export_account_token_to_cc_switch",
      ExportAccountTokenToCliProxy: "export_account_token_to_cli_proxy",
      ExportAccountTokensToCliProxy: "export_account_tokens_to_cli_proxy",
      ExportAccountTokenToClaudeCodeRouter:
        "export_account_token_to_claude_code_router",
      CopyKiloCodeAccountExportConfig: "copy_kilo_code_account_export_config",
      ExportKiloCodeAccountSettingsFile:
        "export_kilo_code_account_settings_file",
      ExportApiCredentialProfileToCherryStudio:
        "export_api_credential_profile_to_cherry_studio",
      ExportApiCredentialProfileToCCSwitch:
        "export_api_credential_profile_to_cc_switch",
      ImportApiCredentialProfileToCliProxy:
        "import_api_credential_profile_to_cli_proxy",
      ImportApiCredentialProfileToClaudeCodeRouter:
        "import_api_credential_profile_to_claude_code_router",
      ImportManagedSiteSingleToken: "import_managed_site_single_token",
    })
  })

  it("defines fixed surface ids for third-party export and managed-site single import surfaces", () => {
    expect(PRODUCT_ANALYTICS_SURFACE_IDS).toMatchObject({
      AccountTokenThirdPartyExportDialog:
        "account_token_third_party_export_dialog",
      OptionsAccountTokenKiloCodeExportDialog:
        "options_account_token_kilo_code_export_dialog",
    })
  })

  it("defines fixed feature, action, and surface ids for Key Management", () => {
    expect(PRODUCT_ANALYTICS_FEATURE_IDS).toMatchObject({
      KeyManagement: "key_management",
    })

    expect(PRODUCT_ANALYTICS_ACTION_IDS).toMatchObject({
      RefreshAccountTokens: "refresh_account_tokens",
      CreateAccountToken: "create_account_token",
      UpdateAccountToken: "update_account_token",
      DeleteAccountToken: "delete_account_token",
      CopyAccountTokenKey: "copy_account_token_key",
      RevealAccountTokenKey: "reveal_account_token_key",
      RepairMissingAccountKeys: "repair_missing_account_keys",
      SaveAccountTokenToApiCredentialProfile:
        "save_account_token_to_api_credential_profile",
      SaveAccountTokensToApiCredentialProfiles:
        "save_account_tokens_to_api_credential_profiles",
      RefreshManagedSiteTokenStatus: "refresh_managed_site_token_status",
      RetryManagedSiteTokenVerification:
        "retry_managed_site_token_verification",
    })

    expect(PRODUCT_ANALYTICS_SURFACE_IDS).toMatchObject({
      OptionsKeyManagementPage: "options_key_management_page",
      OptionsKeyManagementHeader: "options_key_management_header",
      OptionsKeyManagementRowActions: "options_key_management_row_actions",
      OptionsKeyManagementDialog: "options_key_management_dialog",
      OptionsKeyManagementRepairDialog: "options_key_management_repair_dialog",
    })
  })

  it("defines fixed API credential profile analytics action ids", () => {
    expect(PRODUCT_ANALYTICS_ACTION_IDS).toMatchObject({
      OpenCreateApiCredentialProfileDialog:
        "open_create_api_credential_profile_dialog",
      OpenUpdateApiCredentialProfileDialog:
        "open_update_api_credential_profile_dialog",
      FilterApiCredentialProfiles: "filter_api_credential_profiles",
      ClearApiCredentialProfileFilters: "clear_api_credential_profile_filters",
      SelectApiCredentialProfileExportDestination:
        "select_api_credential_profile_export_destination",
      SnapshotApiCredentialProfiles: "snapshot_api_credential_profiles",
    })
  })

  it("defines fixed API credential profile source and telemetry mode dimensions", () => {
    expect(PRODUCT_ANALYTICS_SOURCE_KINDS).toMatchObject({
      ApiCredentialProfileManualOptions:
        "api_credential_profile_manual_options",
      ApiCredentialProfileManualPopup: "api_credential_profile_manual_popup",
      ApiCredentialProfileContentApiCheck:
        "api_credential_profile_content_api_check",
      ApiCredentialProfileAccountToken: "api_credential_profile_account_token",
    })

    expect(PRODUCT_ANALYTICS_MODE_IDS).toMatchObject({
      TelemetryAuto: "telemetry_auto",
      TelemetryDisabled: "telemetry_disabled",
      TelemetryNewApiTokenUsage: "telemetry_new_api_token_usage",
      TelemetrySub2ApiUsage: "telemetry_sub2api_usage",
      TelemetryOpenAiBilling: "telemetry_openai_billing",
      TelemetryCustomReadOnlyEndpoint: "telemetry_custom_read_only_endpoint",
      StatusFilter: "status_filter",
    })

    expect(PRODUCT_ANALYTICS_API_TYPES).toMatchObject({
      OpenAiCompatible: "openai-compatible",
      OpenAi: "openai",
      Anthropic: "anthropic",
      Google: "google",
    })
  })

  it("defines fixed managed-site channel analytics dimensions", () => {
    expect(PRODUCT_ANALYTICS_MANAGED_SITE_TYPES).toMatchObject({
      NewApi: "new-api",
      Veloera: "Veloera",
      DoneHub: "done-hub",
      Octopus: "octopus",
      AxonHub: "axonhub",
      ClaudeCodeHub: "claude-code-hub",
    })

    expect(PRODUCT_ANALYTICS_FAILURE_STAGES).toMatchObject({
      Parse: "parse",
      Validation: "validation",
      Persist: "persist",
      Preview: "preview",
      Execute: "execute",
    })

    expect(PRODUCT_ANALYTICS_EDITOR_MODES).toMatchObject({
      Visual: "visual",
      Json: "json",
    })
  })

  it("defines fixed action completion failure reasons", () => {
    expect(PRODUCT_ANALYTICS_FAILURE_REASONS).toEqual({
      MissingCredentials: "missing_credentials",
      MissingSelection: "missing_selection",
      MissingConfig: "missing_config",
      FeatureDisabled: "feature_disabled",
      UnsupportedTarget: "unsupported_target",
      PermissionDenied: "permission_denied",
      PermissionUnavailable: "permission_unavailable",
      IncognitoBlocked: "incognito_blocked",
      AuthInvalid: "auth_invalid",
      SessionExpired: "session_expired",
      TokenSecretUnavailable: "token_secret_unavailable",
      NetworkUnreachable: "network_unreachable",
      Timeout: "timeout",
      RateLimited: "rate_limited",
      ServerError: "server_error",
      QuotaInsufficient: "quota_insufficient",
      ProviderBusinessError: "provider_business_error",
      InvalidJson: "invalid_json",
      InvalidResponseShape: "invalid_response_shape",
      ContentTypeMismatch: "content_type_mismatch",
      EmptyResponse: "empty_response",
      StorageReadFailed: "storage_read_failed",
      StorageWriteFailed: "storage_write_failed",
      CacheReadFailed: "cache_read_failed",
      CacheWriteFailed: "cache_write_failed",
      CancelledByUser: "cancelled_by_user",
      DuplicateDetected: "duplicate_detected",
      StaleResponseIgnored: "stale_response_ignored",
      PartialSuccess: "partial_success",
      Unknown: "unknown",
    })
  })

  it("defines fixed Managed Site Model Sync action ids", () => {
    expect(PRODUCT_ANALYTICS_ACTION_IDS).toMatchObject({
      SelectManagedSiteModelSyncTab: "select_managed_site_model_sync_tab",
      FilterManagedSiteModelSyncResults:
        "filter_managed_site_model_sync_results",
      SearchManagedSiteModelSyncChannels:
        "search_managed_site_model_sync_channels",
      SelectAllManagedSiteModelSyncChannels:
        "select_all_managed_site_model_sync_channels",
      OpenManagedSiteChannelManagement: "open_managed_site_channel_management",
      OpenManagedSiteModelSyncConfigRequired:
        "open_managed_site_model_sync_config_required",
      OpenManagedSiteModelSyncSettings: "open_managed_site_model_sync_settings",
      ScheduledManagedSiteModelSync: "scheduled_managed_site_model_sync",
      UpdateManagedSiteModelSyncSettings:
        "update_managed_site_model_sync_settings",
    })
  })

  it("defines fixed Managed Site Model Sync setting ids", () => {
    expect(PRODUCT_ANALYTICS_EVENTS).toMatchObject({
      SettingsSnapshotCaptured: "settings_snapshot_captured",
    })

    expect(PRODUCT_ANALYTICS_SETTING_IDS).toMatchObject({
      AccountBehaviorSnapshot: "account_behavior_snapshot",
      AutoRefreshConfigSnapshot: "auto_refresh_config_snapshot",
      UsageHistoryConfigSnapshot: "usage_history_config_snapshot",
      BalanceHistoryConfigSnapshot: "balance_history_config_snapshot",
      ManagedSiteConfigSnapshot: "managed_site_config_snapshot",
      ManagedSiteModelSyncConfigSnapshot:
        "managed_site_model_sync_config_snapshot",
      ModelRedirectConfigSnapshot: "model_redirect_config_snapshot",
      RedemptionAssistConfigSnapshot: "redemption_assist_config_snapshot",
      WebAiApiCheckConfigSnapshot: "web_ai_api_check_config_snapshot",
      TempWindowFallbackConfigSnapshot: "temp_window_fallback_config_snapshot",
      WebDavConfigSnapshot: "webdav_config_snapshot",
      TaskNotificationsConfigSnapshot: "task_notifications_config_snapshot",
      SiteAnnouncementsConfigSnapshot: "site_announcements_config_snapshot",
    })
  })

  it("defines fixed Auto Check-in setting ids and schedule dimensions", () => {
    expect(PRODUCT_ANALYTICS_SETTING_IDS).toMatchObject({
      AutoCheckinConfigSnapshot: "auto_checkin_config_snapshot",
    })

    expect(PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES).toMatchObject({
      Random: "random",
      Deterministic: "deterministic",
    })
  })

  it("defines fixed Options Overview navigation analytics ids", () => {
    expect(PRODUCT_ANALYTICS_FEATURE_IDS).toMatchObject({
      OptionsOverview: "options_overview",
    })

    expect(PRODUCT_ANALYTICS_ACTION_IDS).toMatchObject({
      OpenAutoCheckinAccountSetup: "open_auto_checkin_account_setup",
      OpenOptionsOverviewTarget: "open_options_overview_target",
      RefreshOptionsOverviewData: "refresh_options_overview_data",
    })

    expect(PRODUCT_ANALYTICS_SURFACE_IDS).toMatchObject({
      OptionsAutoCheckinEmptyState: "options_auto_checkin_empty_state",
      OptionsOverviewActionCenter: "options_overview_action_center",
      OptionsOverviewAttentionList: "options_overview_attention_list",
      OptionsOverviewAutomationOverview: "options_overview_automation_overview",
      OptionsOverviewRecentUsage: "options_overview_recent_usage",
      OptionsOverviewStatusSummary: "options_overview_status_summary",
    })
  })

  it("defines fixed Auto Check-in run analytics events and dimensions", () => {
    expect(PRODUCT_ANALYTICS_EVENTS).toMatchObject({
      AutoCheckinRunSummaryCaptured: "auto_checkin_run_summary_captured",
      AutoCheckinAccountGroupCaptured: "auto_checkin_account_group_captured",
    })
    expect(PRODUCT_ANALYTICS_AUTO_CHECKIN_RUN_KINDS).toMatchObject({
      Daily: "daily",
      Manual: "manual",
      Retry: "retry",
    })
    expect(PRODUCT_ANALYTICS_AUTO_CHECKIN_SKIP_REASONS).toMatchObject({
      AccountDisabled: "account_disabled",
      DetectionDisabled: "detection_disabled",
      AutoCheckinDisabled: "auto_checkin_disabled",
      NoProvider: "no_provider",
      ProviderNotReady: "provider_not_ready",
    })
  })

  it("defines fixed content-script analytics actions and dimensions", () => {
    expect(PRODUCT_ANALYTICS_ACTION_IDS).toMatchObject({
      ShowApiCredentialCheckModal: "show_api_credential_check_modal",
      AutoFetchApiCredentialModelList: "auto_fetch_api_credential_model_list",
      ShowRedemptionPrompt: "show_redemption_prompt",
      ShowRedemptionAccountSelect: "show_redemption_account_select",
      ShowRedemptionBatchResult: "show_redemption_batch_result",
      ShowShieldBypassPrompt: "show_shield_bypass_prompt",
    })

    expect(PRODUCT_ANALYTICS_SOURCE_KINDS).toMatchObject({
      ContextMenu: "context_menu",
      ClipboardEvent: "clipboard_event",
      CopyTargetClipboard: "copy_target_clipboard",
      Selection: "selection",
    })

    expect(PRODUCT_ANALYTICS_FAILURE_STAGES).toMatchObject({
      Detection: "detection",
      Prompt: "prompt",
      Permission: "permission",
    })
  })
})

describe("trackProductAnalyticsEvent", () => {
  it("forwards typed analytics events to the background runtime handler", async () => {
    await expect(
      trackProductAnalyticsEvent(
        PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
        {
          setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ProductAnalyticsEnabled,
          enabled: true,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        },
      ),
    ).resolves.toBe(true)

    expect(sendProductAnalyticsMessageMock).toHaveBeenCalledWith(
      ProductAnalyticsMessageTypes.TrackEvent,
      {
        eventName: PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured,
        properties: {
          setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ProductAnalyticsEnabled,
          enabled: true,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        },
      },
    )
  })

  it("does not wait for an in-flight background analytics response", async () => {
    let resolveDispatch!: (response: { success: boolean }) => void
    sendProductAnalyticsMessageMock.mockReturnValue(
      new Promise((resolve) => {
        resolveDispatch = resolve
      }),
    )

    await expect(
      trackProductAnalyticsEvent(PRODUCT_ANALYTICS_EVENTS.SettingChanged, {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ProductAnalyticsEnabled,
        enabled: true,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).resolves.toBe(true)

    expect(sendProductAnalyticsMessageMock).toHaveBeenCalledWith(
      ProductAnalyticsMessageTypes.TrackEvent,
      {
        eventName: PRODUCT_ANALYTICS_EVENTS.SettingChanged,
        properties: {
          setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ProductAnalyticsEnabled,
          enabled: true,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        },
      },
    )

    resolveDispatch({ success: true })
  })

  it("returns before async analytics dispatch failures settle", async () => {
    sendProductAnalyticsMessageMock.mockRejectedValue(
      new Error("analytics unavailable"),
    )

    await expect(
      trackProductAnalyticsEvent(PRODUCT_ANALYTICS_EVENTS.SettingChanged, {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ProductAnalyticsEnabled,
        enabled: true,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).resolves.toBe(true)
  })

  it("does not wait or retry when the runtime receiver is not ready", async () => {
    vi.useFakeTimers()
    try {
      sendProductAnalyticsMessageMock.mockRejectedValue(
        new Error("Could not establish connection"),
      )

      await expect(
        trackProductAnalyticsEvent(PRODUCT_ANALYTICS_EVENTS.SettingChanged, {
          setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ProductAnalyticsEnabled,
          enabled: true,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }),
      ).resolves.toBe(true)
      expect(sendProductAnalyticsMessageMock).toHaveBeenCalledTimes(1)
      expect(sendProductAnalyticsMessageMock).toHaveBeenCalledWith(
        ProductAnalyticsMessageTypes.TrackEvent,
        {
          eventName: PRODUCT_ANALYTICS_EVENTS.SettingChanged,
          properties: {
            setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ProductAnalyticsEnabled,
            enabled: true,
            entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          },
        },
      )
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not block when the background runtime rejects the analytics event", async () => {
    sendProductAnalyticsMessageMock.mockResolvedValue({ success: false })

    await expect(
      trackProductAnalyticsEvent(PRODUCT_ANALYTICS_EVENTS.SettingChanged, {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ProductAnalyticsEnabled,
        enabled: true,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).resolves.toBe(true)
  })

  it("returns false instead of throwing when analytics dispatch throws synchronously", async () => {
    sendProductAnalyticsMessageMock.mockImplementation(() => {
      throw new Error("analytics unavailable")
    })

    await expect(
      trackProductAnalyticsEvent(PRODUCT_ANALYTICS_EVENTS.SettingChanged, {
        setting_id: PRODUCT_ANALYTICS_SETTING_IDS.ProductAnalyticsEnabled,
        enabled: true,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      }),
    ).resolves.toBe(false)
  })
})
