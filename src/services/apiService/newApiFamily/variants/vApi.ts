import { fetchAccountAvailableModels as fetchLegacyAccountAvailableModels } from "~/services/apiService/newApiFamily/default/keyManagement"
import { fetchApiData } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

/** Fetch the models that the current V-API account may assign to a key. */
export const fetchAccountAvailableModels = async (
  request: ApiServiceRequest,
): Promise<string[]> => {
  // https://gpt.ge/api/user/available_models is the current V-API user-facing
  // endpoint; `/api/user/models` is permission-gated on this generation. Keep
  // the legacy New API-family endpoint as a read-only compatibility fallback.
  try {
    return await fetchApiData<string[]>(request, {
      endpoint: "/api/user/available_models",
    })
  } catch (currentEndpointError) {
    try {
      return await fetchLegacyAccountAvailableModels(request)
    } catch {
      throw currentEndpointError
    }
  }
}
