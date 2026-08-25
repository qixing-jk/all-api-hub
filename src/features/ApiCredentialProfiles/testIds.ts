import type { ApiVerificationProbeId } from "~/services/verification/aiApiVerification"

export const API_CREDENTIAL_PROFILES_TEST_IDS = {
  addButton: "api-credential-profiles-add-button",
  dialog: "api-credential-profile-dialog",
  dialogSaveButton: "api-credential-profile-dialog-save-button",
  deleteConfirmButton: "api-credential-profile-delete-confirm-button",
  deleteTriggerButton: "api-credential-profile-delete-trigger-button",
  editButton: "api-credential-profile-edit-button",
  endpointNavigation: "api-credential-profile-endpoint-navigation",
  endpointSelector: "api-credential-profile-endpoint-selector",
  endpointCopyBaseUrlButton:
    "api-credential-profile-endpoint-copy-base-url-button",
  endpointAddCredentialButton:
    "api-credential-profile-endpoint-add-credential-button",
  endpointNavigationAddCredentialButton:
    "api-credential-profile-endpoint-navigation-add-credential-button",
  endpointBaseUrl: "api-credential-profile-endpoint-base-url",
  endpointCredentialCount: "api-credential-profile-endpoint-credential-count",
  exportMenuButton: "api-credential-profile-export-menu-button",
  copyKelivoImportCodeMenuItem:
    "api-credential-profile-copy-kelivo-import-code-menu-item",
  exportToCCSwitchMenuItem:
    "api-credential-profile-export-to-cc-switch-menu-item",
  exportToCursorPlusMenuItem:
    "api-credential-profile-export-to-cursor-plus-menu-item",
  importToManagedSiteButton:
    "api-credential-profile-import-to-managed-site-button",
  exportToKiloCodeMenuItem:
    "api-credential-profile-export-to-kilo-code-menu-item",
  exportToCliProxyMenuItem:
    "api-credential-profile-export-to-cli-proxy-menu-item",
  exportToClaudeCodeRouterMenuItem:
    "api-credential-profile-export-to-claude-code-router-menu-item",
  openModelManagementButton:
    "api-credential-profile-open-model-management-button",
  popupView: "api-credential-profiles-popup-view",
  showKeyButton: "api-credential-profile-show-key-button",
  copyApiKeyButton: "api-credential-profile-copy-api-key-button",
  copyBundleButton: "api-credential-profile-copy-bundle-button",
  verifyButton: "api-credential-profile-verify-button",
  verifyCliSupportButton: "api-credential-profile-verify-cli-support-button",
  verifyDialogCloseButton: "api-credential-profile-verify-dialog-close-button",
  verifyProbeRunButton: "api-credential-profile-verify-probe-run-button",
  verifyModelId: "profile-verify-model-id",
  telemetryBalance: "api-credential-telemetry-balance",
  telemetryQuota: "api-credential-telemetry-quota",
  telemetryPanel: "api-credential-telemetry-panel",
  telemetryToggle: "api-credential-telemetry-toggle",
  telemetryTodayUsage: "api-credential-telemetry-today-usage",
  telemetryTodayRequests: "api-credential-telemetry-today-requests",
  telemetryModels: "api-credential-telemetry-models",
  toolbar: "api-credential-profile-toolbar",
  toolbarQuickActionsGroup:
    "api-credential-profile-toolbar-quick-actions-group",
  toolbarIntegrationsGroup: "api-credential-profile-toolbar-integrations-group",
  toolbarDiagnosticsGroup: "api-credential-profile-toolbar-diagnostics-group",
  toolbarManagementGroup: "api-credential-profile-toolbar-management-group",
  associationButton: "api-credential-profile-association-button",
  targetMissingMessage: "api-credential-profile-target-missing-message",
} as const

const API_CREDENTIAL_ENDPOINT_OPTION_TEST_ID_PREFIX =
  "api-credential-profile-endpoint-option-"
const API_CREDENTIAL_PROFILE_ROW_ID_PREFIX = "api-credential-profile-row-"

/** Returns the stable DOM target id for a stored profile row. */
export function getApiCredentialProfileRowTargetId(profileId: string) {
  return `${API_CREDENTIAL_PROFILE_ROW_ID_PREFIX}${encodeURIComponent(profileId)}`
}

/** Returns the stable test id for a stored profile row. */
export function getApiCredentialProfileRowTestId(profileId: string) {
  return `${API_CREDENTIAL_PROFILE_ROW_ID_PREFIX}${encodeURIComponent(profileId)}`
}

/** Returns the stable test id for the endpoint option containing a profile. */
export function getApiCredentialEndpointOptionTestId(profileId: string) {
  return `${API_CREDENTIAL_ENDPOINT_OPTION_TEST_ID_PREFIX}${profileId}`
}

const API_CREDENTIAL_PROFILE_VERIFY_PROBE_TEST_ID_PREFIX =
  "profile-verify-probe-"

/**
 * Returns the stable test id for an API credential verification probe card.
 */
export function getApiCredentialProfileVerifyProbeTestId(
  probeId: ApiVerificationProbeId,
) {
  return `${API_CREDENTIAL_PROFILE_VERIFY_PROBE_TEST_ID_PREFIX}${probeId}`
}
