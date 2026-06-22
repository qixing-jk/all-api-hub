import type { SupportedUiLanguage } from "~/constants"
import {
  AUTO_DETECT_FAILURE_REASONS,
  AUTO_DETECT_FETCH_CONTEXT_KINDS,
  AUTO_DETECT_STRATEGIES,
  type AutoDetectFailureReason,
} from "~/constants/autoDetect"
import {
  MENU_ITEM_IDS,
  type OptionsMenuItemId,
} from "~/constants/optionsMenuIds"
import {
  ACCOUNT_SITE_TYPES,
  MANAGED_SITE_TYPES,
  SITE_TYPES,
  type ManagedSiteType,
} from "~/constants/siteType"
import {
  ProductAnalyticsMessageTypes,
  sendProductAnalyticsMessage,
  type ProductAnalyticsTrackRequest,
  type ProductAnalyticsTrackRequestDiscriminated,
} from "~/services/productAnalytics/messaging"
import { API_TYPES } from "~/services/verification/aiApiVerification/types"
import {
  AuthTypeEnum,
  type CurrencyType,
  type DashboardTabType,
  type SortField,
  type SortOrder,
} from "~/types"
import type { LogLevel } from "~/types/logging"
import type { ThemeMode } from "~/types/theme"
import { isExtensionBackground } from "~/utils/browser"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ProductAnalyticsEvents")

export const PRODUCT_ANALYTICS_EVENTS = {
  AppOpened: "app_opened",
  PageViewed: "page_viewed",
  FeatureActionStarted: "feature_action_started",
  FeatureActionCompleted: "feature_action_completed",
  ShieldBypassSummaryCaptured: "shield_bypass_summary_captured",
  SponsorRecommendationsDailySummaryCaptured:
    "sponsor_recommendations_daily_summary_captured",
  AutoCheckinRunSummaryCaptured: "auto_checkin_run_summary_captured",
  AutoCheckinAccountGroupCaptured: "auto_checkin_account_group_captured",
  SettingChanged: "setting_changed",
  SettingsSnapshotCaptured: "settings_snapshot_captured",
  PermissionResult: "permission_result",
  SiteEcosystemSnapshot: "site_ecosystem_snapshot",
  SiteTypePresent: "site_type_present",
} as const

export type ProductAnalyticsEventName =
  (typeof PRODUCT_ANALYTICS_EVENTS)[keyof typeof PRODUCT_ANALYTICS_EVENTS]

export const PRODUCT_ANALYTICS_ENTRYPOINTS = {
  Popup: "popup",
  Options: "options",
  Sidepanel: "sidepanel",
  Background: "background",
  Content: "content",
} as const

export type ProductAnalyticsEntrypoint =
  (typeof PRODUCT_ANALYTICS_ENTRYPOINTS)[keyof typeof PRODUCT_ANALYTICS_ENTRYPOINTS]

export const PRODUCT_ANALYTICS_RESULTS = {
  Success: "success",
  Failure: "failure",
  Cancelled: "cancelled",
  Skipped: "skipped",
} as const

export type ProductAnalyticsResult =
  (typeof PRODUCT_ANALYTICS_RESULTS)[keyof typeof PRODUCT_ANALYTICS_RESULTS]

export const PRODUCT_ANALYTICS_ERROR_CATEGORIES = {
  Network: "network",
  Auth: "auth",
  Permission: "permission",
  Validation: "validation",
  Unsupported: "unsupported",
  RateLimit: "rate_limit",
  Timeout: "timeout",
  Unknown: "unknown",
} as const

export type ProductAnalyticsErrorCategory =
  (typeof PRODUCT_ANALYTICS_ERROR_CATEGORIES)[keyof typeof PRODUCT_ANALYTICS_ERROR_CATEGORIES]

export const PRODUCT_ANALYTICS_FAILURE_REASONS = {
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
} as const

export type ProductAnalyticsFailureReason =
  (typeof PRODUCT_ANALYTICS_FAILURE_REASONS)[keyof typeof PRODUCT_ANALYTICS_FAILURE_REASONS]

export const PRODUCT_ANALYTICS_SOURCE_KINDS = {
  History: "history",
  Manual: "manual",
  Row: "row",
  Auto: "auto",
  ApiCredentialProfileManualOptions: "api_credential_profile_manual_options",
  ApiCredentialProfileManualPopup: "api_credential_profile_manual_popup",
  ApiCredentialProfileContentApiCheck:
    "api_credential_profile_content_api_check",
  ApiCredentialProfileAccountToken: "api_credential_profile_account_token",
  ClipboardEvent: "clipboard_event",
  ContextMenu: "context_menu",
  CopyTargetClipboard: "copy_target_clipboard",
  ModelAllAccounts: "model_all_accounts",
  ModelAccount: "model_account",
  ModelProfile: "model_profile",
  ModelFallbackCatalog: "model_fallback_catalog",
  Selection: "selection",
  Unknown: "unknown",
} as const

export type ProductAnalyticsSourceKind =
  (typeof PRODUCT_ANALYTICS_SOURCE_KINDS)[keyof typeof PRODUCT_ANALYTICS_SOURCE_KINDS]

export const PRODUCT_ANALYTICS_TARGET_KINDS = {
  ConfigRequired: "config_required",
  ExternalSite: "external_site",
  ManualSignIn: "manual_sign_in",
  ModelFilter: "model_filter",
  ResultFilter: "result_filter",
  ModelSource: "model_source",
  OptionsPage: "options_page",
} as const

export type ProductAnalyticsTargetKind =
  (typeof PRODUCT_ANALYTICS_TARGET_KINDS)[keyof typeof PRODUCT_ANALYTICS_TARGET_KINDS]

export const PRODUCT_ANALYTICS_TARGET_STATES = {
  Enabled: "enabled",
  Disabled: "disabled",
} as const

export type ProductAnalyticsTargetState =
  (typeof PRODUCT_ANALYTICS_TARGET_STATES)[keyof typeof PRODUCT_ANALYTICS_TARGET_STATES]

export const PRODUCT_ANALYTICS_OPTIONS_PAGE_TARGET_IDS = MENU_ITEM_IDS

export type ProductAnalyticsOptionsPageTargetId = OptionsMenuItemId

export const PRODUCT_ANALYTICS_MODE_IDS = {
  All: "all",
  Selected: "selected",
  Single: "single",
  RetryFailed: "retry_failed",
  TelemetryAuto: "telemetry_auto",
  TelemetryDisabled: "telemetry_disabled",
  TelemetryNewApiTokenUsage: "telemetry_new_api_token_usage",
  TelemetrySub2ApiUsage: "telemetry_sub2api_usage",
  TelemetryOpenAiBilling: "telemetry_openai_billing",
  TelemetryCustomReadOnlyEndpoint: "telemetry_custom_read_only_endpoint",
  Export: "export",
  SearchFilter: "search_filter",
  ProviderFilter: "provider_filter",
  SortFilter: "sort_filter",
  BillingFilter: "billing_filter",
  GroupFilter: "group_filter",
  AccountFilter: "account_filter",
  StatusFilter: "status_filter",
  ExpandDetails: "expand_details",
  CollapseDetails: "collapse_details",
  ApiVerification: "api_verification",
  CliVerification: "cli_verification",
  RefreshIntervalLessThan10m: "refresh_interval_lt_10m",
  RefreshIntervalOneTo10m: "refresh_interval_1_10m",
  RefreshIntervalTenTo60m: "refresh_interval_10_60m",
  RefreshIntervalOneTo6h: "refresh_interval_1_6h",
  RefreshIntervalSixTo24h: "refresh_interval_6_24h",
  RefreshIntervalGreaterThan24h: "refresh_interval_gt_24h",
  RetentionDaysSevenOrLess: "retention_days_le_7",
  RetentionDaysEightTo30: "retention_days_8_30",
  RetentionDaysThirtyOneTo365: "retention_days_31_365",
  RetentionDaysGreaterThan365: "retention_days_gt_365",
  UsageHistoryManual: "usage_history_manual",
  UsageHistoryAfterRefresh: "usage_history_after_refresh",
  UsageHistoryAlarm: "usage_history_alarm",
  RateLimitLessThan20: "rate_limit_lt_20",
  RateLimitTwentyTo60: "rate_limit_20_60",
  RateLimitSixtyPlus: "rate_limit_60_plus",
  TempWindowModeTab: "temp_window_mode_tab",
  TempWindowModeWindow: "temp_window_mode_window",
  TempWindowModeComposite: "temp_window_mode_composite",
  WebDavMerge: "webdav_merge",
  WebDavUploadOnly: "webdav_upload_only",
  WebDavDownloadOnly: "webdav_download_only",
} as const

