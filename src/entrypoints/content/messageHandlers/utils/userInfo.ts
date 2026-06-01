import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

/**
 * Unified logger scoped to content-script user info polling helpers.
 */
const logger = createLogger("ContentUserInfo")

/**
 * Polls localStorage for user info until available or until timeout elapses.
 * @param maxWaitTime Maximum wait duration in ms before rejecting.
 * @returns User ID and parsed user payload once retrieved.
 */
export async function waitForUserInfo(
  maxWaitTime = 5000,
): Promise<{ userId: string; user: any }> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const userStr = localStorage.getItem("user")
      if (userStr) {
        const user = JSON.parse(userStr)
        const userId = normalizeAccountIdentity(user?.id)
        if (userId) {
          return { userId, user }
        }
      }
    } catch (error) {
      logger.warn("Failed to parse localStorage user payload", error)
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(t("messages:content.waitUserInfoTimeout"))
}
