import { parseSub2ApiEnvelope } from "~/services/apiService/sub2api/parsing"
import { decodeSub2ApiResponseError } from "~/services/apiService/sub2api/responseError"
import {
  SUB2API_PUBLIC_SETTINGS_ENDPOINT,
  type Sub2ApiPublicSettingsData,
} from "~/services/apiService/sub2api/type"
import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types/auth"

/**
 * Reads deployment settings without account credentials.
 * Wei-Shaw/sub2api/backend/internal/handler/dto/settings.go owns this public DTO.
 */
export async function fetchSub2ApiPublicSettings(
  request: ApiServiceRequest,
): Promise<Sub2ApiPublicSettingsData | undefined> {
  const body = await fetchApi<unknown>(
    { ...request, auth: { authType: AuthTypeEnum.None } },
    {
      endpoint: SUB2API_PUBLIC_SETTINGS_ENDPOINT,
      options: { method: "GET", cache: "no-store" },
      errorResponseDecoder: decodeSub2ApiResponseError,
    },
  )

  return parseSub2ApiEnvelope<Sub2ApiPublicSettingsData>(
    body,
    SUB2API_PUBLIC_SETTINGS_ENDPOINT,
    { allowMissingData: true },
  )
}
