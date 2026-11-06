/** Stable values shared by capacity searches, transport, display and history. */
export const CONTEXT_ATTEMPT_OUTCOMES = {
  Accepted: "accepted",
  ContextLimit: "context-limit",
  Inconclusive: "inconclusive",
} as const

export const CONTEXT_CAPACITY_REASONS = {
  Bracketed: "bracketed",
  TestLimit: "test-limit",
  Budget: "budget",
  Inconclusive: "inconclusive",
  Stopped: "stopped",
  Error: "error",
} as const

export type ContextCapacityReason =
  (typeof CONTEXT_CAPACITY_REASONS)[keyof typeof CONTEXT_CAPACITY_REASONS]

export const CONTEXT_ATTEMPT_FAILURE_REASONS = {
  Timeout: "timeout",
} as const

export const CONTEXT_CAPACITY_TEST_ID = "context-capacity" as const
