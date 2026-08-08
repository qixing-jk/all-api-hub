import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

export interface NewApiOwnedSessionBundle {
  baseUrl: string
  sessionId: string
  accessToken: string
  /** Epoch seconds, matching New API's AuthBundle response. */
  accessExpiresAt: number
}

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

export const normalizeNewApiOwnedSessionOrigin = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return null
  const normalized = normalizeUrlForOriginKey(value, {
    stripTrailingSlashes: true,
  })
  if (!normalized) return null

  try {
    const url = new URL(normalized)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null
  } catch {
    return null
  }
}

const normalizeNonBlankString = (value: unknown) => {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized || null
}

export const normalizeNewApiOwnedSessionBundle = (
  value: unknown,
): NewApiOwnedSessionBundle | null => {
  if (!value || typeof value !== "object") return null
  const bundle = value as Record<string, unknown>
  const baseUrl = normalizeNewApiOwnedSessionOrigin(bundle.baseUrl)
  const sessionId = normalizeNonBlankString(bundle.sessionId)
  const accessToken = normalizeNonBlankString(bundle.accessToken)
  if (
    !baseUrl ||
    !sessionId ||
    !accessToken ||
    typeof bundle.accessExpiresAt !== "number" ||
    !Number.isFinite(bundle.accessExpiresAt)
  ) {
    return null
  }

  return {
    baseUrl,
    sessionId,
    accessToken,
    accessExpiresAt: bundle.accessExpiresAt,
  }
}

export const parseNewApiOwnedSessionRequest = (
  value: unknown,
): NewApiOwnedSessionRequest | null => {
  if (!value || typeof value !== "object") return null
  const request = value as Record<string, unknown>

  if (
    request.action === NEW_API_OWNED_SESSION_ACTIONS.Capture ||
    request.action === NEW_API_OWNED_SESSION_ACTIONS.Refresh
  ) {
    const bundle = normalizeNewApiOwnedSessionBundle(request.bundle)
    return bundle ? { action: request.action, bundle } : null
  }

  const baseUrl = normalizeNewApiOwnedSessionOrigin(request.baseUrl)
  if (!baseUrl) return null

  if (request.action === NEW_API_OWNED_SESSION_ACTIONS.Touch) {
    if (request.sessionId === undefined) {
      return { action: request.action, baseUrl }
    }
    const sessionId = normalizeNonBlankString(request.sessionId)
    return sessionId ? { action: request.action, baseUrl, sessionId } : null
  }

  if (
    request.action === NEW_API_OWNED_SESSION_ACTIONS.GetStatus ||
    request.action === NEW_API_OWNED_SESSION_ACTIONS.Cleanup
  ) {
    return { action: request.action, baseUrl }
  }

  return null
}

export const isNewApiOwnedSessionRequest = (
  value: unknown,
): value is NewApiOwnedSessionRequest =>
  parseNewApiOwnedSessionRequest(value) !== null
