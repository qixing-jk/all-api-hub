import { t } from "~/utils/i18n/core"

/**
 * Extracts a concise error detail from third-party notification responses.
 */
async function getNotificationResponseErrorDetail(
  response: Response,
): Promise<string | null> {
  try {
    const contentType = response.headers.get("content-type") ?? ""
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as {
        description?: unknown
        message?: unknown
        msg?: unknown
        StatusMessage?: unknown
        error?: unknown
      }
      const message =
        body.description ??
        body.message ??
        body.msg ??
        body.StatusMessage ??
        body.error
      return typeof message === "string" && message.trim()
        ? message.trim()
        : null
    }

    const text = await response.text()
    return text.trim() ? text.trim().slice(0, 300) : null
  } catch {
    return null
  }
}

/**
 * Builds a user-facing failure message from a parsed third-party response body.
 */
export function getNotificationParsedErrorMessage(
  labelKey: string,
  status: number,
  detail: string | null,
): string {
  const label = t(labelKey)
  return detail
    ? t("settings:taskNotifications.test.httpErrorWithDetail", {
        label,
        status,
        detail,
      })
    : t("settings:taskNotifications.test.httpError", {
        label,
        status,
      })
}

/**
 * Builds a user-facing HTTP failure message from a third-party response.
 */
export async function getNotificationHttpErrorMessage(
  labelKey: string,
  response: Response,
): Promise<string> {
  const detail = await getNotificationResponseErrorDetail(response)
  return getNotificationParsedErrorMessage(labelKey, response.status, detail)
}
