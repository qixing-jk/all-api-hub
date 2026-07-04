import type { ApiVerificationProbeId } from "~/services/verification/aiApiVerification"

export const API_CREDENTIAL_PROFILES_TEST_IDS = {
  addButton: "api-credential-profiles-add-button",
  dialog: "api-credential-profile-dialog",
  dialogSaveButton: "api-credential-profile-dialog-save-button",
  deleteConfirmButton: "api-credential-profile-delete-confirm-button",
  deleteTriggerButton: "api-credential-profile-delete-trigger-button",
  editButton: "api-credential-profile-edit-button",
  exportMenuButton: "api-credential-profile-export-menu-button",
  exportToCCSwitchMenuItem:
    "api-credential-profile-export-to-cc-switch-menu-item",
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
  copyBaseUrlButton: "api-credential-profile-copy-base-url-button",
  copyApiKeyButton: "api-credential-profile-copy-api-key-button",
  copyBundleButton: "api-credential-profile-copy-bundle-button",
  verifyButton: "api-credential-profile-verify-button",
  verifyDialogCloseButton: "api-credential-profile-verify-dialog-close-button",
  verifyProbeRunButton: "api-credential-profile-verify-probe-run-button",
  verifyModelId: "profile-verify-model-id",
  telemetryBalance: "api-credential-telemetry-balance",
  telemetryTodayUsage: "api-credential-telemetry-today-usage",
  telemetryTodayRequests: "api-credential-telemetry-today-requests",
  telemetryModels: "api-credential-telemetry-models",
} as const

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
