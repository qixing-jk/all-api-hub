import type { SiteAnnouncementsCapability } from "~/services/apiAdapters/contracts/siteAnnouncements"
import { fetchIdentity } from "~/services/apiService/xiaoen"
import { XIAOEN_ENDPOINTS } from "~/services/apiService/xiaoen/constants"
import {
  fetchXiaoenRaw,
  invalidXiaoenResponse,
  withXiaoenSession,
} from "~/services/apiService/xiaoen/transport"
import { isRecord } from "~/utils/core/object"
import { t } from "~/utils/i18n/core"

const endpoint = XIAOEN_ENDPOINTS.Messages

/** Native inbox rows are account-scoped; read acknowledgements never claim rewards or dismiss popups. */
export const xiaoenAccountMessages: SiteAnnouncementsCapability = {
  fetch: (request) =>
    withXiaoenSession(request, async (scoped) => {
      const { user } = await fetchIdentity(scoped)
      const body = await fetchXiaoenRaw(scoped, endpoint)
      if (!Array.isArray(body)) throw invalidXiaoenResponse(endpoint)
      return body.flatMap((item) => {
        if (
          !isRecord(item) ||
          typeof item.id !== "string" ||
          !item.id.trim() ||
          item.userId !== user.id ||
          typeof item.isRead !== "boolean" ||
          typeof item.isDeleted !== "boolean" ||
          !isRecord(item.template) ||
          typeof item.template.title !== "string" ||
          typeof item.template.content !== "string" ||
          typeof item.createdAt !== "string" ||
          !Number.isFinite(Date.parse(item.createdAt)) ||
          (item.readAt != null &&
            (typeof item.readAt !== "string" ||
              !Number.isFinite(Date.parse(item.readAt))))
        ) {
          throw invalidXiaoenResponse(endpoint)
        }
        const details: string[] = []
        if (item.template.type === "quota" || item.template.type === "coupon") {
          if (typeof item.isClaimed === "boolean")
            details.push(
              t(
                item.isClaimed
                  ? "siteAnnouncements:accountMessage.claimed"
                  : "siteAnnouncements:accountMessage.unclaimed",
              ),
            )
          if (
            item.template.type === "quota" &&
            typeof item.template.quotaAmount === "number" &&
            Number.isFinite(item.template.quotaAmount) &&
            item.template.quotaAmount > 0
          )
            details.push(
              t("siteAnnouncements:accountMessage.credits", {
                amount: item.template.quotaAmount,
              }),
            )
          if (
            typeof item.template.expiresAt === "string" &&
            Number.isFinite(Date.parse(item.template.expiresAt))
          )
            details.push(
              t("siteAnnouncements:accountMessage.expires", {
                time: item.template.expiresAt,
              }),
            )
          const url = new URL("/dashboard/messages", scoped.baseUrl)
          url.searchParams.set("messageId", item.id)
          details.push(
            `[${t("siteAnnouncements:accountMessage.openNative")}](${url.href})`,
          )
        }
        return item.isDeleted
          ? []
          : [
              {
                id: item.id,
                title: item.template.title,
                content: [item.template.content, ...details].join("\n\n"),
                createdAt: Date.parse(item.createdAt),
                read: item.isRead,
                ...(typeof item.readAt === "string"
                  ? { readAt: Date.parse(item.readAt) }
                  : {}),
              },
            ]
      })
    }),
  markRead: ({ request, id }) =>
    withXiaoenSession(request, async (scoped) => {
      if (typeof id !== "string" || !id.trim()) return false
      const messages = await xiaoenAccountMessages.fetch(scoped)
      if (!messages.some((item) => item.id === id)) return false
      const result = await fetchXiaoenRaw(scoped, endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: id }),
      })
      if (!isRecord(result) || result.success !== true) return false
      return (await xiaoenAccountMessages.fetch(scoped)).some(
        (item) => item.id === id && item.read === true,
      )
    }),
}
