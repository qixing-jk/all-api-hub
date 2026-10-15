import { KRILL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { isRecord } from "~/utils/core/object"

import { KRILL_ENDPOINTS } from "./constants"
import { readKrillAccountEnvelope } from "./identity"
import { invalidKrillResponse } from "./transport"

/** The native referral URL; retrieving it never enrolls or pays anyone. */
export async function fetchKrillInviteLink(
  request: ApiServiceRequest,
): Promise<string> {
  const body = await readKrillAccountEnvelope(request, KRILL_ENDPOINTS.Invite)
  if (!isRecord(body.data) || typeof body.data.invite_code !== "string")
    invalidKrillResponse(KRILL_ENDPOINTS.Invite)
  const code = body.data.invite_code.trim()
  if (!code) invalidKrillResponse(KRILL_ENDPOINTS.Invite)
  const url = new URL("/register", KRILL_WEB_ORIGIN)
  url.searchParams.set("invite", code)
  return url.href
}

/** Redemption credits are applied by the console; the response carries no amount. */
export async function redeemKrillCode(
  request: ApiServiceRequest,
  code: string,
): Promise<undefined> {
  const trimmed = code.trim()
  if (!trimmed) invalidKrillResponse(KRILL_ENDPOINTS.Redeem)
  const body = await readKrillAccountEnvelope(request, KRILL_ENDPOINTS.Redeem, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: trimmed }),
  })
  if (!isRecord(body.data) || typeof body.data.code_type !== "string")
    invalidKrillResponse(KRILL_ENDPOINTS.Redeem)
  return undefined
}

/** Public notices never borrow a saved account's console credentials. */
async function fetchKrillPublicEnvelope(
  request: ApiServiceRequest,
  endpoint: string,
) {
  if (new URL(request.baseUrl).origin !== KRILL_WEB_ORIGIN)
    invalidKrillResponse(endpoint)
  const body = await fetchApi<unknown>(
    {
      ...request,
      auth: { authType: AuthTypeEnum.None },
      cookieAuthSessionCookie: undefined,
      cookieSession: undefined,
    },
    { endpoint, options: { cache: "no-store" } },
    false,
  )
  if (!isRecord(body) || body.success !== true || !isRecord(body.data))
    invalidKrillResponse(endpoint)
  return body.data
}

export type KrillAnnouncementItem = {
  id: string
  title: string
  content: string
  summary: string
  createdAt: number
}

/** Site-wide announcements; rows without a readable identity are not shown. */
export async function fetchKrillAnnouncementItems(
  request: ApiServiceRequest,
): Promise<KrillAnnouncementItem[]> {
  const endpoint = KRILL_ENDPOINTS.Announcements
  const data = await fetchKrillPublicEnvelope(request, endpoint)
  if (!Array.isArray(data.items)) invalidKrillResponse(endpoint)
  return data.items.flatMap((value) => {
    if (
      !isRecord(value) ||
      (typeof value.id !== "number" && typeof value.id !== "string") ||
      String(value.id).trim() === "" ||
      typeof value.title !== "string" ||
      !value.title.trim() ||
      typeof value.content !== "string" ||
      typeof value.summary !== "string" ||
      typeof value.created_at !== "string" ||
      !Number.isFinite(Date.parse(value.created_at))
    )
      return []
    return [
      {
        id: String(value.id),
        title: value.title.trim(),
        content: value.content,
        summary: value.summary,
        createdAt: Date.parse(value.created_at),
      },
    ]
  })
}