export type ProductAnalyticsModeId =
  (typeof PRODUCT_ANALYTICS_MODE_IDS)[keyof typeof PRODUCT_ANALYTICS_MODE_IDS]

export const PRODUCT_ANALYTICS_EDITOR_MODES = {
  Visual: "visual",
  Json: "json",
} as const

export type ProductAnalyticsEditorMode =
  (typeof PRODUCT_ANALYTICS_EDITOR_MODES)[keyof typeof PRODUCT_ANALYTICS_EDITOR_MODES]

export const PRODUCT_ANALYTICS_STATUS_KINDS = {
  Healthy: "healthy",
  Warning: "warning",
  Error: "error",
  Unknown: "unknown",
} as const

export type ProductAnalyticsStatusKind =
  (typeof PRODUCT_ANALYTICS_STATUS_KINDS)[keyof typeof PRODUCT_ANALYTICS_STATUS_KINDS]

export const PRODUCT_ANALYTICS_SORT_FIELDS = {
  None: "none",
} as const

export type ProductAnalyticsSortField =
  | SortField
  | (typeof PRODUCT_ANALYTICS_SORT_FIELDS)[keyof typeof PRODUCT_ANALYTICS_SORT_FIELDS]

export const PRODUCT_ANALYTICS_TELEMETRY_SOURCES = {
  Models: "models",
  OpenAiBilling: "openaiBilling",
  NewApiTokenUsage: "newApiTokenUsage",
  Sub2ApiUsage: "sub2apiUsage",
  CustomReadOnlyEndpoint: "customReadOnlyEndpoint",
} as const

export type ProductAnalyticsTelemetrySource =
  (typeof PRODUCT_ANALYTICS_TELEMETRY_SOURCES)[keyof typeof PRODUCT_ANALYTICS_TELEMETRY_SOURCES]

export const PRODUCT_ANALYTICS_API_TYPES = {
  OpenAiCompatible: API_TYPES.OPENAI_COMPATIBLE,
  OpenAi: API_TYPES.OPENAI,
  Anthropic: API_TYPES.ANTHROPIC,
  Google: API_TYPES.GOOGLE,
} as const

export type ProductAnalyticsApiType =
  (typeof PRODUCT_ANALYTICS_API_TYPES)[keyof typeof PRODUCT_ANALYTICS_API_TYPES]

export const PRODUCT_ANALYTICS_PAGE_IDS = {
  PopupAccounts: "popup_accounts",
  PopupBookmarks: "popup_bookmarks",
  PopupApiCredentialProfiles: "popup_api_credential_profiles",
  OptionsOverview: "options_overview",
  OptionsBasicSettings: "options_basic_settings",
  OptionsAccountManagement: "options_account_management",
  OptionsBookmarkManagement: "options_bookmark_management",
  OptionsKeyManagement: "options_key_management",
  OptionsManagedSiteChannels: "options_managed_site_channels",
  OptionsModelList: "options_model_list",
  OptionsUsageAnalytics: "options_usage_analytics",
  OptionsBalanceHistory: "options_balance_history",
  OptionsApiCredentialProfiles: "options_api_credential_profiles",
  OptionsSiteAnnouncements: "options_site_announcements",
  OptionsImportExport: "options_import_export",
  OptionsAutoCheckin: "options_auto_checkin",
  OptionsManagedSiteModelSync: "options_managed_site_model_sync",
  OptionsAbout: "options_about",
} as const

export type ProductAnalyticsPageId =
  (typeof PRODUCT_ANALYTICS_PAGE_IDS)[keyof typeof PRODUCT_ANALYTICS_PAGE_IDS]

export const PRODUCT_ANALYTICS_FEATURE_IDS = {
  AccountManagement: "account_management",
  ApiCredentialProfiles: "api_credential_profiles",
  AppearanceSettings: "appearance_settings",
  AutoCheckin: "auto_checkin",
  BalanceHistory: "balance_history",
  BalanceRefresh: "balance_refresh",
  BookmarkManagement: "bookmark_management",
  ImportExport: "import_export",
  KeyManagement: "key_management",
  ManagedSiteChannels: "managed_site_channels",
  ManagedSiteModelSync: "managed_site_model_sync",
  ModelList: "model_list",
  OptionsOverview: "options_overview",
  PermissionRequest: "permission_request",
  ProductAnalyticsSettings: "product_analytics_settings",
  ProductAnnouncements: "product_announcements",
  RedemptionAssist: "redemption_assist",
  ShareSnapshots: "share_snapshots",
  ShieldBypassAssist: "shield_bypass_assist",
  SiteAnnouncements: "site_announcements",
  SiteEcosystemSnapshot: "site_ecosystem_snapshot",
  SidepanelNavigation: "sidepanel_navigation",
  UsageAnalytics: "usage_analytics",
  WebDavSync: "webdav_sync",
  WebAiApiCheck: "web_ai_api_check",
  SponsorRecommendations: "sponsor_recommendations",
} as const

export type ProductAnalyticsFeatureId =
  (typeof PRODUCT_ANALYTICS_FEATURE_IDS)[keyof typeof PRODUCT_ANALYTICS_FEATURE_IDS]

