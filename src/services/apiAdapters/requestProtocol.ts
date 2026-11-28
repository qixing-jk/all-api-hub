import { SITE_TYPES, type SiteType } from "~/constants/siteType"

/** Optional wire behavior; shared transport owns scheduling and final dispatch. */
export interface RequestProtocol {
  requiresExtensionContext(
    baseUrl: string,
    accessToken: string,
  ): Promise<boolean>
  fetch(
    url: string,
    options: RequestInit,
    dispatch: (options: RequestInit) => Promise<Response>,
  ): Promise<Response>
  fetchInBrowser?(
    url: string,
    options: RequestInit,
    dispatch: (options: RequestInit) => Promise<Response>,
  ): Promise<Response>
}

/** Keep low-level transport independent of the eagerly loaded business adapters. */
export async function getRequestProtocol(
  siteType?: SiteType,
): Promise<RequestProtocol | undefined> {
  if (siteType === SITE_TYPES.SUB2API)
    return (await import("./sub2api/auth/requestProtocol"))
      .sub2ApiRequestProtocol
  return undefined
}
