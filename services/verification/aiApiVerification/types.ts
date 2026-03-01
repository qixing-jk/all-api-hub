/**
 * Canonical API verification types shared by services and UI.
 */
export const API_TYPES = {
  OPENAI_COMPATIBLE: "openai-compatible",
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  GOOGLE: "google",
} as const

export type ApiVerificationApiType = (typeof API_TYPES)[keyof typeof API_TYPES]

export type ApiVerificationProbeId =
  | "models"
  | "text-generation"
  | "tool-calling"
  | "structured-output"
  | "web-search"

export type ApiVerificationProbeStatus = "pass" | "fail" | "unsupported"

export type ApiVerificationProbeResult = {
  id: ApiVerificationProbeId
  status: ApiVerificationProbeStatus
  latencyMs: number
  /**
   * Human-readable summary of the probe result.
   *
   * Prefer {@link summaryKey} + {@link summaryParams} in UI-facing scenarios so the
   * message can be translated. `summary` remains as a safe fallback for dynamic
   * error messages and older callers.
   */
  summary: string
  /**
   * Optional i18n key for rendering {@link summary} in the UI.
   *
   * This is expected to be resolved by the caller's i18n namespace (e.g. the UI
   * uses the `aiApiVerification` namespace).
   */
  summaryKey?: string
  /**
   * Optional interpolation params for {@link summaryKey}.
   */
  summaryParams?: Record<string, unknown>
  /**
   * Best-effort diagnostics about what the probe sent.
   * Must never include secrets (e.g., apiKey).
   */
  input?: unknown
  /**
   * Best-effort diagnostics about what the probe received.
   * Must never include secrets (e.g., apiKey).
   */
  output?: unknown
  details?: Record<string, unknown>
}

export type ApiVerificationReport = {
  baseUrl: string
  apiType: ApiVerificationApiType
  modelId?: string
  startedAt: number
  finishedAt: number
  results: ApiVerificationProbeResult[]
}
