export const PELICAN_PROMPT_ID = "pelican" as const

/** Built-in drawing prompt shared by editors and the deferred executor. */
export const PELICAN_TEST_PROMPT =
  "Generate an SVG of a pelican riding a bicycle"

/** Runtime values shared by drawing requests, results and persisted summaries. */
export const PELICAN_EXECUTION_MODES = {
  Reply: "reply",
  Agent: "agent",
} as const

export type PelicanExecutionMode =
  (typeof PELICAN_EXECUTION_MODES)[keyof typeof PELICAN_EXECUTION_MODES]

export const AGENT_TEST_OUTCOMES = {
  Completed: "completed",
  NoArtifact: "no-artifact",
} as const

export const DRAWING_VERIFICATION_OUTCOMES = {
  Generated: "generated",
  NoArtifact: "no-artifact",
  Error: "error",
} as const

export type DrawingVerificationOutcome =
  (typeof DRAWING_VERIFICATION_OUTCOMES)[keyof typeof DRAWING_VERIFICATION_OUTCOMES]
