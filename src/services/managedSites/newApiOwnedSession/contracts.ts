import type { NewApiOwnedSessionBundle } from "./lifecycle"

export const NEW_API_OWNED_SESSION_ACTIONS = {
  Capture: "new-api-owned-session:capture",
  Refresh: "new-api-owned-session:refresh",
  Touch: "new-api-owned-session:touch",
  GetStatus: "new-api-owned-session:get-status",
  Cleanup: "new-api-owned-session:cleanup",
} as const

export type NewApiOwnedSessionRequest =
  | {
      action: typeof NEW_API_OWNED_SESSION_ACTIONS.Capture
      bundle: NewApiOwnedSessionBundle
    }
  | {
      action: typeof NEW_API_OWNED_SESSION_ACTIONS.Refresh
      bundle: NewApiOwnedSessionBundle
    }
  | {
      action: typeof NEW_API_OWNED_SESSION_ACTIONS.Touch
      baseUrl: string
      sessionId?: string
    }
  | {
      action:
        | typeof NEW_API_OWNED_SESSION_ACTIONS.GetStatus
        | typeof NEW_API_OWNED_SESSION_ACTIONS.Cleanup
      baseUrl: string
    }

export type NewApiOwnedSessionResponse =
  | { success: true; owned?: boolean; status?: "cleaned" | "none" | "failed" }
  | { success: false }

export const isNewApiOwnedSessionRequest = (
  value: unknown,
): value is NewApiOwnedSessionRequest => {
  if (!value || typeof value !== "object") return false
  const request = value as Record<string, unknown>

  if (
    request.action === NEW_API_OWNED_SESSION_ACTIONS.Capture ||
    request.action === NEW_API_OWNED_SESSION_ACTIONS.Refresh
  ) {
    return Boolean(request.bundle && typeof request.bundle === "object")
  }

  if (
    request.action === NEW_API_OWNED_SESSION_ACTIONS.Touch &&
    request.sessionId !== undefined &&
    typeof request.sessionId !== "string"
  ) {
    return false
  }

  return (
    (request.action === NEW_API_OWNED_SESSION_ACTIONS.Touch ||
      request.action === NEW_API_OWNED_SESSION_ACTIONS.GetStatus ||
      request.action === NEW_API_OWNED_SESSION_ACTIONS.Cleanup) &&
    typeof request.baseUrl === "string"
  )
}