export const PRODUCT_ANALYTICS_ACTION_IDS = {
  CopyApiCredentialBundle: "copy_api_credential_bundle",
  CopyApiCredentialExportConfig: "copy_api_credential_export_config",
  CopyApiKey: "copy_api_key",
  CopyBaseUrl: "copy_base_url",
  CopyBookmarkUrl: "copy_bookmark_url",
  CopyKiloCodeAccountExportConfig: "copy_kilo_code_account_export_config",
  CopyModelName: "copy_model_name",
  CopySelectedModelKey: "copy_selected_model_key",
  CopyAccountSiteUrl: "copy_account_site_url",
  CopyAccountTokenKey: "copy_account_token_key",
  CopyVisibleModelNames: "copy_visible_model_names",
  CreateAccount: "create_account",
  CreateAccountToken: "create_account_token",
  CreateApiCredentialProfile: "create_api_credential_profile",
  CreateBookmark: "create_bookmark",
  CreateCompatibleModelKey: "create_compatible_model_key",
  CreateCustomModelKey: "create_custom_model_key",
  CreateManagedSiteChannel: "create_managed_site_channel",
  DecryptImportWebDavBackup: "decrypt_import_webdav_backup",
  DeleteAccount: "delete_account",
  DeleteAccountToken: "delete_account_token",
  DeleteApiCredentialProfile: "delete_api_credential_profile",
  DeleteAutoCheckinAccount: "delete_auto_checkin_account",
  DeleteBookmark: "delete_bookmark",
  DeleteInvalidAccountTokens: "delete_invalid_account_tokens",
  DeleteManagedSiteChannel: "delete_managed_site_channel",
  DeleteSelectedManagedSiteChannels: "delete_selected_managed_site_channels",
  DisableSelectedAccounts: "disable_selected_accounts",
  EnableModelPriceComparison: "enable_model_price_comparison",
  EnableProductAnalytics: "enable_product_analytics",
  EnterAccountBulkMode: "enter_account_bulk_mode",
  ExportAccountData: "export_account_data",
  ExportAccountTokenToCCSwitch: "export_account_token_to_cc_switch",
  ExportAccountTokenToCherryStudio: "export_account_token_to_cherry_studio",
  ExportApiCredentialProfileToCCSwitch:
    "export_api_credential_profile_to_cc_switch",
  ExportApiCredentialProfileToCherryStudio:
    "export_api_credential_profile_to_cherry_studio",
  ExportApiCredentialSettingsFile: "export_api_credential_settings_file",
  ExportFullBackup: "export_full_backup",
  ExportManagedSiteTokenChannels: "export_managed_site_token_channels",
  ExportUsageAnalyticsData: "export_usage_analytics_data",
  ExportUserSettings: "export_user_settings",
  ExitAccountBulkMode: "exit_account_bulk_mode",
  DisableAutoCheckinAccount: "disable_auto_checkin_account",
  DownloadImportWebDavBackup: "download_import_webdav_backup",
  ExportAccountTokenToClaudeCodeRouter:
    "export_account_token_to_claude_code_router",
  ExportAccountTokenToCliProxy: "export_account_token_to_cli_proxy",
  ExportAccountTokensToCliProxy: "export_account_tokens_to_cli_proxy",
  ExportKiloCodeAccountSettingsFile: "export_kilo_code_account_settings_file",
  CancelRedemptionAccountSelection: "cancel_redemption_account_selection",
  CancelRedemptionPrompt: "cancel_redemption_prompt",
  ConfirmRedemptionAccountSelection: "confirm_redemption_account_selection",
  ConfirmRedemptionPrompt: "confirm_redemption_prompt",
  CloseRedemptionBatchResult: "close_redemption_batch_result",
  CycleExtensionHeaderThemeMode: "cycle_extension_header_theme_mode",
  DetectedApiCredentialCheckDismissed:
    "detected_api_credential_check_dismissed",
  DetectedApiCredentialReviewStarted: "detected_api_credential_review_started",
  DismissDetectedApiCredentialCheck: "dismiss_detected_api_credential_check",
  DismissProductAnnouncement: "dismiss_product_announcement",
  RestoreProductAnnouncement: "restore_product_announcement",
  AutoFetchApiCredentialModelList: "auto_fetch_api_credential_model_list",
  FetchApiCredentialModelList: "fetch_api_credential_model_list",
  FilterAutoCheckinResults: "filter_auto_checkin_results",
  FilterAccounts: "filter_accounts",
  FilterManagedSiteModelSyncResults: "filter_managed_site_model_sync_results",
  ImportBackupData: "import_backup_data",
  ImportAccountCookies: "import_account_cookies",
  ImportApiCredentialProfileToClaudeCodeRouter:
    "import_api_credential_profile_to_claude_code_router",
  ImportApiCredentialProfileToCliProxy:
    "import_api_credential_profile_to_cli_proxy",
  ImportManagedSiteSingleToken: "import_managed_site_single_token",
  ImportSub2apiSession: "import_sub2api_session",
  LaunchApiCredentialCheckFromContextMenu:
    "launch_api_credential_check_from_context_menu",
  LocateManagedSiteChannel: "locate_managed_site_channel",
  CheckSiteAnnouncementsNow: "check_site_announcements_now",
  CollapseAnnouncement: "collapse_announcement",
  ExpandAnnouncement: "expand_announcement",
  MarkAllAnnouncementsRead: "mark_all_announcements_read",
  MarkAnnouncementRead: "mark_announcement_read",
  MigrateManagedSiteChannels: "migrate_managed_site_channels",
  OpenAccountSite: "open_account_site",
  OpenAccountUsageLog: "open_account_usage_log",
  OpenAllExternalCheckIns: "open_all_external_check_ins",
  OpenApiCredentialExportMenu: "open_api_credential_export_menu",
  OpenApiCredentialModelManagement: "open_api_credential_model_management",
  OpenAnnouncementSource: "open_announcement_source",
  OpenAutoCheckinAccountSite: "open_auto_checkin_account_site",
  OpenAutoCheckinAccountSetup: "open_auto_checkin_account_setup",
  OpenAutoCheckinManualSignIn: "open_auto_checkin_manual_sign_in",
  OpenBookmark: "open_bookmark",
  OpenBatchModelVerifyDialog: "open_batch_model_verify_dialog",
  OpenCreateApiCredentialProfileDialog:
    "open_create_api_credential_profile_dialog",
  OpenAccountKeyManagementFromModel: "open_account_key_management_from_model",
  OpenAccountModelListFromKeyManagement:
    "open_account_model_list_from_key_management",
  OpenFailedAutoCheckinManualSignIns:
    "open_failed_auto_checkin_manual_sign_ins",
  OpenFilteredManagedSiteChannelMigration:
    "open_filtered_managed_site_channel_migration",
  OpenKeyList: "open_key_list",
  OpenKeyManagement: "open_key_management",
  OpenUpdateApiCredentialProfileDialog:
    "open_update_api_credential_profile_dialog",
  OpenManagedSiteChannelFilters: "open_managed_site_channel_filters",
  OpenManagedSiteChannelManagement: "open_managed_site_channel_management",
  OpenManagedSiteChannelMigration: "open_managed_site_channel_migration",
  OpenManagedSiteChannelModelSync: "open_managed_site_channel_model_sync",
  OpenManagedSiteModelSyncConfigRequired:
    "open_managed_site_model_sync_config_required",
  OpenModelKeyDialog: "open_model_key_dialog",
  OpenModelManagement: "open_model_management",
  OpenOptionsOverviewTarget: "open_options_overview_target",
  OpenPopupExternalCheckIns: "open_popup_external_check_ins",
  OpenPopupAccountManagementPage: "open_popup_account_management_page",
  OpenPopupApiCredentialProfilesPage: "open_popup_api_credential_profiles_page",
  OpenPopupBookmarkManagementPage: "open_popup_bookmark_management_page",
  OpenPopupKeyManagement: "open_popup_key_management",
  OpenPopupModelManagement: "open_popup_model_management",
  OpenPopupSettingsPage: "open_popup_settings_page",
  OpenProductAnnouncementCta: "open_product_announcement_cta",
  OpenProductAnnouncements: "open_product_announcements",
  OpenSidepanelFromPopup: "open_sidepanel_from_popup",
  OpenSidepanelFromToolbarAction: "open_sidepanel_from_toolbar_action",
  ClearApiCredentialProfileFilters: "clear_api_credential_profile_filters",
  FilterApiCredentialProfiles: "filter_api_credential_profiles",
  OpenUpdateAccountDialog: "open_update_account_dialog",
  OpenBalanceHistorySettings: "open_balance_history_settings",
  OpenRedeemPage: "open_redeem_page",
  OpenSponsorAddAccountFollowup: "open_sponsor_add_account_followup",
  OpenSponsorApiCredentialsFollowup: "open_sponsor_api_credentials_followup",
  OpenSponsorBookmarkFollowup: "open_sponsor_bookmark_followup",
  OpenSponsorProvider: "open_sponsor_provider",
  OpenSelectedManagedSiteChannelMigration:
    "open_selected_managed_site_channel_migration",
  OpenUsageSyncSettings: "open_usage_sync_settings",
  PruneBalanceHistorySnapshots: "prune_balance_history_snapshots",
  RefreshAccount: "refresh_account",
  RefreshAccountTokens: "refresh_account_tokens",
  RefreshAllAccounts: "refresh_all_accounts",
  RefreshApiCredentialTelemetry: "refresh_api_credential_telemetry",
  RefreshAutoCheckinStatus: "refresh_auto_checkin_status",
  RefreshOptionsOverviewData: "refresh_options_overview_data",
  RefreshDisabledAccounts: "refresh_disabled_accounts",
  RefreshManagedSiteChannels: "refresh_managed_site_channels",
  RefreshManagedSiteTokenStatus: "refresh_managed_site_token_status",
  RefreshManagedSiteModelSyncResults: "refresh_managed_site_model_sync_results",
  RefreshModelKeyCandidates: "refresh_model_key_candidates",
  RefreshModelPricingData: "refresh_model_pricing_data",
  RefreshPopupAccounts: "refresh_popup_accounts",
  RefreshBalanceHistorySnapshots: "refresh_balance_history_snapshots",
  RefreshUsageAnalyticsData: "refresh_usage_analytics_data",
  ReloadManagedSiteModelSyncChannels: "reload_managed_site_model_sync_channels",
  RepairMissingAccountKeys: "repair_missing_account_keys",
  ReorderAccounts: "reorder_accounts",
  RevealAccountTokenKey: "reveal_account_token_key",
  RetryManagedSiteTokenVerification: "retry_managed_site_token_verification",
  RetryRedemptionCode: "retry_redemption_code",
  RunApiCredentialProbe: "run_api_credential_probe",
  RunApiCredentialProbeSuite: "run_api_credential_probe_suite",
  RunAccountAutoDetect: "run_account_auto_detect",
  RunAutoCheckinNow: "run_auto_checkin_now",
  RunTempWindowFetch: "run_temp_window_fetch",
  RunTempWindowTurnstileFetch: "run_temp_window_turnstile_fetch",
  RunPopupQuickCheckin: "run_popup_quick_checkin",
  RunQuickCheckin: "run_quick_checkin",
  RetryAutoCheckinAccount: "retry_auto_checkin_account",
  RetryFailedManagedSiteModelSync: "retry_failed_managed_site_model_sync",
  SaveAccountTokenToApiCredentialProfile:
    "save_account_token_to_api_credential_profile",
  SaveAccountTokensToApiCredentialProfiles:
    "save_account_tokens_to_api_credential_profiles",
  SaveManagedSiteChannelModelFilters: "save_managed_site_channel_model_filters",
  ScanDuplicateAccounts: "scan_duplicate_accounts",
  SearchAccounts: "search_accounts",
  SearchManagedSiteModelSyncChannels: "search_managed_site_model_sync_channels",
  SelectAllManagedSiteModelSyncChannels:
    "select_all_managed_site_model_sync_channels",
  SelectManagedSiteModelSyncTab: "select_managed_site_model_sync_tab",
  SelectModelSource: "select_model_source",
  FilterModelList: "filter_model_list",
  SelectApiCredentialProfileExportDestination:
    "select_api_credential_profile_export_destination",
  SnapshotApiCredentialProfiles: "snapshot_api_credential_profiles",
  ToggleModelDetails: "toggle_model_details",
  SelectApiCredentialProfilesView: "select_api_credential_profiles_view",
  SelectBookmarksView: "select_bookmarks_view",
  SelectAccountsView: "select_accounts_view",
  ShareOverviewSnapshot: "share_overview_snapshot",
  ShieldBypassPromptDismissed: "shield_bypass_prompt_dismissed",
  ShieldBypassSettingsVisited: "shield_bypass_settings_visited",
  ShowApiCredentialCheckModal: "show_api_credential_check_modal",
  ShowRedemptionAccountSelect: "show_redemption_account_select",
  ShowRedemptionBatchResult: "show_redemption_batch_result",
  ShowRedemptionPrompt: "show_redemption_prompt",
  ShowShieldBypassPrompt: "show_shield_bypass_prompt",
  SummarizeShieldBypassDaily: "summarize_shield_bypass_daily",
  StartBatchModelVerify: "start_batch_model_verify",
  StopBatchModelVerify: "stop_batch_model_verify",
  ScheduledManagedSiteModelSync: "scheduled_managed_site_model_sync",
  SyncWebDavNow: "sync_webdav_now",
  SyncManagedSiteChannel: "sync_managed_site_channel",
  SyncAllManagedSiteModels: "sync_all_managed_site_models",
  SyncSelectedManagedSiteChannels: "sync_selected_managed_site_channels",
  SyncSelectedManagedSiteModels: "sync_selected_managed_site_models",
  SyncSingleManagedSiteModel: "sync_single_managed_site_model",
  ToggleAccountDisabled: "toggle_account_disabled",
  ToggleApiCredentialKeyVisibility: "toggle_api_credential_key_visibility",
  ToggleAccountPin: "toggle_account_pin",
  ToggleBatchModelSelection: "toggle_batch_model_selection",
  ToggleBookmarkPin: "toggle_bookmark_pin",
  ToggleManagedSiteChannelMigrationMode:
    "toggle_managed_site_channel_migration_mode",
  UpdateAccount: "update_account",
  UpdateAccountToken: "update_account_token",
  UpdateApiCredentialProfile: "update_api_credential_profile",
  UpdateBookmark: "update_bookmark",
  UpdateManagedSiteChannel: "update_managed_site_channel",
  UpdateManagedSiteModelSyncSettings: "update_managed_site_model_sync_settings",
  UpdateWebDavAutoSyncSettings: "update_webdav_auto_sync_settings",
  UpdateWebDavConfig: "update_webdav_config",
  UploadWebDavBackup: "upload_webdav_backup",
  UseCurrentPageForBookmark: "use_current_page_for_bookmark",
  ViewManagedSiteChannel: "view_managed_site_channel",
  VerifyApiCredential: "verify_api_credential",
  VerifyApiCredentialCliSupport: "verify_api_credential_cli_support",
  VerifyWebDavConnection: "verify_webdav_connection",
  VerifyModelApi: "verify_model_api",
  VerifyModelCliSupport: "verify_model_cli_support",
  Snapshot: "snapshot",
  OpenCreateAccountDialog: "open_create_account_dialog",
  ShareAccountSnapshot: "share_account_snapshot",
  TriggerApiCredentialCheckFromContextMenu:
    "trigger_api_credential_check_from_context_menu",
  TriggerRedemptionAssistFromContextMenu:
    "trigger_redemption_assist_from_context_menu",
  VisitRedemptionAssistSettingsFromPrompt:
    "visit_redemption_assist_settings_from_prompt",
  ViewSponsorRecommendations: "view_sponsor_recommendations",
} as const

