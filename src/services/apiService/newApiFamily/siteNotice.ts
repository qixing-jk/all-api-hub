import { fetchSiteNotice as fetchCommonSiteNotice } from "~/services/apiService/common"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export const fetchSiteNotice = (request: ApiServiceRequest) =>
  fetchCommonSiteNotice(request)
