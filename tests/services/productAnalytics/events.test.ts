import { describe, expect, it } from "vitest"

import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

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
})
