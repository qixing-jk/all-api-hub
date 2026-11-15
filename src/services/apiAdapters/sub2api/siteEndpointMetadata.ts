import type { SiteEndpointMetadataCapability } from "~/services/apiAdapters/contracts/siteEndpointMetadata"
import {
  createPublicSiteEndpointMetadataRequest,
  normalizeSiteEndpointMetadataUrls,
} from "~/services/apiAdapters/siteEndpointMetadata"
import { fetchSub2ApiPublicSettings } from "~/services/apiService/sub2api/account/publicSettings"
import { isRecord } from "~/utils/core/object"

export const sub2ApiSiteEndpointMetadata: SiteEndpointMetadataCapability = {
  async read(context) {
    const settings = await fetchSub2ApiPublicSettings(
      createPublicSiteEndpointMetadataRequest(context),
      { signal: context.signal },
    )
    if (!isRecord(settings)) return undefined
    const endpoints = settings.custom_endpoints
    if (endpoints != null && !Array.isArray(endpoints)) return undefined
    if (
      Array.isArray(endpoints) &&
      endpoints.some(
        (endpoint) =>
          !isRecord(endpoint) || typeof endpoint.endpoint !== "string",
      )
    )
      return undefined
    if (
      settings.api_base_url != null &&
      typeof settings.api_base_url !== "string"
    )
      return undefined
    return {
      apiUrls: normalizeSiteEndpointMetadataUrls([
        settings.api_base_url,
        ...(Array.isArray(endpoints)
          ? endpoints.map((endpoint) =>
              isRecord(endpoint) ? endpoint.endpoint : undefined,
            )
          : []),
      ]),
    }
  },
}
