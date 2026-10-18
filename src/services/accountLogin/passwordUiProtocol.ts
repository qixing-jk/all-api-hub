import type { AccountLoginResult } from "~/services/apiAdapters/contracts/accountLogin"

import type { PasswordLoginContentRequest } from "./passwordContent"

/** Wire values used by the background executor and native-page handler. */
export const PASSWORD_UI_PHASES = {
  Prepare: "prepare",
  Submit: "submit",
  Observe: "observe",
} as const
export type PasswordUiPhase =
  (typeof PASSWORD_UI_PHASES)[keyof typeof PASSWORD_UI_PHASES]

export const PASSWORD_UI_KINDS = {
  Ready: "ready",
  Submitted: "submitted",
  Pending: "pending",
  Fallback: "fallback",
  Reload: "reload",
  Manual: "manual",
} as const
export const PASSWORD_UI_REASONS = { Session: "session" } as const

/** Content messages are untrusted until their context and credentials are validated. */
export type PasswordUiRequest = PasswordLoginContentRequest & {
  phase?: unknown
  sessionMode?: unknown
  canResetSession?: unknown
}
export type PasswordUiReply =
  | AccountLoginResult
  | {
      kind: (typeof PASSWORD_UI_KINDS)[keyof typeof PASSWORD_UI_KINDS]
      reason?: typeof PASSWORD_UI_REASONS.Session
    }
