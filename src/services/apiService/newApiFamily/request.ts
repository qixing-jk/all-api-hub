import {
  fetchApi as fetchTransportApi,
  fetchApiData as fetchTransportApiData,
} from "~/services/apiTransport/request"
import type {
  ApiResponse,
  ApiTransportRequest,
  FetchApiOptions,
} from "~/services/apiTransport/type"
import type { TempWindowResponseType } from "~/types/tempWindowFetch"

import { decodeNewApiResponseError } from "./responseError"

type JsonFetchApiOptions = Omit<FetchApiOptions, "responseType"> & {
  responseType?: "json"
}

type NonJsonFetchApiOptions = Omit<FetchApiOptions, "responseType"> & {
  responseType: Exclude<TempWindowResponseType, "json">
}

const withNewApiResponseErrorDecoder = (
  options: FetchApiOptions,
): FetchApiOptions => ({
  ...options,
  errorResponseDecoder: decodeNewApiResponseError,
})

/** Fetches and unwraps New API-family data with its response decoder installed. */
export async function fetchApiData<T>(
  request: ApiTransportRequest,
  options: FetchApiOptions,
): Promise<T> {
  return await fetchTransportApiData<T>(
    request,
    withNewApiResponseErrorDecoder(options),
  )
}

export function fetchApi<T>(
  request: ApiTransportRequest,
  options: FetchApiOptions,
  normalResponseType: true,
): Promise<T>
export function fetchApi<T>(
  request: ApiTransportRequest,
  options: JsonFetchApiOptions,
  normalResponseType?: false,
): Promise<ApiResponse<T>>
export function fetchApi<T>(
  request: ApiTransportRequest,
  options: NonJsonFetchApiOptions,
  normalResponseType?: false,
): Promise<T>
export function fetchApi<T>(
  request: ApiTransportRequest,
  options: FetchApiOptions,
  normalResponseType?: false,
): Promise<ApiResponse<T> | T>
/** Fetches a New API-family response while preserving the selected return mode. */
export async function fetchApi<T>(
  request: ApiTransportRequest,
  options: FetchApiOptions,
  normalResponseType?: boolean,
): Promise<ApiResponse<T> | T> {
  const decodedOptions = withNewApiResponseErrorDecoder(options)
  return normalResponseType
    ? await fetchTransportApi<T>(request, decodedOptions, true)
    : await fetchTransportApi<T>(request, decodedOptions)
}
