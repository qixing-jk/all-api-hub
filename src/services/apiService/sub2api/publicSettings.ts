import { fetchApi } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types/auth"

import { parseSub2ApiEnvelope } from "./parsing"
import { decodeSub2ApiResponseError } from "./responseError"
import {
  SUB2API_PUBLIC_SETTINGS_ENDPOINT,
  type Sub2ApiPublicSettingsData,
} from "./type"

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
