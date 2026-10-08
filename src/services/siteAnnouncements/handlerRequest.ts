import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  REQUEST_SCHEDULING_PRIORITIES,
  type RequestScheduling,
} from "~/services/apiTransport/requestScheduling"
import type { SiteAccount } from "~/types"
import type {
  AnnouncementSourceHandler,
  AnnouncementSourceHandlerRequest,
} from "~/types/siteAnnouncements"
import {
  SITE_ANNOUNCEMENT_CHECK_TRIGGERS,
  type SiteAnnouncementCheckTrigger,
} from "~/types/siteAnnouncements"

/**
 * Runs user-initiated checks in the limiter's foreground lane and automatic
 * polling in the background lane, so a scan cannot compete with the user's
 * own requests on the same site.
 */
export const TRIGGER_REQUEST_PRIORITIES: Record<
  SiteAnnouncementCheckTrigger,
  RequestScheduling["priority"]
> = {
  [SITE_ANNOUNCEMENT_CHECK_TRIGGERS.Alarm]:
    REQUEST_SCHEDULING_PRIORITIES.Background,
  [SITE_ANNOUNCEMENT_CHECK_TRIGGERS.Manual]:
    REQUEST_SCHEDULING_PRIORITIES.Foreground,
}

/**
 * Creates the handler request context for a specific account.
 */
export function createHandlerRequest(
  account: SiteAccount,
  handler: AnnouncementSourceHandler,
  priority: RequestScheduling["priority"],
): AnnouncementSourceHandlerRequest {
  const { request } = createAccountApiRequestFromStoredAccount(account)

  return {
    accountId: account.id,
    siteName: account.site_name,
    siteType: account.site_type,
    baseUrl: account.site_url,
    sourceScope: handler.scope,
    apiRequest: { ...request, requestScheduling: { priority } },
  }
}
