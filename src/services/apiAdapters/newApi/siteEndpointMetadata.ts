import type { SiteEndpointMetadataCapability } from "~/services/apiAdapters/contracts/siteEndpointMetadata"
import {
  createPublicSiteEndpointMetadataRequest,
  normalizeSiteEndpointMetadataUrls,
} from "~/services/apiAdapters/siteEndpointMetadata"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { isRecord } from "~/utils/core/object"

export const newApiSiteEndpointMetadata: SiteEndpointMetadataCapability = {
  async read(context) {
    const response = await newApiFamilyRequests.envelope<unknown>(
      createPublicSiteEndpointMetadataRequest(context),
      {
        endpoint: "/api/status",
        options: { method: "GET", cache: "no-store", signal: context.signal },
      },
    )
    if (response.success !== true || !isRecord(response.data)) return undefined
    const routes = response.data.api_info
    if (routes != null && !Array.isArray(routes)) return undefined
    if (
      Array.isArray(routes) &&
      routes.some((route) => !isRecord(route) || typeof route.url !== "string")
    )
      return undefined
    return {
      apiUrls: normalizeSiteEndpointMetadataUrls(
        Array.isArray(routes)
          ? routes.map((route) => (isRecord(route) ? route.url : undefined))
          : [],
      ),
    }
  },
}
