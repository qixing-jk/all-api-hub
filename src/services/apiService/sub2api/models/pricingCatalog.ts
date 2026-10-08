import { fetchSub2ApiData } from "~/services/apiService/sub2api/account/dashboardRequest"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

/**
 * User-readable price DTOs; optional features may be absent on older deployments.
 * https://github.com/Wei-Shaw/sub2api/blob/b7dba62678a834080564966c002fd0ca2b328b7a/backend/internal/server/routes/user.go
 */
export async function fetchSub2ApiPricingCatalogs(request: ApiServiceRequest) {
  const read = async (endpoint: string) => {
    try {
      return await fetchSub2ApiData<unknown>(request, endpoint, {
        method: "GET",
      })
    } catch (error) {
      if (request.abortSignal?.aborted) throw error
      return undefined
    }
  }
  const [plaza, channels] = await Promise.all([
    read("/api/v1/model-plaza"),
    read("/api/v1/channels/available"),
  ])
  return { plaza, channels }
}
