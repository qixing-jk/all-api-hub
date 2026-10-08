import { parseNewApiDashboardAuthBundleResponse } from "~/services/apiService/newApi/dashboardAuth"
import {
  captureNewApiOwnedSession,
  refreshNewApiOwnedSession,
} from "~/services/managedSites/newApiOwnedSession/client"
import type { NewApiTransientSessionRuntime } from "~/services/managedSites/providers/newApi/newApiTransientSessionRuntime"

/** Accepts transient dashboard credentials and registers their owned session. */
export function createNewApiDashboardAuthAcceptance(
  runtime: Pick<
    NewApiTransientSessionRuntime,
    "storeDashboardAuth" | "getActiveDashboardAuth"
  >,
) {
  return async (
    baseUrl: string,
    body: unknown,
    admission: "login" | "refresh",
  ) => {
    const parsed = parseNewApiDashboardAuthBundleResponse(body)
    if (parsed.kind !== "valid") return parsed.kind

    // Credentials become usable before the best-effort ownership receipt is
    // awaited, preserving the login and refresh protocol's admission order.
    runtime.storeDashboardAuth(baseUrl, parsed.bundle)
    const dashboardAuth = runtime.getActiveDashboardAuth(baseUrl)
    if (dashboardAuth) {
      const register =
        admission === "refresh"
          ? refreshNewApiOwnedSession
          : captureNewApiOwnedSession
      await register({
        baseUrl,
        sessionId: dashboardAuth.sessionId,
        accessToken: dashboardAuth.token,
        accessExpiresAt: dashboardAuth.expiresAt,
      })
    }
    return parsed.kind
  }
}
