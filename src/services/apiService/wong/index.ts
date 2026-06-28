/**
 * WONG-compatible legacy apiService entry.
 *
 * Account capability implementations live under the New API-family variant
 * module; this file remains as the compatibility import path for older callers.
 */
export {
  fetchAccountData,
  fetchCheckInStatus,
  fetchSupportCheckIn,
  refreshAccountData,
  resolveApiTokenKey,
  type WongCheckinApiResponse,
  type WongCheckinStatusData,
} from "~/services/apiService/newApiFamily/variants/wong"
