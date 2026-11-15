// Shared dashboard protocol entry for adapters in the New API family.
export {
  NEW_API_DASHBOARD_AUTH_REFRESH_PATH,
  parseNewApiDashboardAuthBundleResponse,
} from "~/services/apiService/newApi/dashboardAuth"

/** Responses that allow legacy cookie-session handling instead of dashboard auth. */
export const NEW_API_DASHBOARD_AUTH_UNAVAILABLE_STATUSES: readonly number[] = [
  401, 404, 405,
] as const
