import type * as accountBootstrap from "~/services/apiService/newApiFamily/default/accountBootstrap"

export type AccountBootstrapMetadataImplementation = Pick<
  typeof accountBootstrap.defaultAccountBootstrapImplementation,
  "fetchSiteStatus" | "extractDefaultExchangeRate"
> & {
  observeSiteStatus?(
    request: Parameters<typeof accountBootstrap.fetchSiteStatus>[0],
    status: Awaited<ReturnType<typeof accountBootstrap.fetchSiteStatus>>,
  ): void
  extractCheckInSupport: typeof accountBootstrap.extractCheckInSupport
  probeCheckInSupport?: typeof accountBootstrap.fetchSupportCheckIn
}
