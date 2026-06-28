import { fetchApi } from "~/services/apiService/common/utils"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("NewApiFamilySiteNotice")

/**
 * Fetch the compatible site notice endpoint used by New API-family deployments.
 */
export async function fetchSiteNotice(
  request: ApiServiceRequest,
): Promise<string | null> {
  try {
    const response = await fetchApi<string | null>(
      {
        ...request,
        auth: {
          ...request.auth,
          authType: AuthTypeEnum.None,
        },
      },
      { endpoint: "/api/notice" },
      false,
    )

    if (
      !response ||
      typeof response !== "object" ||
      response.success === false
    ) {
      return null
    }

    const data = response.data
    return typeof data === "string" && data.trim() ? data : null
  } catch (error) {
    logger.warn("获取站点公告信息失败", error)
    return null
  }
}
