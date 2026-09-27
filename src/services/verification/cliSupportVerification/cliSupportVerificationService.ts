import type { ApiVerificationMode } from "~/services/verification/aiApiVerification"
import { runCliSupportToolFromRegistry } from "~/services/verification/cliSupportVerification/registry"

import type { CliSupportResult, CliToolId } from "./types"

/**
 * Inputs for running a single CLI tool simulation.
 */
type RunCliSupportToolParams = {
  toolId: CliToolId
  baseUrl: string
  apiKey: string
  mode?: ApiVerificationMode
  /**
   * Model id to use for this tool simulation.
   *
   * The runner intentionally does not guess model ids from token metadata.
   * Callers (UI/CLI) should pass an explicit `modelId` to keep verification deterministic.
   */
  modelId?: string
  abortSignal?: AbortSignal
}

/**
 * Run a single CLI tool simulation.
 *
 * Used by UI to run/retry tools independently.
 */
export async function runCliSupportTool(
  params: RunCliSupportToolParams,
): Promise<CliSupportResult> {
  return runCliSupportToolFromRegistry(params.toolId, {
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    mode: params.mode,
    modelId: params.modelId,
    abortSignal: params.abortSignal,
  })
}
