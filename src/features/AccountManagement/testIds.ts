export const ACCOUNT_MANAGEMENT_TEST_IDS = {
  addAccountButton: "account-management-add-account-button",
  accountDialog: "account-management-account-dialog",
  accountForm: "account-management-account-form",
  accountListView: "account-list-view",
  siteUrlInput: "account-management-site-url-input",
  authTypeTrigger: "account-management-auth-type-trigger",
  autoDetectButton: "account-management-auto-detect-button",
  manualAddButton: "account-management-manual-add-button",
  siteNameInput: "account-management-site-name-input",
  siteTypeTrigger: "account-management-site-type-trigger",
  usernameInput: "account-management-username-input",
  userIdInput: "account-management-user-id-input",
  accessTokenInput: "account-management-access-token-input",
  sub2apiRefreshTokenSwitch: "account-management-sub2api-refresh-token-switch",
  sub2apiImportSessionButton:
    "account-management-sub2api-import-session-button",
  sub2apiRefreshTokenInput: "account-management-sub2api-refresh-token-input",
  confirmAddButton: "account-management-confirm-add-button",
} as const

/**
 * Returns a stable test id for a rendered account row.
 */
export function getAccountManagementListItemTestId(accountId: string) {
  return `account-management-account-list-item-${accountId}`
}
