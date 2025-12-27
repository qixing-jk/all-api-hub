export const RuntimeActionIds = {
  AccountDialogImportCookieAuthSessionCookie:
    "accountDialog:importCookieAuthSessionCookie",
} as const

export type RuntimeActionId =
  (typeof RuntimeActionIds)[keyof typeof RuntimeActionIds]
