export type ApiVerificationApiType =
  | "openai-compatible"
  | "openai"
  | "anthropic"
  | "google"

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
  summary: string
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
