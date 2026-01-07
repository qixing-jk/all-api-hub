export type ApiVerificationProbeId = "models" | "tool-calling"

export type ApiVerificationProbeStatus = "pass" | "fail" | "unsupported"

export type ApiVerificationProbeResult = {
  id: ApiVerificationProbeId
  status: ApiVerificationProbeStatus
  latencyMs: number
  summary: string
  details?: Record<string, unknown>
}

export type ApiVerificationReport = {
  baseUrl: string
  modelId?: string
  startedAt: number
  finishedAt: number
  results: ApiVerificationProbeResult[]
}
