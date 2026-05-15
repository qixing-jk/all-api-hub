import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  ACCOUNT_SITE_TYPES,
  MANAGED_SITE_TYPES,
  type ManagedSiteType,
} from "~/constants/siteType"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"

export const PRODUCT_ANALYTICS_EVENTS = {
  AppOpened: "app_opened",
  PageViewed: "page_viewed",
  FeatureActionStarted: "feature_action_started",
  FeatureActionCompleted: "feature_action_completed",
  SettingChanged: "setting_changed",
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

export const PRODUCT_ANALYTICS_DURATION_BUCKETS = {
  LessThan1s: "lt_1s",
  OneTo5s: "1_5s",
  FiveTo30s: "5_30s",
  ThirtyTo120s: "30_120s",
  GreaterThan120s: "gt_120s",
} as const

export type ProductAnalyticsDurationBucket =
  (typeof PRODUCT_ANALYTICS_DURATION_BUCKETS)[keyof typeof PRODUCT_ANALYTICS_DURATION_BUCKETS]

export const PRODUCT_ANALYTICS_COUNT_BUCKETS = {
  Zero: "0",
  One: "1",
  TwoToThree: "2_3",
  FourToTen: "4_10",
  TenPlus: "10_plus",
} as const

export type ProductAnalyticsCountBucket =
  (typeof PRODUCT_ANALYTICS_COUNT_BUCKETS)[keyof typeof PRODUCT_ANALYTICS_COUNT_BUCKETS]

export const PRODUCT_ANALYTICS_SOURCE_KINDS = {
  History: "history",
  Manual: "manual",
  Row: "row",
  Auto: "auto",
  ModelAllAccounts: "model_all_accounts",
  ModelAccount: "model_account",
  ModelProfile: "model_profile",
  ModelFallbackCatalog: "model_fallback_catalog",
  Unknown: "unknown",
} as const

export type ProductAnalyticsSourceKind =
  (typeof PRODUCT_ANALYTICS_SOURCE_KINDS)[keyof typeof PRODUCT_ANALYTICS_SOURCE_KINDS]

export const PRODUCT_ANALYTICS_MODE_IDS = {
  All: "all",
  Selected: "selected",
  Single: "single",
  RetryFailed: "retry_failed",
  Export: "export",
  SearchFilter: "search_filter",
  ProviderFilter: "provider_filter",
  SortFilter: "sort_filter",
  BillingFilter: "billing_filter",
  GroupFilter: "group_filter",
  AccountFilter: "account_filter",
  ExpandDetails: "expand_details",
  CollapseDetails: "collapse_details",
  ApiVerification: "api_verification",
  CliVerification: "cli_verification",
} as const

export type ProductAnalyticsModeId =
  (typeof PRODUCT_ANALYTICS_MODE_IDS)[keyof typeof PRODUCT_ANALYTICS_MODE_IDS]

export const PRODUCT_ANALYTICS_STATUS_KINDS = {
  Healthy: "healthy",
  Warning: "warning",
  Error: "error",
  Unknown: "unknown",
} as const

export type ProductAnalyticsStatusKind =
  (typeof PRODUCT_ANALYTICS_STATUS_KINDS)[keyof typeof PRODUCT_ANALYTICS_STATUS_KINDS]

export const PRODUCT_ANALYTICS_TELEMETRY_SOURCES = {
  Models: "models",
  OpenAiBilling: "openaiBilling",
  NewApiTokenUsage: "newApiTokenUsage",
  Sub2ApiUsage: "sub2apiUsage",
  CustomReadOnlyEndpoint: "customReadOnlyEndpoint",
} as const

export type ProductAnalyticsTelemetrySource =
  (typeof PRODUCT_ANALYTICS_TELEMETRY_SOURCES)[keyof typeof PRODUCT_ANALYTICS_TELEMETRY_SOURCES]

export const PRODUCT_ANALYTICS_PAGE_IDS = {
  PopupAccounts: "popup_accounts",
  PopupBookmarks: "popup_bookmarks",
  PopupApiCredentialProfiles: "popup_api_credential_profiles",
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
  PermissionRequest: "permission_request",
  ProductAnalyticsSettings: "product_analytics_settings",
  RedemptionAssist: "redemption_assist",
  ShareSnapshots: "share_snapshots",
  ShieldBypassAssist: "shield_bypass_assist",
  SiteAnnouncements: "site_announcements",
  SiteEcosystemSnapshot: "site_ecosystem_snapshot",
  SidepanelNavigation: "sidepanel_navigation",
  UsageAnalytics: "usage_analytics",
  WebDavSync: "webdav_sync",
  WebAiApiCheck: "web_ai_api_check",
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
  DeleteManagedSiteChannel: "delete_managed_site_channel",
  DeleteSelectedManagedSiteChannels: "delete_selected_managed_site_channels",
  DisableSelectedAccounts: "disable_selected_accounts",
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
  FetchApiCredentialModelList: "fetch_api_credential_model_list",
  FilterAutoCheckinResults: "filter_auto_checkin_results",
  FilterAccounts: "filter_accounts",
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
  OpenAutoCheckinManualSignIn: "open_auto_checkin_manual_sign_in",
  OpenBookmark: "open_bookmark",
  OpenBatchModelVerifyDialog: "open_batch_model_verify_dialog",
  OpenAccountKeyManagementFromModel: "open_account_key_management_from_model",
  OpenFailedAutoCheckinManualSignIns:
    "open_failed_auto_checkin_manual_sign_ins",
  OpenFilteredManagedSiteChannelMigration:
    "open_filtered_managed_site_channel_migration",
  OpenKeyList: "open_key_list",
  OpenKeyManagement: "open_key_management",
  OpenManagedSiteChannelFilters: "open_managed_site_channel_filters",
  OpenManagedSiteChannelMigration: "open_managed_site_channel_migration",
  OpenManagedSiteChannelModelSync: "open_managed_site_channel_model_sync",
  OpenModelKeyDialog: "open_model_key_dialog",
  OpenModelManagement: "open_model_management",
  OpenPopupExternalCheckIns: "open_popup_external_check_ins",
  OpenPopupAccountManagementPage: "open_popup_account_management_page",
  OpenPopupApiCredentialProfilesPage: "open_popup_api_credential_profiles_page",
  OpenPopupBookmarkManagementPage: "open_popup_bookmark_management_page",
  OpenPopupKeyManagement: "open_popup_key_management",
  OpenPopupModelManagement: "open_popup_model_management",
  OpenPopupSettingsPage: "open_popup_settings_page",
  OpenSidepanelFromPopup: "open_sidepanel_from_popup",
  OpenSidepanelFromToolbarAction: "open_sidepanel_from_toolbar_action",
  OpenUpdateAccountDialog: "open_update_account_dialog",
  OpenBalanceHistorySettings: "open_balance_history_settings",
  OpenRedeemPage: "open_redeem_page",
  OpenSelectedManagedSiteChannelMigration:
    "open_selected_managed_site_channel_migration",
  OpenUsageSyncSettings: "open_usage_sync_settings",
  PruneBalanceHistorySnapshots: "prune_balance_history_snapshots",
  RefreshAccount: "refresh_account",
  RefreshAccountTokens: "refresh_account_tokens",
  RefreshAllAccounts: "refresh_all_accounts",
  RefreshApiCredentialTelemetry: "refresh_api_credential_telemetry",
  RefreshAutoCheckinStatus: "refresh_auto_checkin_status",
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
  SaveManagedSiteChannelModelFilters: "save_managed_site_channel_model_filters",
  ScanDuplicateAccounts: "scan_duplicate_accounts",
  SearchAccounts: "search_accounts",
  SelectModelSource: "select_model_source",
  FilterModelList: "filter_model_list",
  ToggleModelDetails: "toggle_model_details",
  SelectApiCredentialProfilesView: "select_api_credential_profiles_view",
  SelectBookmarksView: "select_bookmarks_view",
  SelectAccountsView: "select_accounts_view",
  ShareOverviewSnapshot: "share_overview_snapshot",
  ShieldBypassPromptDismissed: "shield_bypass_prompt_dismissed",
  ShieldBypassSettingsVisited: "shield_bypass_settings_visited",
  StartBatchModelVerify: "start_batch_model_verify",
  StopBatchModelVerify: "stop_batch_model_verify",
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
} as const

export type ProductAnalyticsActionId =
  (typeof PRODUCT_ANALYTICS_ACTION_IDS)[keyof typeof PRODUCT_ANALYTICS_ACTION_IDS]

export const PRODUCT_ANALYTICS_SURFACE_IDS = {
  AccountTokenThirdPartyExportDialog: "account_token_third_party_export_dialog",
  BackgroundAutoCheckinScheduler: "background_auto_checkin_scheduler",
  BackgroundShieldBypassTempContext: "background_shield_bypass_temp_context",
  OptionsAutoCheckinActionBar: "options_auto_checkin_action_bar",
  OptionsAutoCheckinFilterBar: "options_auto_checkin_filter_bar",
  OptionsAutoCheckinResultsTable: "options_auto_checkin_results_table",
  OptionsBalanceHistoryPage: "options_balance_history_page",
  OptionsAccountManagementHeader: "options_account_management_header",
  OptionsAccountManagementPage: "options_account_management_page",
  OptionsAccountManagementRowActions: "options_account_management_row_actions",
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
  PopupHeader: "popup_header",
  PopupViewTabs: "popup_view_tabs",
  SidepanelActionBar: "sidepanel_action_bar",
  SidepanelHeader: "sidepanel_header",
  SidepanelViewTabs: "sidepanel_view_tabs",
} as const

export type ProductAnalyticsSurfaceId =
  (typeof PRODUCT_ANALYTICS_SURFACE_IDS)[keyof typeof PRODUCT_ANALYTICS_SURFACE_IDS]

export const PRODUCT_ANALYTICS_SETTING_IDS = {
  ProductAnalyticsEnabled: "product_analytics_enabled",
} as const

export type ProductAnalyticsSettingId =
  (typeof PRODUCT_ANALYTICS_SETTING_IDS)[keyof typeof PRODUCT_ANALYTICS_SETTING_IDS]

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

export const PRODUCT_ANALYTICS_SITE_TYPES = [
  ...new Set([...ACCOUNT_SITE_TYPES, ...MANAGED_SITE_TYPES]),
] as ReadonlyArray<(typeof ACCOUNT_SITE_TYPES)[number] | ManagedSiteType>
export type ProductAnalyticsSiteType =
  (typeof PRODUCT_ANALYTICS_SITE_TYPES)[number]

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
    duration_bucket?: ProductAnalyticsDurationBucket
    source_kind?: ProductAnalyticsSourceKind
    mode?: ProductAnalyticsModeId
    status_kind?: ProductAnalyticsStatusKind
    telemetry_source?: ProductAnalyticsTelemetrySource
    item_count_bucket?: ProductAnalyticsCountBucket
    selected_count_bucket?: ProductAnalyticsCountBucket
    success_count_bucket?: ProductAnalyticsCountBucket
    failure_count_bucket?: ProductAnalyticsCountBucket
    model_count_bucket?: ProductAnalyticsCountBucket
    usage_data_present?: boolean
    entrypoint: ProductAnalyticsEntrypoint
  }
  [PRODUCT_ANALYTICS_EVENTS.SettingChanged]: {
    setting_id: ProductAnalyticsSettingId
    enabled: boolean
    entrypoint: ProductAnalyticsEntrypoint
  }
  [PRODUCT_ANALYTICS_EVENTS.PermissionResult]: {
    permission_id: ProductAnalyticsPermissionId
    result: ProductAnalyticsResult
    entrypoint: ProductAnalyticsEntrypoint
  }
  [PRODUCT_ANALYTICS_EVENTS.SiteEcosystemSnapshot]: {
    total_account_count_bucket: ProductAnalyticsCountBucket
    distinct_site_count_bucket: ProductAnalyticsCountBucket
    known_site_type_count_bucket: ProductAnalyticsCountBucket
    unknown_site_count_bucket: ProductAnalyticsCountBucket
    managed_site_count_bucket: ProductAnalyticsCountBucket
  }
  [PRODUCT_ANALYTICS_EVENTS.SiteTypePresent]: {
    site_type: ProductAnalyticsSiteType
    account_count_bucket: ProductAnalyticsCountBucket
  }
}