export type ProductAnalyticsActionId =
  (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS]

export const PRODUCT_ANALYTICS_SURFACE_IDS = {
  AccountTokenThirdPartyExportDialog: "account_token_third_party_export_dialog",
  BackgroundAutoCheckinScheduler: "background_auto_checkin_scheduler",
  BackgroundShieldBypassTempContext: "background_shield_bypass_temp_context",
  OptionsAutoCheckinActionBar: "options_auto_checkin_action_bar",
  OptionsAutoCheckinEmptyState: "options_auto_checkin_empty_state",
  OptionsAutoCheckinFilterBar: "options_auto_checkin_filter_bar",
  OptionsAutoCheckinResultsTable: "options_auto_checkin_results_table",
  OptionsBalanceHistoryPage: "options_balance_history_page",
  OptionsAccountManagementHeader: "options_account_management_header",
  OptionsAccountManagementPage: "options_account_management_page",
  OptionsAccountManagementRowActions: "options_account_management_row_actions",
  OptionsAccountManagementAddAccountSponsorRecommendations:
    "options_account_management_add_account_sponsor_recommendations",
  OptionsAccountManagementNewcomerSponsorRecommendations:
    "options_account_management_newcomer_sponsor_recommendations",
  OptionsAccountTokenKiloCodeExportDialog:
    "options_account_token_kilo_code_export_dialog",
  OptionsApiCredentialProfilesDialog: "options_api_credential_profiles_dialog",
  OptionsApiCredentialProfilesEmptyState:
    "options_api_credential_profiles_empty_state",
  OptionsApiCredentialProfilesExportDialog:
    "options_api_credential_profiles_export_dialog",
  OptionsApiCredentialProfilesPage: "options_api_credential_profiles_page",
  OptionsApiCredentialProfilesRowActions:
    "options_api_credential_profiles_row_actions",
  OptionsBasicSettingsGeneral: "options_basic_settings_general",
  OptionsBookmarkManagementDialog: "options_bookmark_management_dialog",
  OptionsBookmarkManagementEmptyState:
    "options_bookmark_management_empty_state",
  OptionsBookmarkManagementPage: "options_bookmark_management_page",
  OptionsBookmarkManagementRowActions:
    "options_bookmark_management_row_actions",
  OptionsImportExportExportSection: "options_import_export_export_section",
  OptionsImportExportImportSection: "options_import_export_import_section",
  OptionsImportExportPage: "options_import_export_page",
  OptionsKeyManagementDialog: "options_key_management_dialog",
  OptionsKeyManagementHeader: "options_key_management_header",
  OptionsKeyManagementPage: "options_key_management_page",
  OptionsKeyManagementRepairDialog: "options_key_management_repair_dialog",
  OptionsKeyManagementRowActions: "options_key_management_row_actions",
  OptionsManagedSiteChannelFilterDialog:
    "options_managed_site_channel_filter_dialog",
  OptionsManagedSiteChannelsRowActions:
    "options_managed_site_channels_row_actions",
  OptionsManagedSiteChannelsToolbar: "options_managed_site_channels_toolbar",
  OptionsManagedSiteModelSyncActionBar:
    "options_managed_site_model_sync_action_bar",
  OptionsManagedSiteModelSyncManualPanel:
    "options_managed_site_model_sync_manual_panel",
  OptionsManagedSiteModelSyncResultsTable:
    "options_managed_site_model_sync_results_table",
  OptionsModelListBatchVerifyDialog: "options_model_list_batch_verify_dialog",
  OptionsModelListControlPanel: "options_model_list_control_panel",
  OptionsModelListKeyDialog: "options_model_list_key_dialog",
  OptionsModelListPage: "options_model_list_page",
  OptionsModelListRowActions: "options_model_list_row_actions",
  OptionsOverviewActionCenter: "options_overview_action_center",
  OptionsOverviewAttentionList: "options_overview_attention_list",
  OptionsOverviewAutomationOverview: "options_overview_automation_overview",
  OptionsOverviewRecentUsage: "options_overview_recent_usage",
  OptionsOverviewStatusSummary: "options_overview_status_summary",
  OptionsProductAnnouncementsBanner: "options_product_announcements_banner",
  OptionsProductAnnouncementsHeader: "options_product_announcements_header",
  OptionsSiteAnnouncementCard: "options_site_announcement_card",
  OptionsSiteAnnouncementsEmptyState: "options_site_announcements_empty_state",
  OptionsSiteAnnouncementsPage: "options_site_announcements_page",
  OptionsUsageAnalyticsEmptyState: "options_usage_analytics_empty_state",
  OptionsUsageAnalyticsHeader: "options_usage_analytics_header",
  OptionsWebDavAutoSyncSettings: "options_webdav_auto_sync_settings",
  OptionsWebDavDecryptPasswordDialog: "options_webdav_decrypt_password_dialog",
  OptionsWebDavSettings: "options_webdav_settings",
  BackgroundContextMenu: "background_context_menu",
  BackgroundToolbarAction: "background_toolbar_action",
  ContentApiCheckConfirmToast: "content_api_check_confirm_toast",
  ContentApiCheckModal: "content_api_check_modal",
  ContentRedemptionAccountSelectToast:
    "content_redemption_account_select_toast",
  ContentRedemptionBatchResultToast: "content_redemption_batch_result_toast",
  ContentRedemptionPromptToast: "content_redemption_prompt_toast",
  ContentShieldBypassPromptToast: "content_shield_bypass_prompt_toast",
  PopupActionBar: "popup_action_bar",
  PopupApiCredentialProfilesEmptyState:
    "popup_api_credential_profiles_empty_state",
  PopupApiCredentialProfilesStats: "popup_api_credential_profiles_stats",
  PopupHeader: "popup_header",
  PopupProductAnnouncementsHeader: "popup_product_announcements_header",
  PopupViewTabs: "popup_view_tabs",
  SidepanelActionBar: "sidepanel_action_bar",
  SidepanelHeader: "sidepanel_header",
  SidepanelViewTabs: "sidepanel_view_tabs",
} as const

