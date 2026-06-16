import type { ApiServiceRequest } from "~/services/apiService/common/type"

export type SiteNoticeCapability = {
  fetch(request: ApiServiceRequest): Promise<string | null>
}
