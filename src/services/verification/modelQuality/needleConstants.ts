export const NEEDLE_TEST_ID = "needle-in-haystack" as const
export const NEEDLE_DEFAULTS = {
  version: 1,
  minimumInputTokens: 1024,
  fallbackInputTokens: 16384,
  maxInputTokens: 1048576,
  maxOutputTokens: 1024,
  maxRequests: 32,
  maxTotalInputTokens: 8388608,
  depths: [10, 50, 90],
  sweepStartTokens: 8192,
  maxSeed: 0xffffffff,
} as const

export const NEEDLE_PLAN_SOURCES = {
  Measured: "measured",
  Declared: "declared",
  Fallback: "fallback",
  Custom: "custom",
} as const

export const NEEDLE_RUN_REASONS = {
  Running: "running",
  Complete: "complete",
  Stopped: "stopped",
  Budget: "budget",
  Interrupted: "interrupted",
  Error: "error",
} as const

export const NEEDLE_EXECUTION_PHASES = {
  Preparing: "preparing",
  InFlight: "inFlight",
} as const

export const NEEDLE_OUTCOMES = {
  Hit: "hit",
  Miss: "miss",
  Error: "error",
  ContextLimit: "context-limit",
  Incomplete: "incomplete",
  Interrupted: "interrupted",
} as const
