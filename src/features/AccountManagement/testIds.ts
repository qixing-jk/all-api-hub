export const ACCOUNT_MANAGEMENT_TEST_IDS = {
  addAccountButton: "account-management-add-account-button",
  accountDialog: "account-management-account-dialog",
  accountForm: "account-management-account-form",
  accountListView: "account-list-view",
  siteUrlInput: "account-management-site-url-input",
  authTypeTrigger: "account-management-auth-type-trigger",
  autoDetectButton: "account-management-auto-detect-button",
  manualAddButton: "account-management-manual-add-button",
  autoConfigButton: "account-management-auto-config-button",
  siteNameInput: "account-management-site-name-input",
  siteTypeTrigger: "account-management-site-type-trigger",
  usernameInput: "account-management-username-input",
  userIdInput: "account-management-user-id-input",
  accessTokenInput: "account-management-access-token-input",
  accountFormSectionSiteInfo:
    "account-management-account-form-section-site-info",
  accountFormSectionAuth: "account-management-account-form-section-auth",
  accountFormSectionTagsNotes:
    "account-management-account-form-section-tags-notes",
  accountFormSectionCheckIn: "account-management-account-form-section-check-in",
  accountFormSectionBalance: "account-management-account-form-section-balance",
  sub2apiRefreshTokenSwitch: "account-management-sub2api-refresh-token-switch",
  sub2apiImportSessionButton:
    "account-management-sub2api-import-session-button",
  sub2apiRefreshTokenInput: "account-management-sub2api-refresh-token-input",
  cookiePermissionRecommendation:
    "account-management-cookie-permission-recommendation",
  cookiePermissionGrantButton:
    "account-management-cookie-permission-grant-button",
  confirmAddButton: "account-management-confirm-add-button",
  rowOpenButton: "account-management-row-open-button",
  rowCopyUrlButton: "account-management-row-copy-url-button",
  rowCopyKeyButton: "account-management-row-copy-key-button",
  rowEditButton: "account-management-row-edit-button",
  rowMoreActionsButton: "account-management-row-more-actions-button",
  rowKeyManagementMenuItem: "account-management-row-key-management-menu-item",
  rowModelManagementMenuItem:
    "account-management-row-model-management-menu-item",
  rowUsageLogMenuItem: "account-management-row-usage-log-menu-item",
  rowRedeemMenuItem: "account-management-row-redeem-menu-item",
  rowPinToggleMenuItem: "account-management-row-pin-toggle-menu-item",
  rowQuickCheckinMenuItem: "account-management-row-quick-checkin-menu-item",
  rowRefreshMenuItem: "account-management-row-refresh-menu-item",
  rowDisableToggleMenuItem: "account-management-row-disable-toggle-menu-item",
  rowDeleteMenuItem: "account-management-row-delete-menu-item",
  deleteConfirmButton: "account-management-delete-confirm-button",
  dedupeScanButton: "account-management-dedupe-scan-button",
  dedupePreviewDeleteButton: "account-management-dedupe-preview-delete-button",
  dedupeConfirmDeleteButton: "account-management-dedupe-confirm-delete-button",
  bookmarkImportButton: "account-management-bookmark-import-button",
  bookmarkImportFromAddDialogButton:
    "account-management-bookmark-import-from-add-dialog-button",
  bookmarkImportDialog: "account-management-bookmark-import-dialog",
  bookmarkImportAllowScanButton:
    "account-management-bookmark-import-allow-scan-button",
  bookmarkImportScanSelectedButton:
    "account-management-bookmark-import-scan-selected-button",
  bookmarkImportBackToScopeButton:
    "account-management-bookmark-import-back-to-scope-button",
  bookmarkImportScopeCheckbox:
    "account-management-bookmark-import-scope-checkbox",
  bookmarkImportScopeTree: "account-management-bookmark-import-scope-tree",
  bookmarkImportImportButton:
    "account-management-bookmark-import-import-button",
  bookmarkImportIncludeExistingCheckbox:
    "account-management-bookmark-import-include-existing-checkbox",
  bookmarkImportCandidateRow:
    "account-management-bookmark-import-candidate-row",
  bookmarkImportOpenFailedAddAccountButton:
    "account-management-bookmark-import-open-failed-add-account-button",
  duplicateWarningContinueButton:
    "account-management-duplicate-warning-continue-button",
  sponsorRecommendations: "account-management-sponsor-recommendations",
  sponsorRecommendationCard: "account-management-sponsor-recommendation-card",
  sponsorPrimaryAction: "account-management-sponsor-primary-action",
  sponsorContinueAddAccountAction:
    "account-management-sponsor-continue-add-account-action",
  sponsorPostClickNote: "account-management-sponsor-post-click-note",
  sponsorFallbackBookmarkAction:
    "account-management-sponsor-fallback-bookmark-action",
  sponsorFallbackApiCredentialProfilesAction:
    "account-management-sponsor-fallback-api-credential-profiles-action",
} as const

/**
 * Returns a stable test id for a rendered account row.
 */
export function getAccountManagementListItemTestId(accountId: string) {
  return `account-management-account-list-item-${accountId}`
}
