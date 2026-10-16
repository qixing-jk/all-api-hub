export const TURNSTILE_ASSIST_PRESENTATIONS = {
  Quiet: "quiet",
  Notify: "notify",
  Both: "both",
  Page: "page",
} as const

export type TurnstileAssistPresentation =
  (typeof TURNSTILE_ASSIST_PRESENTATIONS)[keyof typeof TURNSTILE_ASSIST_PRESENTATIONS]

/** In-page reminders do not require system notification permission. */
export const DEFAULT_TURNSTILE_ASSIST_PRESENTATION =
  TURNSTILE_ASSIST_PRESENTATIONS.Page

/** Accepts the four combinations of independent reminder channels. */
export function isTurnstileAssistPresentation(
  value: unknown,
): value is TurnstileAssistPresentation {
  return Object.values(TURNSTILE_ASSIST_PRESENTATIONS).includes(
    value as TurnstileAssistPresentation,
  )
}

/** Reminder preferences never grant permission to take focus. */
export function resolveTurnstileAssistPresentation(params: {
  preference: TurnstileAssistPresentation
  canNotify: boolean
}) {
  return {
    focusWindow: false,
    page: params.preference === "page" || params.preference === "both",
    notify:
      params.canNotify &&
      (params.preference === "notify" || params.preference === "both"),
  }
}
