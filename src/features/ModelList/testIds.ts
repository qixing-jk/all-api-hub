export const MODEL_LIST_TEST_IDS = {
  page: "model-list-page",
  controlPanel: "model-list-control-panel",
  modelDisplay: "model-list-display",
  addApiCredentialProfileButton: "model-list-add-api-credential-profile-button",
  addFirstAccountButton: "model-list-add-first-account-button",
  modelKeyDialogButton: "model-list-model-key-dialog-button",
  modelKeyDialog: "model-list-model-key-dialog",
  createCustomKeyButton: "model-list-create-custom-key-button",
  openKeyManagementButton: "model-list-open-key-management-button",
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
