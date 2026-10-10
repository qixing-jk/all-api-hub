import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { readCubenceUser } from "./identity"
import { withCubenceSession } from "./session"
import { invalidCubenceResponse, readCubenceResponse } from "./transport"

/** Provider-wide model plaza; membership is not inferred from one key's /v1/models. */
export async function fetchCubenceModels(
  request: ApiServiceRequest,
): Promise<Record<string, unknown>[]> {
  return withCubenceSession(request, async (request) => {
    await readCubenceUser(request)
    const endpoint = "/api/model-plaza"
    const body = await readCubenceResponse(request, endpoint)
    if (
      body.success !== true ||
      !isRecord(body.data) ||
      !Array.isArray(body.data.models)
    )
      return invalidCubenceResponse(endpoint)
    return body.data.models.map((model) => {
      if (
        !isRecord(model) ||
        typeof model.model_name !== "string" ||
        !model.model_name.trim() ||
        !Array.isArray(model.group_ids) ||
        model.group_ids.some((id) => !Number.isSafeInteger(id)) ||
        typeof model.is_active !== "boolean"
      )
        return invalidCubenceResponse(endpoint)
      return model
    })
  })
}
