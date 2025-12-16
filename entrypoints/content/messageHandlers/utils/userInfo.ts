import { t } from "i18next"

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
        if (user.id) {
          return { userId: user.id, user }
        }
      }
    } catch (error) {
      console.error(error)
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(t("messages:content.waitUserInfoTimeout"))
}
