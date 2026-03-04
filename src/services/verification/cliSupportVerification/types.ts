import type {
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
  ApiVerificationProbeStatus,
} from "~/services/verification/aiApiVerification"

/**
 * Stable identifiers for CLI tool simulations.
 *
 * These are used for:
 * - i18n keys (tool names and summaries)
 * - UI list rendering
 */
export const CLI_TOOL_IDS = ["claude", "codex", "gemini"] as const
export type CliToolId = (typeof CLI_TOOL_IDS)[number]

/**
 * Result status of a CLI tool simulation.
 *
 * - `pass`: request succeeded and response shape looks compatible
 * - `fail`: request was sent but failed (HTTP error, network, timeout, invalid response)
 * - `unsupported`: the tool is known to be incompatible with the given site configuration,
 *   so we do NOT send any outbound request and return unsupported immediately.
 */
export type CliSupportStatus = ApiVerificationProbeStatus

/**
 * Single tool simulation result.
 *
 * NOTE: This intentionally reuses the shared API verification probe result type to:
 * - keep status/summary behavior consistent across features
 * - avoid duplicating error handling, redaction, and i18n keys
 * - allow the UI to render the same diagnostics structure for both flows
 */
export type CliSupportResult = Omit<ApiVerificationProbeResult, "id"> & {
  id: CliToolId
  /**
   * The underlying verification probe id (e.g. `tool-calling`).
   *
   * The CLI support simulation is built on top of the same probe runner, but uses
   * `id` to represent the simulated CLI tool (claude/codex/gemini).
   */
  probeId: ApiVerificationProbeId
}

/**
 * Full simulation report for a single run (across tools).
 */
export type CliSupportReport = {
  baseUrl: string
  startedAt: number
  finishedAt: number
  results: CliSupportResult[]
}
