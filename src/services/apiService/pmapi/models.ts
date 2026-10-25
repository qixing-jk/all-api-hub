import type { ApiServiceRequest } from "~/services/apiTransport/type"

import { PMAPI_ENDPOINTS } from "./constants"
import { fetchPmApiIdentity } from "./identity"
import { fetchPmApiData, invalidPmApiResponse } from "./transport"

/** Account-visible model ids, used by the token editor's whitelist picker. */
export async function fetchPmApiModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  await fetchPmApiIdentity(request)
  const models = await fetchPmApiData(request, PMAPI_ENDPOINTS.Models)
  if (
    !Array.isArray(models) ||
    !models.every((model) => typeof model === "string")
  )
    return invalidPmApiResponse(PMAPI_ENDPOINTS.Models)
  return models as string[]
}
