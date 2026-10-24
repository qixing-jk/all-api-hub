/** Internal actions shared without eagerly loading the toast component tree. */
export const API_CHECK_CONFIRM_TOAST_ACTIONS = {
  CONFIRM: "confirm",
  CANCEL: "cancel",
  SETTINGS: "settings",
  FEEDBACK: "feedback",
  DISABLE_SITE: "disableSite",
} as const

export type ApiCheckConfirmToastAction =
  (typeof API_CHECK_CONFIRM_TOAST_ACTIONS)[keyof typeof API_CHECK_CONFIRM_TOAST_ACTIONS]