export type ProductAnalyticsSurfaceId =
  (typeof PRODUCT_ANALYTICS_SURFACE_IDS)[keyof typeof PRODUCT_ANALYTICS_SURFACE_IDS]

export const PRODUCT_ANALYTICS_SETTING_IDS = {
  ProductAnalyticsEnabled: "product_analytics_enabled",
  AppPreferencesSnapshot: "app_preferences_snapshot",
  DisplayPreferencesSnapshot: "display_preferences_snapshot",
  AccountBehaviorSnapshot: "account_behavior_snapshot",
  LoggingPreferencesSnapshot: "logging_preferences_snapshot",
  AutoRefreshConfigSnapshot: "auto_refresh_config_snapshot",
  UsageHistoryConfigSnapshot: "usage_history_config_snapshot",
  BalanceHistoryConfigSnapshot: "balance_history_config_snapshot",
  ManagedSiteConfigSnapshot: "managed_site_config_snapshot",
  AutoCheckinConfigSnapshot: "auto_checkin_config_snapshot",
  ManagedSiteModelSyncConfigSnapshot: "managed_site_model_sync_config_snapshot",
  ModelRedirectConfigSnapshot: "model_redirect_config_snapshot",
  RedemptionAssistConfigSnapshot: "redemption_assist_config_snapshot",
  WebAiApiCheckConfigSnapshot: "web_ai_api_check_config_snapshot",
  TempWindowFallbackConfigSnapshot: "temp_window_fallback_config_snapshot",
  WebDavConfigSnapshot: "webdav_config_snapshot",
  TaskNotificationsConfigSnapshot: "task_notifications_config_snapshot",
  SiteAnnouncementsConfigSnapshot: "site_announcements_config_snapshot",
} as const

export type ProductAnalyticsSettingId =
  (typeof PRODUCT_ANALYTICS_SETTING_IDS)[keyof typeof PRODUCT_ANALYTICS_SETTING_IDS]

export const PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES = {
  Random: "random",
  Deterministic: "deterministic",
} as const

export type ProductAnalyticsAutoCheckinScheduleMode =
  (typeof PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES)[keyof typeof PRODUCT_ANALYTICS_AUTO_CHECKIN_SCHEDULE_MODES]

export const PRODUCT_ANALYTICS_AUTO_CHECKIN_RUN_KINDS = {
  Daily: "daily",
  Manual: "manual",
  Retry: "retry",
} as const

export type ProductAnalyticsAutoCheckinRunKind =
  (typeof PRODUCT_ANALYTICS_AUTO_CHECKIN_RUN_KINDS)[keyof typeof PRODUCT_ANALYTICS_AUTO_CHECKIN_RUN_KINDS]

export const PRODUCT_ANALYTICS_AUTO_CHECKIN_SKIP_REASONS = {
  AccountDisabled: "account_disabled",
  DetectionDisabled: "detection_disabled",
  AutoCheckinDisabled: "auto_checkin_disabled",
  AlreadyCheckedToday: "already_checked_today",
  NoProvider: "no_provider",
  ProviderNotReady: "provider_not_ready",
} as const

export type ProductAnalyticsAutoCheckinSkipReason =
  (typeof PRODUCT_ANALYTICS_AUTO_CHECKIN_SKIP_REASONS)[keyof typeof PRODUCT_ANALYTICS_AUTO_CHECKIN_SKIP_REASONS]

export const PRODUCT_ANALYTICS_PERMISSION_IDS = {
  Notifications: "notifications",
  Cookies: "cookies",
  WebRequest: "webRequest",
  WebRequestBlocking: "webRequestBlocking",
  ClipboardRead: "clipboardRead",
  DeclarativeNetRequestWithHostAccess: "declarativeNetRequestWithHostAccess",
} as const

export type ProductAnalyticsPermissionId =
  (typeof PRODUCT_ANALYTICS_PERMISSION_IDS)[keyof typeof PRODUCT_ANALYTICS_PERMISSION_IDS]

export const PRODUCT_ANALYTICS_PERMISSION_OPERATIONS = {
  Request: "request",
  Remove: "remove",
} as const

export type ProductAnalyticsPermissionOperation =
  (typeof PRODUCT_ANALYTICS_PERMISSION_OPERATIONS)[keyof typeof PRODUCT_ANALYTICS_PERMISSION_OPERATIONS]

export const PRODUCT_ANALYTICS_PERMISSION_OUTCOMES = {
  Granted: "granted",
  Denied: "denied",
  Revoked: "revoked",
  RevokeFailed: "revoke_failed",
  ApiError: "api_error",
} as const

export type ProductAnalyticsPermissionOutcome =
  (typeof PRODUCT_ANALYTICS_PERMISSION_OUTCOMES)[keyof typeof PRODUCT_ANALYTICS_PERMISSION_OUTCOMES]

export const PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS = {
  UserDenied: "user_denied",
  RemoveFailed: "remove_failed",
  ApiException: "api_exception",
} as const

export type ProductAnalyticsPermissionFailureReason =
  (typeof PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS)[keyof typeof PRODUCT_ANALYTICS_PERMISSION_FAILURE_REASONS]

