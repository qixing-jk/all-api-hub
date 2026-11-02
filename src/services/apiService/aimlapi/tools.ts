import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { AuthTypeEnum } from "~/types"
import { isRecord } from "~/utils/core/object"

/** The console's public tool catalogue lives on its own host, not the inference API. */
export async function fetchAimlApiTools(signal?: AbortSignal) {
  const endpoint = "/v1/tools"
  const response = await fetchApiResponse<unknown>(
    {
      baseUrl: "https://tools.aimlapi.com",
      auth: { authType: AuthTypeEnum.None },
      abortSignal: signal,
    },
    {
      endpoint,
      options: { method: "GET", credentials: "omit" },
      currentTabTransport: "disabled",
    },
  )
  if (!response.ok)
    throw new ApiError(
      "Tool catalogue unavailable",
      response.status,
      endpoint,
      API_ERROR_CODES.HTTP_OTHER,
    )
  const body = response.body
  if (!isRecord(body) || !Array.isArray(body.data))
    throw new ApiError(
      "Invalid tool catalogue",
      undefined,
      endpoint,
      API_ERROR_CODES.JSON_PARSE_ERROR,
    )
  return body.data.map((raw) => {
    if (
      !isRecord(raw) ||
      typeof raw.id !== "string" ||
      !raw.id.trim() ||
      typeof raw.name !== "string"
    )
      throw new ApiError(
        "Invalid tool catalogue",
        undefined,
        endpoint,
        API_ERROR_CODES.JSON_PARSE_ERROR,
      )
    const title = raw.name.includes("__")
      ? raw.name.split("__").at(-1)!.replace(/_/g, " ")
      : raw.name
    return {
      value: raw.id,
      displayLabel: title
        ? title.charAt(0).toUpperCase() + title.slice(1)
        : raw.id,
      secondaryLabel: raw.id,
      badgeLabel: raw.id.split("/")[0],
    }
  })
}
