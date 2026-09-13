/** Fixed budgets shared by scan orchestration, parsing and streamed reads. */
export const FEEDBACK_SCAN_LIMITS = {
  taskTimeoutMs: 20000,
  requestTimeoutMs: 8000,
  resourceConcurrency: 4,
  requests: 64,
  bytes: 32 * 1024 * 1024,
  responseBytes: 4 * 1024 * 1024,
  routes: 30,
} as const