export const PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FAILURE_REASONS =
  AUTO_DETECT_FAILURE_REASONS

export type ProductAnalyticsAccountAutoDetectFailureReason =
  AutoDetectFailureReason

export const PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_STRATEGIES =
  AUTO_DETECT_STRATEGIES

export type ProductAnalyticsAccountAutoDetectStrategy =
  (typeof PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_STRATEGIES)[keyof typeof PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_STRATEGIES]

export const PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FETCH_CONTEXT_KINDS =
  AUTO_DETECT_FETCH_CONTEXT_KINDS

export type ProductAnalyticsAccountAutoDetectFetchContextKind =
  (typeof PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FETCH_CONTEXT_KINDS)[keyof typeof PRODUCT_ANALYTICS_ACCOUNT_AUTO_DETECT_FETCH_CONTEXT_KINDS]

export const PRODUCT_ANALYTICS_REQUESTED_AUTH_MODES = AuthTypeEnum

export type ProductAnalyticsRequestedAuthMode = AuthTypeEnum

export const PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS = {
  ApiCredentialProfilesFallback: "api_credential_profiles_fallback",
  BookmarkFallback: "bookmark_fallback",
  ContinueAddAccount: "continue_add_account",
  VisitProvider: "visit_provider",
} as const

export type ProductAnalyticsSponsorActionKind =
  (typeof PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS)[keyof typeof PRODUCT_ANALYTICS_SPONSOR_ACTION_KINDS]

export const PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES = {
  None: "none",
  AddAccount: "add-account",
  Bookmark: "bookmark",
  Api: "api",
  AddAccountBookmark: "add-account,bookmark",
  AddAccountApi: "add-account,api",
  BookmarkApi: "bookmark,api",
  AddAccountBookmarkApi: "add-account,bookmark,api",
} as const

export type ProductAnalyticsSponsorActionAvailability =
  (typeof PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES)[keyof typeof PRODUCT_ANALYTICS_SPONSOR_ACTION_AVAILABILITIES]

export const PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES = {
  Bundled: "bundled",
  Cached: "cached",
  Mixed: "mixed",
  Remote: "remote",
} as const

export type ProductAnalyticsSponsorCatalogSource =
  (typeof PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES)[keyof typeof PRODUCT_ANALYTICS_SPONSOR_CATALOG_SOURCES]

export const PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES = {
  Supported: "supported",
  Unsupported: "unsupported",
} as const

export type ProductAnalyticsSponsorSupportStatus =
  (typeof PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES)[keyof typeof PRODUCT_ANALYTICS_SPONSOR_SUPPORT_STATUSES]

export const PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS = {
  OpenList: "open_list",
  Dismiss: "dismiss",
  Restore: "restore",
  OpenCta: "open_cta",
  MarkSeen: "mark_seen",
} as const

export type ProductAnalyticsProductAnnouncementActionKind =
  (typeof PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS)[keyof typeof PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_ACTION_KINDS]

export const PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_SEVERITIES = {
  Critical: "critical",
  Warning: "warning",
  Info: "info",
} as const

export type ProductAnalyticsProductAnnouncementSeverity =
  (typeof PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_SEVERITIES)[keyof typeof PRODUCT_ANALYTICS_PRODUCT_ANNOUNCEMENT_SEVERITIES]

export type ProductAnalyticsProductAnnouncementId = string

export const PRODUCT_ANALYTICS_SITE_TYPES = [
  ...new Set([...ACCOUNT_SITE_TYPES, ...MANAGED_SITE_TYPES]),
] as ReadonlyArray<(typeof ACCOUNT_SITE_TYPES)[number] | ManagedSiteType>
export type ProductAnalyticsSiteType =
  (typeof PRODUCT_ANALYTICS_SITE_TYPES)[number]

export const PRODUCT_ANALYTICS_MANAGED_SITE_TYPES = {
  NewApi: SITE_TYPES.NEW_API,
  Veloera: SITE_TYPES.VELOERA,
  DoneHub: SITE_TYPES.DONE_HUB,
  Octopus: SITE_TYPES.OCTOPUS,
  AxonHub: SITE_TYPES.AXON_HUB,
  ClaudeCodeHub: SITE_TYPES.CLAUDE_CODE_HUB,
} as const

export type ProductAnalyticsManagedSiteType =
  (typeof PRODUCT_ANALYTICS_MANAGED_SITE_TYPES)[keyof typeof PRODUCT_ANALYTICS_MANAGED_SITE_TYPES]

export const PRODUCT_ANALYTICS_TOOLBAR_ACTION_CLICK_BEHAVIORS = {
  Popup: "popup",
  Sidepanel: "sidepanel",
} as const

export type ProductAnalyticsToolbarActionClickBehavior =
  (typeof PRODUCT_ANALYTICS_TOOLBAR_ACTION_CLICK_BEHAVIORS)[keyof typeof PRODUCT_ANALYTICS_TOOLBAR_ACTION_CLICK_BEHAVIORS]

export const PRODUCT_ANALYTICS_FAILURE_STAGES = {
  Detection: "detection",
  Parse: "parse",
  Request: "request",
  Response: "response",
  Permission: "permission",
  Validation: "validation",
  Fallback: "fallback",
  Prompt: "prompt",
  Persist: "persist",
  Preview: "preview",
  Execute: "execute",
} as const

export type ProductAnalyticsFailureStage =
  (typeof PRODUCT_ANALYTICS_FAILURE_STAGES)[keyof typeof PRODUCT_ANALYTICS_FAILURE_STAGES]

