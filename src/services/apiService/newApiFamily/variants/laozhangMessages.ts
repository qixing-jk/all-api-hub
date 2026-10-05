import type { MarkSiteAnnouncementReadRequest } from "~/services/apiAdapters/contracts/siteAnnouncements"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { SiteAnnouncement } from "~/types/siteAnnouncements"

type MessagePage = { messages?: unknown; total?: number }

const MESSAGE_PAGE_SIZE = 20

/**
 * Projects native Message center rows into the shared announcement model.
 */
function normalizeMessage(value: unknown): SiteAnnouncement | null {
  if (!value || typeof value !== "object") return null
  const item = value as Record<string, unknown>
  if (
    !(
      typeof item.id === "number" &&
      Number.isSafeInteger(item.id) &&
      item.id > 0
    )
  )
    return null
  const title = typeof item.title === "string" ? item.title : ""
  const content = typeof item.content === "string" ? item.content : ""
  if (!title.trim() && !content.trim()) return null
  const link =
    typeof item.link === "string" && /^https?:\/\//i.test(item.link)
      ? item.link
      : ""
  return {
    id: String(item.id),
    title,
    content: link ? `${content}\n\n${link}` : content,
    read: item.is_read === true,
    ...(typeof item.created_at === "number" && Number.isFinite(item.created_at)
      ? { createdAt: item.created_at * 1000 }
      : {}),
  }
}

/**
 * LaoZhang Message center, verified from the logged-in api2.laozhang.ai UI:
 * GET /api/user/messages?page=1&page_size=20 returns {messages, total}.
 * Read state belongs to the authenticated account, including broadcast rows.
 */
export async function fetchLaoZhangMessages(
  request: ApiServiceRequest,
): Promise<SiteAnnouncement[]> {
  const messages = new Map<string, SiteAnnouncement>()
  const seenPages = new Set<string>()
  let fetched = 0
  for (let page = 1; ; page += 1) {
    const response = await newApiFamilyRequests.data<MessagePage>(request, {
      endpoint: `/api/user/messages?page=${page}&page_size=${MESSAGE_PAGE_SIZE}`,
    })
    if (!response || !Array.isArray(response.messages))
      throw new Error("Invalid LaoZhang Message center response")
    if (!response.messages.length) break
    const pageSignature = JSON.stringify(response.messages)
    if (seenPages.has(pageSignature))
      throw new Error("LaoZhang Message center returned a repeated page")
    seenPages.add(pageSignature)
    for (const value of response.messages) {
      const message = normalizeMessage(value)
      if (message) messages.set(String(message.id), message)
    }
    fetched += response.messages.length
    if (typeof response.total === "number" && fetched >= response.total) break
    if (
      response.total === undefined &&
      response.messages.length < MESSAGE_PAGE_SIZE
    )
      break
  }
  return [...messages.values()]
}

/**
 * Acknowledges one message with LaoZhang's native read endpoint.
 */
export async function markLaoZhangMessageRead({
  request,
  id,
}: MarkSiteAnnouncementReadRequest): Promise<boolean> {
  const match = /^([1-9]\d*)$/.exec(String(id))
  if (!match) return false
  const response = await newApiFamilyRequests.envelope(request, {
    endpoint: `/api/user/messages/${match[1]}/read`,
    options: { method: "POST" },
  })
  return response.success === true
}
