import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { PMPLAN_ENDPOINTS } from "./constants"
import { fetchPmplan } from "./index"

export interface PmplanModelSquareRow extends PmplanModel {
  available_now: boolean
  tiers: string[]
}

/** The native model square includes both eligible and restricted models for this account. */
export async function fetchPmplanModelSquare(
  request: ApiServiceRequest,
): Promise<{ models: PmplanModelSquareRow[]; plan?: string }> {
  const body = await fetchPmplan(request, PMPLAN_ENDPOINTS.ModelSquare)
  if (
    !isRecord(body) ||
    !Array.isArray(body.models) ||
    !body.models.every(isPmplanModelSquareRow) ||
    body.total !== body.models.length ||
    body.available !== body.models.filter((model) => model.available_now).length
  )
    throw new ApiError(
      "Invalid PM-Plan model-square response",
      undefined,
      PMPLAN_ENDPOINTS.ModelSquare,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return {
    models: body.models,
    ...(typeof body.plan === "string" && body.plan.trim()
      ? { plan: body.plan }
      : {}),
  }
}

export interface PmplanModel {
  name: string
  input_micro: number
  output_micro: number
  channel_count: number
}
/** The console model list is account-scoped, never advertised as a provider-wide catalog. */
export async function fetchPmplanModels(
  request: ApiServiceRequest,
): Promise<PmplanModel[]> {
  const body = await fetchPmplan(request, PMPLAN_ENDPOINTS.Models)
  if (
    !isRecord(body) ||
    !Array.isArray(body.models) ||
    !body.models.every(isPmplanModel)
  )
    throw new ApiError(
      "Invalid PM-Plan model list",
      undefined,
      PMPLAN_ENDPOINTS.Models,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return body.models
}

/** Both native lists share rates/count validation; the square adds access facts. */
function isPmplanModel(model: unknown): model is PmplanModel {
  return (
    isRecord(model) &&
    typeof model.name === "string" &&
    Boolean(model.name.trim()) &&
    [model.input_micro, model.output_micro, model.channel_count].every(
      (value) =>
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
    )
  )
}

/** Adds the square's required availability and tier facts to shared model validation. */
function isPmplanModelSquareRow(model: unknown): model is PmplanModelSquareRow {
  return (
    isPmplanModel(model) &&
    "available_now" in model &&
    typeof model.available_now === "boolean" &&
    "tiers" in model &&
    Array.isArray(model.tiers) &&
    model.tiers.every((tier) => typeof tier === "string" && tier.trim())
  )
}
