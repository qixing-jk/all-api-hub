import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import {
  encodeNovitaConsoleCredential,
  NOVITA_OPENAPI_ENDPOINTS,
  parseNovitaCredentials,
} from "~/services/apiService/novita/constants"
import {
  parseNovitaBalanceDetail,
  parseNovitaKeys,
  parseNovitaUserInfo,
  type NovitaApiKey,
  type NovitaBalanceDetail,
} from "~/services/apiService/novita/parsing"
import {
  fetchNovitaData,
  isNovitaAuthFailureError,
} from "~/services/apiService/novita/transport"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export * from "./accountData"
export * from "./constants"
export * from "./parsing"
export * from "./publicModelCatalog"
export * from "./responseError"
export * from "./transport"

/** Fetches the account identity identified by the saved API key. */
export async function fetchNovitaUserInfo(
  request: Parameters<typeof fetchNovitaData>[0],
): Promise<UserInfo> {
  return parseNovitaUserInfo(
    await fetchNovitaData<unknown>(request, NOVITA_OPENAPI_ENDPOINTS.userInfo),
  )
}

/** Verifies each supplied credential independently before admitting a pair. */
export async function verifyNovitaCredentials(
  request: ApiServiceRequest,
  expectedIdentity?: string,
): Promise<UserInfo> {
  const { apiKey, consoleToken } = parseNovitaCredentials(
    request.auth.accessToken,
  )
  const user = await fetchNovitaUserInfo(
    apiKey
      ? { ...request, auth: { ...request.auth, accessToken: apiKey } }
      : request,
  )
  if (expectedIdentity && user.id !== expectedIdentity) {
    throw new ApiError(
      "Novita account identity mismatch",
      undefined,
      undefined,
      API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
    )
  }
  if (apiKey && consoleToken) {
    const consoleUser = await fetchNovitaUserInfo({
      ...request,
      auth: {
        ...request.auth,
        accessToken: encodeNovitaConsoleCredential(consoleToken),
      },
    })
    if (user.id !== consoleUser.id) {
      throw new ApiError(
        "Novita account identity mismatch",
        undefined,
        undefined,
        API_ERROR_CODES.ACCOUNT_IDENTITY_MISMATCH,
      )
    }
  }
  return user
}

/** Fetches the account's cash/credit balance in USD. */
export async function fetchNovitaBalanceDetail(
  request: Parameters<typeof fetchNovitaData>[0],
): Promise<NovitaBalanceDetail> {
  return parseNovitaBalanceDetail(
    await fetchNovitaData<unknown>(
      request,
      NOVITA_OPENAPI_ENDPOINTS.balanceDetail,
    ),
  )
}

/** Lists the account's masked API keys with their policy summaries. */
export async function fetchNovitaKeys(
  request: Parameters<typeof fetchNovitaData>[0],
): Promise<NovitaApiKey[]> {
  return parseNovitaKeys(
    await fetchNovitaData<unknown>(request, NOVITA_OPENAPI_ENDPOINTS.keys, {
      // The console's own list call; summaries keep key facts complete.
      query: { includePolicySummary: true, includeIpAccessPolicy: true },
    }),
  )
}

export { isNovitaAuthFailureError }
