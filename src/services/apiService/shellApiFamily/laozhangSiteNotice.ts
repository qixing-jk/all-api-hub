import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("LaoZhangSiteNotice")

/** Extracts display content without importing the website's popup policy. */
function normalizeSiteNotice(data: unknown): string | null {
  if (typeof data === "string") {
    return data.trim() ? data : null
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null

  // https://api2.laozhang.ai/api/notice (v31.1.5) returns { content, ... }.
  // Version and audience control the website's own popup; the extension uses
  // its existing content fingerprints and local read state.
  const { content } = data as Record<string, unknown>
  return typeof content === "string" && content.trim() ? content : null
}

/**
 * Fetch the public LaoZhang notice, accepting its legacy string form as well.
 */
export async function fetchLaoZhangSiteNotice(
  request: ApiServiceRequest,
): Promise<string | null> {
  try {
    const response = await newApiFamilyRequests.envelope<unknown>(
      {
        ...request,
        auth: { authType: AuthTypeEnum.None },
      },
      { endpoint: "/api/notice" },
    )

    if (
      !response ||
      typeof response !== "object" ||
      response.success === false
    ) {
      return null
    }

    return normalizeSiteNotice(response.data)
  } catch (error) {
    logger.warn("获取站点公告信息失败", error)
    return null
  }
}