export type ProductAnalyticsEventPayload<
  TEventName extends ProductAnalyticsEventName,
> = ProductAnalyticsEventPayloadMap[TEventName]

export type ProductAnalyticsTrackRequest<
  TEventName extends ProductAnalyticsEventName = ProductAnalyticsEventName,
> = {
  action: typeof RuntimeActionIds.ProductAnalyticsTrackEvent
  eventName: TEventName
  properties: ProductAnalyticsEventPayload<TEventName>
}

export type ProductAnalyticsTrackSiteEcosystemRequest = {
  action: typeof RuntimeActionIds.ProductAnalyticsTrackSiteEcosystemSnapshot
  reason: "startup" | "account_changed" | "manual"
}

export type ProductAnalyticsRuntimeRequest =
  | ProductAnalyticsTrackRequest
  | ProductAnalyticsTrackSiteEcosystemRequest

/**
 * Sends a typed product analytics event to the background runtime handler.
 */
export function trackProductAnalyticsEvent<
  TEventName extends ProductAnalyticsEventName,
>(
  eventName: TEventName,
  properties: ProductAnalyticsEventPayload<TEventName>,
): Promise<unknown> {
  return sendRuntimeMessage({
    action: RuntimeActionIds.ProductAnalyticsTrackEvent,
    eventName,
    properties,
  } satisfies ProductAnalyticsTrackRequest<TEventName>)
}
