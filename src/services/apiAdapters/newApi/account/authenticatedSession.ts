import { RuntimeActionIds } from "~/constants/runtimeActions"
import type { AccountAuthenticatedSession } from "~/services/apiAdapters/contracts/accountLogin"
import {
  NEW_API_DASHBOARD_AUTH_REFRESH_PATH,
  NEW_API_DASHBOARD_AUTH_UNAVAILABLE_STATUSES,
  parseNewApiDashboardAuthBundleResponse,
} from "~/services/apiService/newApiFamily/dashboardAuth"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import {
  API_DIRECT_REQUEST_REASONS,
  API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  type ApiServiceRequest,
} from "~/services/apiTransport/type"
import { AuthTypeEnum, type SiteAccount } from "~/types"
import type { TempWindowFetch } from "~/types/tempWindowFetch"
import { isRecord } from "~/utils/core/object"

/** A verified dashboard identity cannot authorize this saved account. */
export class NewApiSessionIdentityError extends Error {
  constructor(readonly kind: "missing" | "mismatch") {
    super("New API dashboard account identity is unconfirmed")
  }
}

/** Preserve missing identity separately from evidence of a different account. */
function assertSessionIdentity(actual: unknown, expected: string): void {
  if (String(actual) !== expected)
    throw new NewApiSessionIdentityError(
      actual == null || actual === "" ? "missing" : "mismatch",
    )
}

/** Adopts the owned dashboard session; its credential never enters account storage. */
export async function createNewApiAuthenticatedSessionRequest(
  session: AccountAuthenticatedSession,
  account: SiteAccount,
): Promise<ApiServiceRequest> {
  const origin = new URL(account.site_url).origin
  await session.assertOrigin()
  const cached = await session.sendSiteAction<unknown>(
    RuntimeActionIds.ContentNewApiDashboardSessionAuth,
    { expectedOrigin: origin },
  )
  const refresh =
    cached == null
      ? await session.sendSiteAction<TempWindowFetch>(
          RuntimeActionIds.ContentPerformTempWindowFetch,
          {
            expectedOrigin: origin,
            fetchUrl: new URL(NEW_API_DASHBOARD_AUTH_REFRESH_PATH, origin).href,
            fetchOptions: { method: "POST", credentials: "include" },
            responseType: "json",
          },
        )
      : undefined
  const parsed = parseNewApiDashboardAuthBundleResponse(cached ?? refresh?.data)
  const legacy =
    parsed.kind === "unrelated" &&
    NEW_API_DASHBOARD_AUTH_UNAVAILABLE_STATUSES.includes(refresh?.status ?? 0)
  if (parsed.kind !== "valid" && !legacy)
    throw new Error("New API dashboard session is unavailable")
  const identity = String(account.account_info.id)
  if (parsed.kind === "valid")
    assertSessionIdentity(parsed.bundle.user.id, identity)
  const request: ApiServiceRequest = {
    baseUrl: account.site_url,
    siteType: account.site_type,
    accountId: account.id,
    auth: {
      authType:
        parsed.kind === "valid"
          ? AuthTypeEnum.AccessToken
          : AuthTypeEnum.Cookie,
      userId: account.account_info.id,
      ...(parsed.kind === "valid" ? { accessToken: parsed.bundle.token } : {}),
    },
    fetchContext: {
      kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
      tabId: session.tabId,
      origin,
    },
    currentTabFallback: API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid,
    abortSignal: session.abortSignal,
    directRequestReason: API_DIRECT_REQUEST_REASONS.ProviderProtocol,
  }
  const self = await newApiFamilyRequests.envelope(request, {
    endpoint: "/api/user/self",
    options: { method: "GET", cache: "no-store" },
  })
  if (self.success !== true || !isRecord(self.data))
    throw new Error("New API dashboard account identity is unconfirmed")
  assertSessionIdentity(self.data.id, identity)
  return request
}
