import type { ApiServiceRequest } from "~/services/apiTransport/type"

export type SiteNoticeCapability = {
  fetch(request: ApiServiceRequest): Promise<string | null>
}
