export const KEY_MANAGEMENT_TEST_IDS = {
  addTokenButton: "key-management-add-token-button",
  addTokenDialog: "key-management-add-token-dialog",
  saveToApiProfilesButton: "key-management-save-to-api-profiles-button",
  tokenRowActions: "key-management-token-row-actions",
  openApiProfilesToastButton: "key-management-open-api-profiles-toast-button",
  addTokenSubmitButton: "key-management-add-token-submit-button",
  oneTimeKeyCloseButton: "key-management-one-time-key-close-button",
} as const

/**
 * Returns the stable test id for a rendered API key row.
 */
export function getKeyManagementTokenRowTestId(tokenId: string | number) {
  return `key-management-token-row-${tokenId}`
}
