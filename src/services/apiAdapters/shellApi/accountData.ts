import type {
  AccountData,
  ApiServiceAccountRequest,
} from "~/services/accounts/accountDataModel"
import { normalizeAccountIdentity } from "~/services/accounts/identity/accountIdentity"
import {
  fetchAccountBalance,
  fetchTodayIncome,
  fetchTodayUsage,
} from "~/services/apiService/newApiFamily/default/accountData"
import { collectAccountData } from "~/services/apiService/newApiFamily/default/accountDataCollection"
import { readGenericShellIdentity } from "~/services/apiService/shellApiFamily/credentials"
import { SHELL_LOG_QUERY_CONFIG } from "~/services/apiService/shellApiFamily/usageLogs"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"

/** Collect common Shell financial facts after checking the authenticated identity. */
export async function fetchShellAccountData(
  request: ApiServiceAccountRequest,
): Promise<AccountData> {
  const expectedUserId = normalizeAccountIdentity(request.auth.userId)
  if (!expectedUserId) {
    throw new ApiError(
      "The saved Shell account has no verifiable identity",
      undefined,
      "/api/user/self",
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  }
  const identity = await readGenericShellIdentity(request, expectedUserId)
  return collectAccountData(request, {
    balance: () =>
      fetchAccountBalance(request, async () => identity.user.quota),
    usage: (range) => fetchTodayUsage(request, SHELL_LOG_QUERY_CONFIG, range),
    income: (range) => fetchTodayIncome(request, SHELL_LOG_QUERY_CONFIG, range),
  })
}
