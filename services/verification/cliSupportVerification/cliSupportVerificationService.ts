import { runCliSupportToolFromRegistry } from "~/services/verification/cliSupportVerification/registry"

import { nowMs } from "../aiApiVerification/probeTiming"
import type { CliSupportReport, CliSupportResult, CliToolId } from "./types"
import { CLI_TOOL_IDS } from "./types"

/**
 * Shared inputs for running CLI support simulations.
 */
export type RunCliSupportSimulationParams = {
  baseUrl: string
  apiKey: string
  /**
   * Model id to use for all tool simulations.
   *
   * The CLI support suite intentionally does not guess model ids from token metadata.
   * Callers (UI/CLI) should pass an explicit `modelId` to keep verification deterministic.
   */
  modelId?: string
}

/**
 * Inputs for running a single tool simulation.
 */
export type RunCliSupportToolParams = RunCliSupportSimulationParams & {
  toolId: CliToolId
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
    modelId: params.modelId,
  })
}

/**
 * Run the full CLI support simulation suite for a given base URL + API key.
 *
 * The suite executes tools sequentially so the UI can update incrementally and allow
 * per-tool retries without re-running everything.
 */
export async function runCliSupportSimulation(
  params: RunCliSupportSimulationParams,
): Promise<CliSupportReport> {
  const startedAt = nowMs()

  const results: CliSupportResult[] = []
  for (const toolId of CLI_TOOL_IDS) {
    results.push(
      await runCliSupportToolFromRegistry(toolId, {
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        modelId: params.modelId,
      }),
    )
  }

  return {
    baseUrl: params.baseUrl,
    startedAt,
    finishedAt: nowMs(),
    results,
  }
}
