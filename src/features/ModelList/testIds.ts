export const MODEL_LIST_TEST_IDS = {
  page: "model-list-page",
  controlPanel: "model-list-control-panel",
  modelDisplay: "model-list-display",
  sourceSelector: "model-list-source-selector",
  addApiCredentialProfileButton: "model-list-add-api-credential-profile-button",
  addFirstAccountButton: "model-list-add-first-account-button",
  modelKeyDialogButton: "model-list-model-key-dialog-button",
  verifyApiButton: "model-list-verify-api-button",
  verifyCliSupportButton: "model-list-verify-cli-support-button",
  batchVerifyButton: "model-list-batch-verify-button",
  modelKeyDialog: "model-list-model-key-dialog",
  createCustomKeyButton: "model-list-create-custom-key-button",
  openKeyManagementButton: "model-list-open-key-management-button",
  openSelectedAccountKeysButton: "model-list-open-selected-account-keys-button",
  titleActions: "model-list-title-actions",
} as const

/**
 * Returns the stable test id for a rendered batch verification row.
 */
export function getBatchVerifyRowTestId(itemKey: string) {
  return `batch-verify-row-${itemKey}`
}

/**
 * Returns the stable test id for a batch verification model checkbox.
 */
export function getBatchVerifyModelCheckboxTestId(itemKey: string) {
  return `batch-verify-model-checkbox-${itemKey}`
}
