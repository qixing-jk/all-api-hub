export const KEY_MANAGEMENT_TEST_IDS = {
  addTokenButton: "key-management-add-token-button",
  emptyStateAddTokenButton: "key-management-empty-state-add-token-button",
  saveToApiProfilesButton: "key-management-save-to-api-profiles-button",
  verifyTokenApiButton: "key-management-verify-token-api-button",
  verifyTokenCliSupportButton: "key-management-verify-token-cli-support-button",
  batchSaveToApiProfilesButton:
    "key-management-batch-save-to-api-profiles-button",
  tokenRowActions: "key-management-token-row-actions",
  openSelectedAccountModelsButton:
    "key-management-open-selected-account-models-button",
  titleActions: "key-management-title-actions",
  deleteTokenConfirmButton: "key-management-delete-token-confirm-button",
  accountScopeSelect: "key-management-account-scope-select",
  accountScopeAllOption: "key-management-account-scope-all-option",
  expandAllButton: "key-management-expand-all-button",
} as const

export const KEY_MANAGEMENT_TOKEN_ROW_TEST_ID_PREFIX =
  "key-management-token-row-" as const

/**
 * Returns the stable test id for a rendered API key row.
 */
export function getKeyManagementTokenRowTestId(tokenId: string | number) {
  return `${KEY_MANAGEMENT_TOKEN_ROW_TEST_ID_PREFIX}${tokenId}`
}
