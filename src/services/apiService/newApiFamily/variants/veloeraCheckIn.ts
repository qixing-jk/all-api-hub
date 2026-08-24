import { fetchSiteStatus } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

/**
 * Read Veloera's global check-in switch from the public site status.
 *
 * Upstream exposes `check_in_enabled`; this is intentionally not the New API
 * family's similarly named `checkin_enabled` field.
 * https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/controller/misc.go
 */
export async function fetchSupportCheckIn(
  request: ApiServiceRequest,
): Promise<boolean | undefined> {
  const siteStatus = await fetchSiteStatus(request)
  return typeof siteStatus?.check_in_enabled === "boolean"
    ? siteStatus.check_in_enabled
    : undefined
}
