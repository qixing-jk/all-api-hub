export const RuntimeActionIds = {
  AccountDialogImportCookieAuthSessionCookie:
    "accountDialog:importCookieAuthSessionCookie",
  ExternalCheckInOpenAndMark: "externalCheckIn:openAndMark",
} as const

export type RuntimeActionId =
  (typeof RuntimeActionIds)[keyof typeof RuntimeActionIds]