export type ProductAnalyticsEventPayloadMap = {
  [PRODUCT_ANALYTICS_EVENTS.AppOpened]: {
    entrypoint: ProductAnalyticsEntrypoint
  }
  [PRODUCT_ANALYTICS_EVENTS.PageViewed]: {
    page_id: ProductAnalyticsPageId
    entrypoint: ProductAnalyticsEntrypoint
  }
  [PRODUCT_ANALYTICS_EVENTS.FeatureActionStarted]: {
    feature_id: ProductAnalyticsFeatureId
    action_id: ProductAnalyticsActionId
    surface_id?: ProductAnalyticsSurfaceId
    entrypoint: ProductAnalyticsEntrypoint
  }
  [PRODUCT_ANALYTICS_EVENTS.FeatureActionCompleted]: {
    feature_id: ProductAnalyticsFeatureId
    action_id: ProductAnalyticsActionId
    surface_id?: ProductAnalyticsSurfaceId
    result: ProductAnalyticsResult
    error_category?: ProductAnalyticsErrorCategory
    duration_ms?: number
    api_type?: ProductAnalyticsApiType
    source_kind?: ProductAnalyticsSourceKind
    mode?: ProductAnalyticsModeId
    editor_mode?: ProductAnalyticsEditorMode
    status_kind?: ProductAnalyticsStatusKind
    telemetry_source?: ProductAnalyticsTelemetrySource
    target_kind?: ProductAnalyticsTargetKind
    target_state?: ProductAnalyticsTargetState
    target_page_id?: ProductAnalyticsOptionsPageTargetId
    managed_site_type?: ProductAnalyticsManagedSiteType
    source_managed_site_type?: ProductAnalyticsManagedSiteType
    target_managed_site_type?: ProductAnalyticsManagedSiteType
    failure_stage?: ProductAnalyticsFailureStage
    failure_reason?: ProductAnalyticsFailureReason
    account_auto_detect_failure_reason?: ProductAnalyticsAccountAutoDetectFailureReason
    auto_detect_strategy?: ProductAnalyticsAccountAutoDetectStrategy
    requested_auth_mode?: ProductAnalyticsRequestedAuthMode
    site_type?: ProductAnalyticsSiteType
    fetch_context_kind?: ProductAnalyticsAccountAutoDetectFetchContextKind
    cache_hit?: boolean
    cache_used?: boolean
    fallback_available?: boolean
    fallback_used?: boolean
    retry_attempted?: boolean
    retry_count?: number
    temp_context_used?: boolean
    incognito_context_used?: boolean
    stale_response_ignored?: boolean
    background_execution?: boolean
    current_tab_matched?: boolean
    item_count?: number
    selected_count?: number
    success_count?: number
    failure_count?: number
    skipped_count?: number
    warning_count?: number
    ready_count?: number
    blocked_count?: number
    model_count?: number
    filter_count?: number
    result_count?: number
    usage_data_present?: boolean
    route_params_present?: boolean
    shield_bypass_prompt_shown_count?: number
    shield_bypass_prompt_dismissed_count?: number
    shield_bypass_settings_visited_count?: number
    temp_window_fetch_success_count?: number
    temp_window_fetch_failure_count?: number
    temp_window_turnstile_fetch_success_count?: number
    temp_window_turnstile_fetch_failure_count?: number
    sponsor_action_kind?: ProductAnalyticsSponsorActionKind
    sponsor_action_availability?: ProductAnalyticsSponsorActionAvailability
    sponsor_campaign_locale?: string
    sponsor_catalog_schema_version?: number
    sponsor_catalog_source?: ProductAnalyticsSponsorCatalogSource
    sponsor_rank?: number
    sponsor_support_status?: ProductAnalyticsSponsorSupportStatus
    sponsor_supported_count?: number
    sponsor_unsupported_count?: number
    product_announcement_id?: ProductAnalyticsProductAnnouncementId
    product_announcement_severity?: ProductAnalyticsProductAnnouncementSeverity
    product_announcement_action_kind?: ProductAnalyticsProductAnnouncementActionKind
    product_announcement_active_count?: number
    entrypoint: ProductAnalyticsEntrypoint
  }
  [PRODUCT_ANALYTICS_EVENTS.ShieldBypassSummaryCaptured]: {
    feature_id: typeof PRODUCT_ANALYTICS_FEATURE_IDS.ShieldBypassAssist
    surface_id: typeof PRODUCT_ANALYTICS_SURFACE_IDS.BackgroundShieldBypassTempContext
    entrypoint: typeof PRODUCT_ANALYTICS_ENTRYPOINTS.Background
    shield_bypass_prompt_shown_count?: number
    shield_bypass_prompt_dismissed_count?: number
    shield_bypass_settings_visited_count?: number
    temp_window_fetch_success_count?: number
    temp_window_fetch_failure_count?: number
    temp_window_turnstile_fetch_success_count?: number
    temp_window_turnstile_fetch_failure_count?: number
  }
  [PRODUCT_ANALYTICS_EVENTS.SponsorRecommendationsDailySummaryCaptured]: {
    feature_id: typeof PRODUCT_ANALYTICS_FEATURE_IDS.SponsorRecommendations
    entrypoint: typeof PRODUCT_ANALYTICS_ENTRYPOINTS.Background
    day: string
    impression_count: number
    item_total: number
    supported_item_total: number
    unsupported_item_total: number
    add_account_surface_count: number
    newcomer_surface_count: number
  }
  [PRODUCT_ANALYTICS_EVENTS.AutoCheckinRunSummaryCaptured]: {
    run_kind: ProductAnalyticsAutoCheckinRunKind
    entrypoint: typeof PRODUCT_ANALYTICS_ENTRYPOINTS.Background
    total_accounts: number
    detection_enabled_accounts: number
    auto_checkin_enabled_accounts: number
    provider_available_accounts: number
    runnable_accounts: number
    success_count: number
    failed_count: number
    skipped_count: number
    retry_enabled: boolean
    retry_pending_before: number
    retry_attempted: number
    retry_rescued: number
    retry_pending_after: number
    retry_exhausted: number
  }
  [PRODUCT_ANALYTICS_EVENTS.AutoCheckinAccountGroupCaptured]: {
    run_kind: ProductAnalyticsAutoCheckinRunKind
    entrypoint: typeof PRODUCT_ANALYTICS_ENTRYPOINTS.Background
    site_type?: ProductAnalyticsSiteType
    requested_auth_mode?: ProductAnalyticsRequestedAuthMode
    skip_reason?: ProductAnalyticsAutoCheckinSkipReason
    total_accounts: number
    runnable_accounts: number
    success_count: number
    failed_count: number
    skipped_count: number
  }
  [PRODUCT_ANALYTICS_EVENTS.SettingChanged]: {
    setting_id: ProductAnalyticsSettingId
    enabled?: boolean
    configured?: boolean
    theme_mode?: ThemeMode
    normalized_language?: SupportedUiLanguage
    toolbar_action_click_behavior?: ProductAnalyticsToolbarActionClickBehavior
    open_changelog_on_update_enabled?: boolean
    active_tab?: DashboardTabType
    currency_type?: CurrencyType
    sort_field?: ProductAnalyticsSortField
    sort_order?: SortOrder
    sorting_priority_configured?: boolean
    sorting_priority_customized?: boolean
    sorting_priority_enabled_criteria_count?: number
    console_logging_enabled?: boolean
    log_level?: LogLevel
    auto_provision_key_on_account_add_enabled?: boolean
    auto_fill_current_site_url_on_account_add_enabled?: boolean
    warn_on_duplicate_account_add_enabled?: boolean
    show_today_cashflow_enabled?: boolean
    show_health_status_enabled?: boolean
    refresh_on_open_enabled?: boolean
    refresh_interval_minutes?: number
    min_refresh_interval_seconds?: number
    sync_interval_minutes?: number
    polling_interval_minutes?: number
    retention_days?: number
    end_of_day_capture_enabled?: boolean
    estimated_today_income_enabled?: boolean
    managed_site_type?: ProductAnalyticsManagedSiteType
    new_api_configured?: boolean
    done_hub_configured?: boolean
    veloera_configured?: boolean
    octopus_configured?: boolean
    axon_hub_configured?: boolean
    claude_code_hub_configured?: boolean
    cli_proxy_configured?: boolean
    claude_code_router_configured?: boolean
    concurrency?: number
    rate_limit_rpm?: number
    rate_limit_burst?: number
    channel_timeout_seconds?: number
    allowed_models_configured?: boolean
    global_filters_configured?: boolean
    standard_models_configured?: boolean
    prune_missing_targets_on_model_sync_enabled?: boolean
    context_menu_enabled?: boolean
    relaxed_code_validation_enabled?: boolean
    url_whitelist_enabled?: boolean
    url_whitelist_patterns_configured?: boolean
    url_whitelist_account_urls_enabled?: boolean
    url_whitelist_checkin_redeem_urls_enabled?: boolean
    auto_detect_enabled?: boolean
    auto_detect_enhanced_enabled?: boolean
    auto_detect_url_patterns_configured?: boolean
    popup_enabled?: boolean
    sidepanel_enabled?: boolean
    options_enabled?: boolean
    auto_refresh_enabled?: boolean
    manual_refresh_enabled?: boolean
    reminder_dismissed?: boolean
    mode?: ProductAnalyticsModeId
    auto_sync_enabled?: boolean
    backup_encryption_enabled?: boolean
    sync_strategy?: ProductAnalyticsModeId
    sync_accounts_enabled?: boolean
    sync_bookmarks_enabled?: boolean
    sync_api_profiles_enabled?: boolean
    sync_preferences_enabled?: boolean
    browser_channel_enabled?: boolean
    telegram_channel_enabled?: boolean
    feishu_channel_enabled?: boolean
    dingtalk_channel_enabled?: boolean
    wecom_channel_enabled?: boolean
    ntfy_channel_enabled?: boolean
    webhook_channel_enabled?: boolean
    auto_checkin_task_enabled?: boolean
    webdav_auto_sync_task_enabled?: boolean
    managed_site_model_sync_task_enabled?: boolean
    usage_history_sync_task_enabled?: boolean
    balance_history_capture_task_enabled?: boolean
    site_announcements_task_enabled?: boolean
    third_party_channel_count?: number
    task_enabled_count?: number
    notification_enabled?: boolean
    global_enabled?: boolean
    ui_pretrigger_enabled?: boolean
    notify_completion_enabled?: boolean
    retry_enabled?: boolean
    schedule_mode?: ProductAnalyticsAutoCheckinScheduleMode
    retry_interval_minutes?: number
    retry_max_attempts?: number
    window_length_minutes?: number
    deterministic_time_minutes?: number
    entrypoint: ProductAnalyticsEntrypoint
  }
  [PRODUCT_ANALYTICS_EVENTS.SettingsSnapshotCaptured]: Omit<
    ProductAnalyticsEventPayloadMap[typeof PRODUCT_ANALYTICS_EVENTS.SettingChanged],
    "setting_id"
  > & {
    setting_id?: ProductAnalyticsSettingId
    theme_mode?: ThemeMode
    normalized_language?: SupportedUiLanguage
    toolbar_action_click_behavior?: ProductAnalyticsToolbarActionClickBehavior
    open_changelog_on_update_enabled?: boolean
    active_tab?: DashboardTabType
    currency_type?: CurrencyType
    sort_field?: ProductAnalyticsSortField
    sort_order?: SortOrder
    sorting_priority_configured?: boolean
    sorting_priority_customized?: boolean
    sorting_priority_enabled_criteria_count?: number
    console_logging_enabled?: boolean
    log_level?: LogLevel
    account_auto_refresh_enabled?: boolean
    account_auto_refresh_on_open_enabled?: boolean
    account_auto_refresh_interval_minutes?: number
    account_auto_refresh_min_interval_seconds?: number
    usage_history_enabled?: boolean
    usage_history_mode?: ProductAnalyticsModeId
    usage_history_sync_interval_minutes?: number
    usage_history_retention_days?: number
    balance_history_enabled?: boolean
    balance_history_end_of_day_capture_enabled?: boolean
    balance_history_estimated_today_income_enabled?: boolean
    balance_history_retention_days?: number
    managed_site_model_sync_enabled?: boolean
    managed_site_model_sync_interval_minutes?: number
    managed_site_model_sync_concurrency?: number
    managed_site_model_sync_retry_max_attempts?: number
    managed_site_model_sync_channel_timeout_seconds?: number
    managed_site_model_sync_rate_limit_rpm?: number
    managed_site_model_sync_rate_limit_burst?: number
    managed_site_model_sync_allowed_models_configured?: boolean
    managed_site_model_sync_global_filters_configured?: boolean
    auto_checkin_global_enabled?: boolean
    auto_checkin_ui_pretrigger_enabled?: boolean
    auto_checkin_notify_completion_enabled?: boolean
    auto_checkin_retry_enabled?: boolean
    auto_checkin_schedule_mode?: ProductAnalyticsAutoCheckinScheduleMode
    auto_checkin_retry_interval_minutes?: number
    auto_checkin_retry_max_attempts?: number
    auto_checkin_window_length_minutes?: number
    auto_checkin_deterministic_time_minutes?: number
    model_redirect_enabled?: boolean
    model_redirect_standard_models_configured?: boolean
    model_redirect_prune_missing_targets_on_model_sync_enabled?: boolean
    redemption_assist_enabled?: boolean
    redemption_assist_context_menu_enabled?: boolean
    redemption_assist_relaxed_code_validation_enabled?: boolean
    redemption_assist_allowlist_enabled?: boolean
    redemption_assist_allowlist_patterns_configured?: boolean
    redemption_assist_allowlist_account_urls_enabled?: boolean
    redemption_assist_allowlist_checkin_redeem_urls_enabled?: boolean
    web_ai_api_check_enabled?: boolean
    web_ai_api_check_context_menu_enabled?: boolean
    web_ai_api_check_auto_detect_enabled?: boolean
    web_ai_api_check_auto_detect_enhanced_enabled?: boolean
    web_ai_api_check_auto_detect_patterns_configured?: boolean
    temp_window_fallback_enabled?: boolean
    temp_window_fallback_popup_enabled?: boolean
    temp_window_fallback_sidepanel_enabled?: boolean
    temp_window_fallback_options_enabled?: boolean
    temp_window_fallback_auto_refresh_enabled?: boolean
    temp_window_fallback_manual_refresh_enabled?: boolean
    temp_window_fallback_mode?: ProductAnalyticsModeId
    temp_window_fallback_reminder_dismissed?: boolean
    webdav_configured?: boolean
    webdav_auto_sync_enabled?: boolean
    webdav_backup_encryption_enabled?: boolean
    webdav_sync_strategy?: ProductAnalyticsModeId
    webdav_sync_interval_minutes?: number
    webdav_sync_accounts_enabled?: boolean
    webdav_sync_bookmarks_enabled?: boolean
    webdav_sync_api_profiles_enabled?: boolean
    webdav_sync_preferences_enabled?: boolean
    task_notifications_enabled?: boolean
    task_notifications_browser_channel_enabled?: boolean
    task_notifications_telegram_channel_enabled?: boolean
    task_notifications_feishu_channel_enabled?: boolean
    task_notifications_dingtalk_channel_enabled?: boolean
    task_notifications_wecom_channel_enabled?: boolean
    task_notifications_ntfy_channel_enabled?: boolean
    task_notifications_webhook_channel_enabled?: boolean
    task_notifications_auto_checkin_task_enabled?: boolean
    task_notifications_webdav_auto_sync_task_enabled?: boolean
    task_notifications_managed_site_model_sync_task_enabled?: boolean
    task_notifications_usage_history_sync_task_enabled?: boolean
    task_notifications_balance_history_capture_task_enabled?: boolean
    task_notifications_site_announcements_task_enabled?: boolean
    task_notifications_third_party_channel_count?: number
    task_notifications_task_enabled_count?: number
    site_announcements_enabled?: boolean
    site_announcements_notification_enabled?: boolean
    site_announcements_polling_interval_minutes?: number
  }
  [PRODUCT_ANALYTICS_EVENTS.PermissionResult]: {
    permission_id: ProductAnalyticsPermissionId
    result: ProductAnalyticsResult
    operation: ProductAnalyticsPermissionOperation
    outcome: ProductAnalyticsPermissionOutcome
    failure_reason?: ProductAnalyticsPermissionFailureReason
    was_granted_before: boolean
    was_granted_after: boolean
    entrypoint: ProductAnalyticsEntrypoint
  }
  [PRODUCT_ANALYTICS_EVENTS.SiteEcosystemSnapshot]: {
    total_account_count: number
    distinct_site_count: number
    known_site_type_count: number
    unknown_site_count: number
    managed_site_count: number
  }
  [PRODUCT_ANALYTICS_EVENTS.SiteTypePresent]: {
    site_type: ProductAnalyticsSiteType
    account_count: number
  }
}

