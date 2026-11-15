import type { ApiServiceRequest } from "~/services/apiTransport/type"

/** Publicly advertised API addresses; observations never authorize request routing. */
export type SiteEndpointMetadata = {
  readonly apiUrls: readonly string[]
}

/** No account credentials or arbitrary headers are admitted by this read seam. */
export type SiteEndpointMetadataReadContext = Pick<
  ApiServiceRequest,
  "baseUrl" | "fetchContext" | "currentTabFallback"
> & { signal?: AbortSignal }

export type SiteEndpointMetadataCapability = {
  /** Undefined means the response cannot establish a reliable metadata snapshot. */
  read(
    context: SiteEndpointMetadataReadContext,
  ): Promise<SiteEndpointMetadata | undefined>
}
