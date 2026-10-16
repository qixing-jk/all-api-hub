export const POPUP_VIEW_TYPES = {
  Accounts: "accounts",
  Bookmarks: "bookmarks",
  ApiCredentialProfiles: "apiCredentialProfiles",
} as const

export type PopupViewType =
  (typeof POPUP_VIEW_TYPES)[keyof typeof POPUP_VIEW_TYPES]