export type ProductAnalyticsEventPayload<
  TEventName extends ProductAnalyticsEventName,
> = ProductAnalyticsEventPayloadMap[TEventName]

/**
 * Sends a typed product analytics event to the background runtime handler.
 * Telemetry dispatch is best-effort and must not block product flows.
 */
export async function trackProductAnalyticsEvent<
  TEventName extends ProductAnalyticsEventName,
>(
  eventName: TEventName,
  properties: ProductAnalyticsEventPayload<TEventName>,
): Promise<boolean> {
  try {
    const request = {
      eventName,
      properties,
    } satisfies ProductAnalyticsTrackRequest<TEventName>

    if (isExtensionBackground()) {
      void import("~/services/productAnalytics/runtime")
        .then(({ handleProductAnalyticsMessage }) =>
          handleProductAnalyticsMessage(
            ProductAnalyticsMessageTypes.TrackEvent,
            request as ProductAnalyticsTrackRequestDiscriminated,
          ),
        )
        .then((response) => {
          if (response.success === false) {
            logger.warn("Product analytics event dispatch was rejected")
          }
        })
        .catch((error) => {
          logger.warn("Product analytics event dispatch failed", error)
        })
      return true
    }

    void Promise.resolve(
      sendProductAnalyticsMessage(
        ProductAnalyticsMessageTypes.TrackEvent,
        request as ProductAnalyticsTrackRequestDiscriminated,
      ),
    )
      .then((response) => {
        if (
          response &&
          typeof response === "object" &&
          "success" in response &&
          response.success === false
        ) {
          logger.warn("Product analytics event dispatch was rejected")
        }
      })
      .catch((error) => {
        logger.warn("Product analytics event dispatch failed", error)
      })
    return true
  } catch (error) {
    logger.warn("Product analytics event dispatch failed", error)
    return false
  }
}
