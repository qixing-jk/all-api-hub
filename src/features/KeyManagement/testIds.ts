export const KEY_MANAGEMENT_TEST_IDS = {
  addTokenButton: "key-management-add-token-button",
  emptyStateAddTokenButton: "key-management-empty-state-add-token-button",
  saveToApiProfilesButton: "key-management-save-to-api-profiles-button",
  exportToCCSwitchButton: "key-management-export-to-cc-switch-button",
  serviceCredentialExportToCCSwitchButton:
    "key-management-service-credential-export-to-cc-switch-button",
  verifyTokenApiButton: "key-management-verify-token-api-button",
  verifyTokenCliSupportButton: "key-management-verify-token-cli-support-button",
  batchSaveToApiProfilesButton:
    "key-management-batch-save-to-api-profiles-button",
  keyResourceSecretDisplay: "key-management-key-resource-secret-display",
  keyResourceSummaryFacts: "key-management-key-resource-summary-facts",
  tokenRowActions: "key-management-token-row-actions",
  managedSiteStatusBadge: "key-management-managed-site-status-badge",
  importToManagedSiteButton: "key-management-import-to-managed-site-button",
  managedSiteBatchExportCancelButton:
    "key-management-managed-site-batch-export-cancel-button",
  managedSiteBatchExportCloseButton:
    "key-management-managed-site-batch-export-close-button",
  managedSiteBatchExportStartButton:
    "key-management-managed-site-batch-export-start-button",
  managedSiteBatchExportRowSelectCheckbox:
    "key-management-managed-site-batch-export-row-select-checkbox",
  managedSiteBatchExportVerifyButton:
    "key-management-managed-site-batch-export-verify-button",
  managedSiteBatchExportUseCompleteChecksButton:
    "key-management-managed-site-batch-export-use-complete-checks-button",
  managedSiteBatchExportTargetSwitcher:
    "key-management-managed-site-batch-export-target-switcher",
  managedSiteBatchExportRetryButton:
    "key-management-managed-site-batch-export-retry-button",
  repairCreatedManagedSiteImportCard:
    "key-management-repair-created-managed-site-import-card",
  repairCreatedManagedSiteImportButton:
    "key-management-repair-created-managed-site-import-button",
  repairCreatedManagedSiteImportTargetSwitcher:
    "key-management-repair-created-managed-site-import-target-switcher",
  repairInvalidKeysConfirmDeleteButton: "repair-invalid-keys-confirm-delete",
  managedSiteChannelLinkButton:
    "key-management-managed-site-channel-link-button",
  managedSiteVerificationRetryButton:
    "key-management-managed-site-verification-retry-button",
  openSelectedAccountModelsButton:
    "key-management-open-selected-account-models-button",
  serviceCredentialCard: "key-management-service-credential-card",
  titleActions: "key-management-title-actions",
  deleteTokenConfirmButton: "key-management-delete-token-confirm-button",
  deleteTokenErrorToast: "key-management-delete-token-error-toast",
  accountScopeSelect: "key-management-account-scope-select",
  accountScopeAllOption: "key-management-account-scope-all-option",
  expandAllButton: "key-management-expand-all-button",
  openRouterWorkspaceSelect: "key-management-openrouter-workspace-select",
  nativeEditor: "key-management-native-editor",
  nativeEditorFooter: "key-management-native-editor-footer",
  nativeEditorLoading: "key-management-native-editor-loading",
  nativeStatusFilter: "key-management-native-status-filter",
  nativeEditorSubmitButton: "key-management-native-editor-submit-button",
  nativeKeyRow: "key-management-native-key-row",
  nativeDeleteConfirmButton: "key-management-native-delete-confirm-button",
} as const

export const KEY_MANAGEMENT_TOKEN_ROW_TEST_ID_PREFIX =
  "key-management-token-row-" as const
const KEY_MANAGEMENT_REPAIR_ACCOUNT_RESULT_TEST_ID_PREFIX =
  "key-management-repair-account-result-" as const
const KEY_MANAGEMENT_MANAGED_SITE_BATCH_EXPORT_ROW_SELECT_TEST_ID_PREFIX =
  `${KEY_MANAGEMENT_TEST_IDS.managedSiteBatchExportRowSelectCheckbox}-` as const

/**
 * Returns the stable test id for a rendered API key row.
 */
export function getKeyManagementTokenRowTestId(tokenId: string | number) {
  return `${KEY_MANAGEMENT_TOKEN_ROW_TEST_ID_PREFIX}${tokenId}`
}

/** Returns the stable test id for one repair account result. */
export function getRepairAccountResultTestId(accountId: string) {
  return `${KEY_MANAGEMENT_REPAIR_ACCOUNT_RESULT_TEST_ID_PREFIX}${accountId}`
}

/** Returns the stable selector for one batch-import runtime-key checkbox. */
export function getManagedSiteBatchExportRowSelectTestId(runtimeKeyId: string) {
  return `${KEY_MANAGEMENT_MANAGED_SITE_BATCH_EXPORT_ROW_SELECT_TEST_ID_PREFIX}${runtimeKeyId}`
}
