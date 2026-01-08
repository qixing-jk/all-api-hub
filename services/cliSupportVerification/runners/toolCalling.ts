import type { ApiVerificationApiType } from "~/services/aiApiVerification"
import { runApiVerificationProbe } from "~/services/aiApiVerification"

import type { CliSupportResult, CliSupportStatus, CliToolId } from "../types"

export type RunCliToolCallingSimulationParams = {
  toolId: CliToolId
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId?: string
  /**
   * Documented endpoint template for UI display.
   *
   * NOTE: This is intentionally a template string (e.g. `.../{model}...`) and
   * does not need to match the provider's exact resolved URL.
   */
  endpointPath: string
}

/**
 * Run a CLI support simulation by reusing the API verification tool-calling probe.
 *
 * This keeps the CLI simulations consistent with the main verification logic:
 * - same prompt + tool schema
 * - same tool-call detection
 * - same redaction + best-effort HTTP status inference
 */
export async function runCliToolCallingSimulation(
  params: RunCliToolCallingSimulationParams,
): Promise<CliSupportResult> {
  const probeResult = await runApiVerificationProbe({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    apiType: params.apiType,
    modelId: params.modelId,
    probeId: "tool-calling",
  })

  const status: CliSupportStatus = probeResult.status
  const isPassed = status === "pass"
  const { id: probeId, ...rest } = probeResult

  return {
    id: params.toolId,
    probeId,
    ...rest,
    /**
     * Preserve the shared probe diagnostics, but also attach CLI-specific context
     * (endpoint template + tool id) so the UI can show what this simulation targets.
     *
     * IMPORTANT: This must never include the raw apiKey.
     */
    input: {
      toolId: params.toolId,
      apiType: params.apiType,
      baseUrl: params.baseUrl,
      endpoint: params.endpointPath,
      method: "POST",
      modelId: params.modelId,
      probeInput: probeResult.input,
    },
    /**
     * The probe output is already best-effort and should not contain secrets.
     * Keep it verbatim so we do not lose useful fields for debugging.
     */
    output: probeResult.output,
    summary: probeResult.summary || (isPassed ? "Supported" : "Failed"),
    summaryKey: isPassed
      ? "verifyDialog.summaries.supported"
      : probeResult.summaryKey,
    summaryParams: probeResult.summaryParams,
  }
}
